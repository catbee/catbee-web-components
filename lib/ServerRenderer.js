'use strict';

const entities = require('entities');
const moduleHelper = require('./helpers/moduleHelper');
const errorHelper = require('./helpers/errorHelper');
const HTMLTagTokenizer = require('./tokenizers/HTMLTagTokenizer');
const HTMLTokenizer = require('./tokenizers/HTMLTokenizer');

const HTML_ENTITY_REFERENCE_REGEXP = /\&#?\w+;/ig;
const CONTENT_TYPE = 'text/html; charset=utf-8';
const POWERED_BY = 'Catbee';

const STATES = {
  COLLECT: 1, // Collect component innerHTML
  ITERATE: 2 // Iterate over tokens
};

const tokenizer = new HTMLTokenizer();
const tagTokenizer = new HTMLTagTokenizer();

class ServerRenderer {
  constructor (context) {
    this._context = context;
    this._isCanceled = false;
    this._tokenQueue = [];
    this._processingFoundTagPromise = null;
    this._result = '';
  }

  /**
   * Start render cycle
   * @param {Object} componentContext
   */
  renderDocument (componentContext) {
    // if we did not render anything then start from root template
    if (this._isCanceled || this._context.isDocumentRendered) {
      return;
    }

    return Promise.resolve()
      .then(() => {
        return this._foundComponentHandler({
          context: componentContext,
          attributes: Object.create(null)
        });
      })
      .then((renderingResult) => this._processRenderingResult(renderingResult))
      .then((html) => this._initializeResponse(html));
  }

  /**
   * Renders the component.
   * @param {Object} context - Component's rendering context.
   * @returns {Promise<String>} HTML.
   * @private
   */
  renderComponent (context) {
    const locator = context.routingContext.locator;
    const componentContext = context.currentComponentContext;

    if (typeof (componentContext.constructor) !== 'function') {
      return Promise.resolve('');
    }

    componentContext.constructor.prototype.$context = this._getComponentContext(context);
    componentContext.constructor.prototype.$children = this._getComponentChildren(componentContext);

    try {
      context.instance = new componentContext.constructor(locator);
    } catch (e) {
      return moduleHelper.getSafePromise(() => this._handleComponentError(context, e));
    }

    const renderMethod = moduleHelper.getMethodToInvoke(context.instance, 'render');
    const templateMethod = moduleHelper.getMethodToInvoke(context.instance, 'template');

    return moduleHelper.getSafePromise(renderMethod)
      .then((dataContext = {}) => moduleHelper.getSafePromise(templateMethod, dataContext))
      .then((html) => {
        const ERROR_MSG = `Template function should return string, component ${componentContext.name} will be ignored.`;

        if (typeof html !== 'string') {
          this._context.eventBus.emit('error', ERROR_MSG);
          return {
            instance: context.instance,
            html: ''
          };
        }

        return {
          instance: context.instance,
          html: html
        };
      })
      .catch((reason) => this._handleComponentError(context, reason));
  }

  /**
   * Process component rendering result and run next iteration of rendering
   * @param {Object} renderingResult
   */
  _processRenderingResult (renderingResult) {
    tokenizer.setHTMLString(renderingResult.html);

    const queue = [];

    let tokenDescriptor;
    let currentState = STATES.ITERATE;
    let currentCollector = null;

    while ((tokenDescriptor = tokenizer.next()).value !== null) {
      // Collect innerHTML for component, until found close tag
      if (currentState === STATES.COLLECT) {
        const closeTag = `</${currentCollector.tagDetails.name}>`;

        // Return to iterate mode if close tag founded
        if (tokenDescriptor.value === closeTag) {
          currentState = STATES.ITERATE;
          currentCollector = null;
        } else {
          // Collected nodes inside component, should not be presented in queue, they will be added later in slot
          currentCollector.slotContents += tokenDescriptor.value;
          continue;
        }
      }

      if (tokenDescriptor.state === HTMLTokenizer.STATES.COMPONENT) {
        let tagDetails = this._parseTag(tokenDescriptor.value);

        tokenDescriptor = Object.assign(tokenDescriptor, {
          parentComponent: renderingResult.instance,
          tagDetails: tagDetails,
          slotContents: ''
        });

        if (moduleHelper.isCatComponent(tagDetails.name)) {
          currentCollector = tokenDescriptor;
          currentState = STATES.COLLECT;
        }
      }

      queue.push(tokenDescriptor);
    }

    this._tokenQueue = queue.concat(this._tokenQueue);
    this._processingFoundTagPromise = null;

    return this._renderNextChunk();
  }

  /**
   * Render next chunk of token queue, if queue is empty end rendering and return rendering result.
   * @returns {Promise|String}
   * @private
   */
  _renderNextChunk () {
    while (this._tokenQueue.length > 0) {
      let tokenItem = this._tokenQueue.shift();

      if (tokenItem.state !== HTMLTokenizer.STATES.COMPONENT) {
        this._result += tokenItem.value;
        continue;
      }

      if (!tokenItem.tagDetails) {
        this._result += tokenItem.value;
        continue;
      }

      const componentName = moduleHelper.getOriginalComponentName(tokenItem.tagDetails.name);
      const componentContext = tokenItem.parentComponent.$children[componentName];

      let processingPromise = this._foundComponentHandler({
        context: componentContext,
        attributes: tokenItem.tagDetails.attributes
      });

      if (!processingPromise) {
        this._result += tokenItem.value;
        continue;
      }

      // we should open self-closed component tags
      // to set content into them
      if (tokenItem.tagDetails.isSelfClosed) {
        tokenItem.value = tokenItem.value.replace(/\/\w*>$/, '>');
        this._tokenQueue.unshift({
          token: HTMLTokenizer.STATES.CONTENT,
          value: `</${tokenItem.tagDetails.name}>`
        });
      }

      this._result += tokenItem.value;

      this._processingFoundTagPromise = processingPromise
        .then((renderingResult) => this._processRenderingResult(renderingResult));

      break;
    }

    if (!this._processingFoundTagPromise && this._tokenQueue.length === 0) {
      return this._result;
    }

    return this._processingFoundTagPromise;
  }

  /**
   * Handle founded component and render it to string.
   * @param {Object} componentDetails
   * @param {Object} componentDetails.context - Context rendering
   * @param {Object} componentDetails.attributes - Component attributes.
   * @returns {Promise}
   * @private
   */
  _foundComponentHandler (componentDetails) {
    if (this._isCanceled || !componentDetails.context) {
      return null;
    }

    let isDocument = moduleHelper.isDocumentComponent(componentDetails.context.name);
    let isHead = moduleHelper.isHeadComponent(componentDetails.context.name);

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

    let componentRenderingContext = Object.create(this._context);

    componentRenderingContext.currentComponentContext = componentDetails.context;
    componentRenderingContext.currentAttributes = componentDetails.attributes;

    return this.renderComponent(componentRenderingContext);
  }

  /**
   * Parses the entire HTML tag.
   * @param {String} tagString - Found tag token.
   * @returns {Object} Tag details.
   */
  _parseTag (tagString) {
    tagTokenizer.setTagString(tagString);

    let current, currentString;
    let lastAttributeName = '';
    let tag = {
      name: '',
      attributes: Object.create(null),
      isSelfClosed: false
    };

    while (true) {
      current = tagTokenizer.next();
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
   * Gets the component's context using basic context.
   * @param {Object} context - Rendering context.
   * @returns {Object} Component context.
   * @private
   */
  _getComponentContext (context) {
    const attributes = context.currentAttributes;

    let componentContext = Object.create(context.routingContext);

    componentContext.element = null;
    componentContext.name = context.currentComponentContext.name;
    componentContext.attributes = attributes;
    componentContext.getComponentById = stub;
    componentContext.getComponentByElement = stub;
    componentContext.createComponent = stub;
    componentContext.collectGarbage = stub;

    return Object.freeze(componentContext);
  }

  /**
   * Gets the component's children contexts
   * @param {Object} componentContext
   * @private
   */
  _getComponentChildren (componentContext) {
    if (!componentContext.children) {
      return Object.create(null);
    }

    return componentContext.children.reduce((children, child) => {
      return Object.assign(children, {
        [child.name]: Object.assign({
          props: child.props,
          name: child.name
        }, child.component)
      })
    }, Object.create(null));
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
    const componentContext = context.currentComponentContext;

    if (!isRelease && error instanceof Error &&
      !moduleHelper.isDocumentComponent(componentContext.name) &&
      !moduleHelper.isHeadComponent(componentContext.name)) {
      this._context.eventBus.emit('error', error);

      return {
        instance: context.instance,
        html: errorHelper.prettyPrint(error, context.instance.$context.userAgent)
      };
    }

    this._context.eventBus.emit('error', error);

    return {
      instance: context.instance,
      html: ''
    };
  }

  /**
   * Initializes and send a HTTP response with the required code and headers.
   * @param {String} html
   * @private
   */
  _initializeResponse (html) {
    const routingContext = this._context.routingContext;
    const response = routingContext.middleware.response;

    let headers = {};

    if (routingContext.cookie.setCookie.length > 0) {
      headers['Set-Cookie'] = routingContext.cookie.setCookie;
    }

    if (routingContext.actions.redirectedTo) {
      headers['Location'] = routingContext.actions.redirectedTo;

      response.writeHead(302, headers);
      response.end();

      routingContext.actions.redirectedTo = '';
      this._isCanceled = true;
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
    response.end(html);
    routingContext.cookie.setCookie = [];
  }
}

/**
 * Does nothing as a stub method.
 * @returns {null} Always null.
 */
function stub () {
  return null;
}

module.exports = ServerRenderer;
