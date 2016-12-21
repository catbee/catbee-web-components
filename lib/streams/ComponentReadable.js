'use strict';

const stream = require('stream');
const Readable = stream.Readable;
const entities = require('entities');
const moduleHelper = require('../helpers/moduleHelper');
const errorHelper = require('../helpers/errorHelper');
const HTMLTagTokenizer = require('../tokenizers/HTMLTagTokenizer');
const HTMLTokenizer = require('../tokenizers/HTMLTokenizer');
const LocalContextProvider = require('../LocalContextProvider');
const StateManager = require('../StateManager');
const serialize = require('serialize-javascript');

const BODY_TAG = 'body';
const CONTENT_TYPE = 'text/html; charset=utf-8';
const POWERED_BY = 'Catbee';
const HTML_ENTITY_REFERENCE_REGEXP = /\&#?\w+;/ig;
const SLOT_CLOSING_TAG_REGEXP = /^<((\/slot)[\s/>])/i;

class ComponentReadable extends Readable {
  /**
   * Creates new instance of the parser duplex stream.
   * @param {Object} context Rendering parameters.
   * @param {Object?} options Stream options.
   * @constructor
   * @extends Readable
   */
  constructor (context, options) {
    super(options);

    this._context = context;
    this._tokenQueue = [];
    this._slotContent = [];
    this._processingFoundTagPromise = null;
    this._asyncActionResults = null;
    this._delayedHTML = '';
    this._isFlushed = false;
    this._isCanceled = false;

    this._tokenizer = new HTMLTokenizer();
    this._tagTokenizer = new HTMLTagTokenizer();
    this._localContextProvider = new LocalContextProvider();
    this._stateManager = new StateManager(context.locator);

    this._stateManager.setRoutingContext(context.routingContext);
  }

  /**
   * Handles the HTML from found tag handler.
   * @param {string} html - HTML.
   */
  renderHTML (html) {
    this._tokenizer.setHTMLString(html);
    let tokenDescriptor;
    let queue = [];

    while ((tokenDescriptor = this._tokenizer.next()).value !== null) {
      if (tokenDescriptor.state === HTMLTokenizer.STATES.COMPONENT) {
        tokenDescriptor = Object.assign({
          parentId: this._localContextProvider.getCurrentId()
        }, tokenDescriptor);
      } // Assign parent id to children components.

      if (tokenDescriptor.state === HTMLTokenizer.STATES.SLOT && this._slotContent.length > 0) {
        let slotQueue = this._fillSlotContent(tokenDescriptor);
        queue = queue.concat(slotQueue);
      } else {
        queue.push(tokenDescriptor);
      }
    }

    this._slotContent = []; // Flush unused slot content
    this._tokenQueue = queue.concat(this._tokenQueue);
    this._processingFoundTagPromise = null;

    this.read(0);
  }

  /**
   * Starts rendering the document template.
   */
  renderDocument () {
    // if we did not render anything then start from root template
    if (this._isCanceled || this._context.isDocumentRendered) {
      return;
    }

    const { args } = this._context.routingContext;
    const { signal } = args;

    this._processingFoundTagPromise = Promise.resolve()
      .then(() => {
        if (!signal) {
          return;
        }

        return this._stateManager.signal(signal, args);
      })
      .catch((e) => {
        this._context.eventBus.emit('error', e);
      })
      .then((asyncActionResults) => {
        this._asyncActionResults = asyncActionResults;
        this._localContextProvider.setContext(this._context.document);

        return this._foundComponentHandler({
          name: moduleHelper.DOCUMENT_COMPONENT_NAME,
          context: this._localContextProvider.getCurrentContext(),
          attributes: Object.create(null)
        });
      })
      .then((html) => this.renderHTML(html));
  }

  /**
   * Handle founded component and render it to string.
   * @param {Object} tagDetails
   * @param {String} tagDetails.name - Component name.
   * @param {Object} tagDetails.context - Local context associated with current tag.
   * @param {Object} tagDetails.attributes - Component attributes.
   * @returns {Promise}
   * @private
   */
  _foundComponentHandler (tagDetails) {
    if (this._isCanceled) {
      return null;
    }

    if (tagDetails.name === BODY_TAG) {
      let inlineScript = this._context.routingContext.getInlineScript();
      let hydrationScript = this._getHydrationScript();

      if (inlineScript || hydrationScript) {
        return Promise.resolve(inlineScript + hydrationScript);
      }

      return null;
    }

    let isDocument = moduleHelper.isDocumentComponent(tagDetails.name);
    let isHead = moduleHelper.isHeadComponent(tagDetails.name);

    if (isDocument) {
      if (this._context.isDocumentRendered) {
        return null;
      }
      this._context.isDocumentRendered = true;
    } else if (isHead) {
      if (this._context.isHeadRendered) {
        return null;
      }
      this._context.isHeadRendered = true;
    }

    let localContext = tagDetails.context;

    if (!localContext) {
      return null;
    }

    let componentRenderingContext = Object.create(this._context);

    componentRenderingContext.currentLocalContext = localContext;
    componentRenderingContext.currentAttributes = tagDetails.attributes;

    return this._renderComponent(componentRenderingContext)
      .then(html => {
        if (!isDocument) {
          this._initializeResponse();
        }

        return html;
      });
  }

  /**
   * Reads the next chunk of data from this stream.
   * @private
   */
  _read () {
    if (this._processingFoundTagPromise) {
      this.push('');
      return;
    }

    if (this._tokenQueue.length === 0 || this._isCanceled) {
      this.push(null);
      return;
    }

    let toPush = '';

    while (this._tokenQueue.length > 0) {
      let tokenItem = this._tokenQueue.shift();

      if (tokenItem.state !== HTMLTokenizer.STATES.COMPONENT) {
        toPush += tokenItem.value;
        continue;
      }

      let tagDetails = this._parseTag(tokenItem.value);

      if (!tagDetails) {
        toPush += tokenItem.value;
        continue;
      }

      let localContext = this._localContextProvider.getContextByTagName(tagDetails.name, tokenItem.parentId);
      this._slotContent = this._collectComponentInnerHTML(tagDetails, tokenItem.parentId);

      if (localContext) {
        this._localContextProvider.setContext(localContext, tokenItem.parentId);
      }

      let processingPromise = this._foundComponentHandler({
        name: tagDetails.name,
        context: localContext,
        attributes: tagDetails.attributes
      });

      if (!processingPromise) {
        toPush += tokenItem.value;
        continue;
      }

      // we should open self-closed component tags
      // to set content into them
      if (tagDetails.isSelfClosed) {
        tokenItem.value = tokenItem.value.replace(/\/\w*>$/, '>');
        this._tokenQueue.unshift({
          token: HTMLTokenizer.STATES.CONTENT,
          value: '</' + tagDetails.name + '>'
        });
      }

      toPush += tokenItem.value;

      this._processingFoundTagPromise = processingPromise
        .then((html) => this.renderHTML(html))
        .catch((e) => this._context.eventBus.emit('error', e));

      break;
    }

    if (this._isFlushed) {
      this.push(toPush);
      return;
    }

    this._delayedHTML += toPush;

    if (!this._processingFoundTagPromise && this._tokenQueue.length === 0) {
      this._initializeResponse();
    }
  }

  /**
   * Parses the entire HTML tag.
   * @param {String} tagString - Found tag token.
   * @returns {Object} Tag details.
   */
  _parseTag (tagString) {
    this._tagTokenizer.setTagString(tagString);

    let current, currentString;
    let lastAttributeName = '';
    let tag = {
      name: '',
      attributes: Object.create(null),
      isSelfClosed: false
    };

    while (true) {
      current = this._tagTokenizer.next();
      switch (current.state) {
        case HTMLTagTokenizer.STATES.TAG_NAME:
          tag.name = tagString
            .substring(current.start, current.end)
            .toLowerCase();
          break;
        case HTMLTagTokenizer.STATES.ATTRIBUTE_NAME:
          currentString = tagString
            .substring(current.start, current.end)
            .toLowerCase();
          tag.attributes[currentString] = true;
          lastAttributeName = currentString;
          break;
        case HTMLTagTokenizer.STATES.ATTRIBUTE_VALUE_DOUBLE_QUOTED:
        case HTMLTagTokenizer.STATES.ATTRIBUTE_VALUE_SINGLE_QUOTED:
        case HTMLTagTokenizer.STATES.ATTRIBUTE_VALUE_UNQUOTED:
          currentString = tagString
            .substring(current.start, current.end)
            .replace(HTML_ENTITY_REFERENCE_REGEXP, entities.decode);
          tag.attributes[lastAttributeName] = currentString;
          break;
        case HTMLTagTokenizer.STATES.SELF_CLOSING_START_TAG_STATE:
          tag.isSelfClosed = true;
          break;
        case HTMLTagTokenizer.STATES.TAG_CLOSE:
          return tag;
        case HTMLTagTokenizer.STATES.ILLEGAL:
          return null;
      }
    }
  }

  /**
   * Renders the component.
   * @param {Object} context - Component's rendering context.
   * @returns {Promise<string>} HTML.
   * @private
   */
  _renderComponent (context) {
    const locator = context.routingContext.locator;
    const localContext = context.currentLocalContext;

    if (typeof (localContext.constructor) !== 'function') {
      return Promise.resolve('');
    }

    localContext.constructor.prototype.$context = this._getComponentContext(context);

    try {
      context.instance = new localContext.constructor(locator);
    } catch (e) {
      return moduleHelper.getSafePromise(() => this._handleComponentError(context, e));
    }

    const renderMethod = moduleHelper.getMethodToInvoke(context.instance, 'render');
    const isDocument = moduleHelper.isDocumentComponent(localContext.name);
    const isHead = moduleHelper.isHeadComponent(localContext.name);

    this._context.eventBus.emit('componentRender', localContext.name);

    return moduleHelper.getSafePromise(renderMethod)
      // if data context has been returned
      // then render template
      .then(dataContext => {
        dataContext = dataContext || Object.create(null);
        return context.instance.template ? context.instance.template(dataContext) : '';
      })
      // if template has been rendered
      // component has been successfully rendered then return html
      .then(html => {
        let inlineScript = !isDocument && !isHead ? context.instance.$context.getInlineScript() : '';
        this._context.eventBus.emit('componentRendered', localContext.name);

        return inlineScript + html;
      })
      .catch(reason => {
        return this._handleComponentError(context, reason);
      });
  }

  /**
   * Handles a rendering error.
   * @param {Object} context - Rendering context.
   * @param {Error} error - Rendering error.
   * @private
   */
  _handleComponentError (context, error) {
    // if application in debug mode then render
    // error text in component
    const isRelease = Boolean(context.config.isRelease);
    const localContext = context.currentLocalContext;

    if (!isRelease && error instanceof Error &&
      !moduleHelper.isDocumentComponent(localContext.name) &&
      !moduleHelper.isHeadComponent(localContext.name)) {
      this._context.eventBus.emit('error', error);
      return errorHelper.prettyPrint(error, context.instance.$context.userAgent);
    }

    this._context.eventBus.emit('error', error);
    return '';
  }

  /**
   * Gets the component's context using basic context.
   * @param {Object} context - Rendering context.
   * @returns {Object} Component context.
   * @private
   */
  _getComponentContext (context) {
    const attributes = context.currentAttributes;
    let componentContext = Object.create(context.routingContext);

    componentContext.element = null;
    componentContext.name = context.currentLocalContext.name;
    componentContext.attributes = attributes;
    componentContext.getComponentById = stub;
    componentContext.getComponentByElement = stub;
    componentContext.createComponent = stub;
    componentContext.collectGarbage = stub;
    componentContext.state = this._stateManager.tree;
    componentContext.props = context.currentLocalContext.props;
    componentContext.forceUpdate = stub;

    componentContext.getWatcherData = () => {
      if (!context.currentLocalContext.watcher) {
        return Promise.resolve();
      }

      var watcherData;

      if (typeof context.currentLocalContext.watcher === 'function') {
        var projection = context.currentLocalContext.watcher.apply(null, [attributes]);
        watcherData = this._stateManager.project(projection);
      } else {
        watcherData = this._stateManager.project(context.currentLocalContext.watcher);
      }

      return Promise.resolve(watcherData);
    };

    return Object.freeze(componentContext);
  }

  /**
   * Collect HTML tokens inside <cat-tag>.
   * @param {Object} tagDetails
   * @param {String} parentId
   * @returns {Array}
   * @private
   */
  _collectComponentInnerHTML (tagDetails, parentId) {
    const isCatComponent = moduleHelper.COMPONENT_PREFIX_REGEXP.test(tagDetails.name);
    let innerHTML = [];

    if (!isCatComponent) {
      return innerHTML;
    }

    const closeTagValue = `</${tagDetails.name}>`;

    while (this._tokenQueue.length > 0) {
      let currentToken = this._tokenQueue.shift();

      if (currentToken.state === HTMLTokenizer.STATES.COMPONENT) {
        currentToken = Object.assign({ parentId }, currentToken);
      }

      if (currentToken.value !== closeTagValue) {
        innerHTML.push(currentToken);
        continue;
      }

      this._tokenQueue.unshift(currentToken); // Return closing tag back to queue
      break;
    }

    return innerHTML;
  }

  /**
   * Fill <slot> tag content and return it as token array.
   * @param {Object} slotToken
   * @return {Array}
   * @private
   */
  _fillSlotContent (slotToken) {
    let currentToken;
    let queue = [];
    queue.push(slotToken); // Open <slot> tag.

    while ((currentToken = this._tokenizer.next()).value !== null) {
      if (SLOT_CLOSING_TAG_REGEXP.test(currentToken.value)) {
        queue = queue.concat(this._slotContent); // Fill <slot> content.
        queue.push(currentToken); // Close <slot> tag.
        break;
      }
    }

    return queue;
  }

  /**
   * Initializes a HTTP response with the required code and headers.
   * @private
   */
  _initializeResponse () {
    if (this._isFlushed) {
      return;
    }

    this._isFlushed = true;

    const routingContext = this._context.routingContext;
    const response = routingContext.middleware.response;

    let headers = {};

    if (routingContext.cookie.setCookie.length > 0) {
      headers['Set-Cookie'] = routingContext.cookie.setCookie;
    }

    if (routingContext.actions.redirectedTo) {
      headers['Location'] = routingContext.actions.redirectedTo;

      response.writeHead(302, headers);
      routingContext.actions.redirectedTo = '';
      this._isCanceled = true;
      this.push(null);
      return;
    }

    if (routingContext.actions.isNotFoundCalled) {
      routingContext.actions.isNotFoundCalled = false;
      this._isCanceled = true;
      routingContext.middleware.next();
      return;
    }

    headers['Content-Type'] = CONTENT_TYPE;
    headers['X-Powered-By'] = POWERED_BY;

    response.writeHead(200, headers);
    routingContext.cookie.setCookie = [];

    if (this._delayedHTML) {
      this.push(this._delayedHTML);
      this._delayedHTML = '';
    }
  }

  /**
   * Get current tree state and generate inline hydration script for browser.
   * @returns {String}
   * @private
   */
  _getHydrationScript () {
    if (!this._asyncActionResults) {
      return '';
    }

    const serializedCache = serialize(this._asyncActionResults, { isJSON: true });

    try {
      return `<script>var CATBEE_CACHE = ${serializedCache}</script>`;
    } catch (e) {
      this._context.eventBus.emit('error', e);
      return '';
    }
  }
}

/**
 * Does nothing as a stub method.
 * @returns {null} Always null.
 */
function stub () {
  return null;
}

module.exports = ComponentReadable;
