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
    this.renderHTML = this.renderHTML.bind(this);
  }

  /**
   * Handles the HTML from found tag handler.
   * @param {string} html - HTML.
   */
  renderHTML (html) {
    this._tokenizer.setHTMLString(html);
    let tokenDescriptor;
    let queue = [];
    let openSlotTag = false;

    while ((tokenDescriptor = this._tokenizer.next()).value !== null) {
      if (tokenDescriptor.state === HTMLTokenizer.STATES.COMPONENT) {
        if (openSlotTag) {
          let id = this._localContextProvider.getCurrentId();
          tokenDescriptor.parentId = this._localContextProvider.getParentId(id);
        } else {
          tokenDescriptor.parentId = this._localContextProvider.getCurrentId();
        }
      } else if (SLOT_CLOSING_TAG_REGEXP.test(tokenDescriptor.value)) {
        tokenDescriptor.isSlotClosingTag = true;
        openSlotTag = false;
      }

      if (tokenDescriptor.state === HTMLTokenizer.STATES.SLOT) {
        openSlotTag = true;
      }

      queue.push(tokenDescriptor);
    }

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
        return this._localContextProvider.setContext(this._context.document);
      })
      .then(() => this._foundComponentHandler({
        name: moduleHelper.DOCUMENT_COMPONENT_NAME,
        attributes: Object.create(null)
      }))
      .then(this.renderHTML);
  }

  /**
   * Handle founded component and render it to string.
   * @param {Object} tagDetails
   * @param {String} tagDetails.name - Component name.
   * @param {Object} tagDetails.attributes - Component attributes.
   * @param {String} [tagInnerHTML = '']
   * @returns {Promise}
   * @private
   */
  _foundComponentHandler (tagDetails, tagInnerHTML = '') {
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

    let component = this._localContextProvider.getCurrentContextComponent();

    if (!component) {
      return null;
    }

    let componentContext = Object.create(this._context);

    componentContext.currentComponent = component;
    componentContext.currentAttributes = tagDetails.attributes;

    return this._renderComponent(componentContext)
      .then((html) => {
        if (tagInnerHTML === '') {
          return html;
        }

        return this._fillSlotContent(html, tagInnerHTML);
      })
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

      // Collect innerHTML from current token queue
      let tagInnerHTML = this._collectComponentInnerHTML(tagDetails);

      // Change context for current component
      let descriptor = this._localContextProvider.getDescriptor(tagDetails.name, tokenItem.parentId);

      if (descriptor) {
        this._localContextProvider.setContext(descriptor, tokenItem.parentId);
      } else {
        this._localContextProvider.dropContext();
      }

      let processingPromise = this._foundComponentHandler(tagDetails, tagInnerHTML);

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

      this._processingFoundTagPromise = processingPromise.then(this.renderHTML);
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
    const component = context.currentComponent;

    if (typeof (component.constructor) !== 'function') {
      return Promise.resolve('');
    }

    component.constructor.prototype.$context = this._getComponentContext(context);

    try {
      context.instance = new component.constructor(locator);
    } catch (e) {
      return moduleHelper.getSafePromise(() => this._handleComponentError(context, e));
    }

    var eventArgs = {
      name: component.name,
      context: context.instance.$context
    };

    const renderMethod = moduleHelper.getMethodToInvoke(context.instance, 'render');
    const isDocument = moduleHelper.isDocumentComponent(component.name);
    const isHead = moduleHelper.isHeadComponent(component.name);

    this._context.eventBus.emit('componentRender', eventArgs);

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
        var inlineScript = !isDocument && !isHead ? context.instance.$context.getInlineScript() : '';
        return inlineScript + html;
      })
      .catch(reason => {
        return this._handleComponentError(context, reason);
      });
  }

  /**
   * Fill special tag <slot> with tag inner html.
   * @param {String} html - Rendered component html string.
   * @param {String} tagInnerHTML - HTML inside <cat-tag>html</cat-tag>.
   * @return {String} HTML with filled <slot></slot>.
   * @private
   */
  _fillSlotContent (html, tagInnerHTML) {
    this._tokenizer.setHTMLString(html);
    let tokenDescriptor;
    let resultHTML = '';
    let openSlotTag = false;

    while ((tokenDescriptor = this._tokenizer.next()).value !== null) {
      if (tokenDescriptor.state === HTMLTokenizer.STATES.SLOT) {
        resultHTML += tokenDescriptor.value;
        resultHTML += tagInnerHTML;
        openSlotTag = true;
        continue;
      }

      if (openSlotTag) {
        if (SLOT_CLOSING_TAG_REGEXP.test(tokenDescriptor.value)) {
          resultHTML += tokenDescriptor.value;
          openSlotTag = false;
        }
        continue;
      }

      resultHTML += tokenDescriptor.value;
    }

    return resultHTML;
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
    const component = context.currentComponent;

    if (!isRelease && error instanceof Error &&
      !moduleHelper.isDocumentComponent(component.name) &&
      !moduleHelper.isHeadComponent(component.name)) {
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
    componentContext.name = context.currentComponent.name;
    componentContext.attributes = attributes;
    componentContext.getComponentById = stub;
    componentContext.getComponentByElement = stub;
    componentContext.createComponent = stub;
    componentContext.collectGarbage = stub;
    componentContext.state = this._stateManager.tree;
    componentContext.props = context.currentComponent.props;

    componentContext.getWatcherData = () => {
      if (!context.currentComponent.watcher) {
        return Promise.resolve();
      }

      var watcherData;

      if (typeof context.currentComponent.watcher === 'function') {
        var projection = context.currentComponent.watcher.apply(null, [attributes]);
        watcherData = this._stateManager.project(projection);
      } else {
        watcherData = this._stateManager.project(context.currentComponent.watcher);
      }

      return Promise.resolve(watcherData);
    };

    return Object.freeze(componentContext);
  }

  /**
   * Collect HTML inside <cat-tag>.
   * @param {Object} tagDetails
   * @returns {String}
   * @private
   */
  _collectComponentInnerHTML (tagDetails) {
    const isCatComponent = moduleHelper.COMPONENT_PREFIX_REGEXP.test(tagDetails.name);
    let innerHTML = '';

    if (!isCatComponent) {
      return innerHTML;
    }

    const closeTagValue = `</${tagDetails.name}>`;

    while (this._tokenQueue.length > 0) {
      let currentToken = this._tokenQueue.shift();

      if (currentToken.value !== closeTagValue) {
        innerHTML += currentToken.value;
        continue;
      }

      this._tokenQueue.unshift(currentToken); // Return closing tag back to queue
      break;
    }

    return innerHTML;
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

    if (routingContext.actions.redirectedTo) {
      response.writeHead(302, {
        Location: routingContext.actions.redirectedTo
      });
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

    let headers = {
      'Content-Type': CONTENT_TYPE,
      'X-Powered-By': POWERED_BY
    };

    if (routingContext.cookie.setCookie.length > 0) {
      headers['Set-Cookie'] = routingContext.cookie.setCookie;
    }

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

    try {
      return `<script>var CATBEE_CACHE = ${JSON.stringify(this._asyncActionResults)}</script>`;
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
