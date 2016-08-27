'use strict';

const LocalContextProvider = require('./LocalContextProvider');
const moduleHelper = require('./helpers/moduleHelper');
const errorHelper = require('./helpers/errorHelper');
const HTMLTagTokenizer = require('./tokenizers/HTMLTagTokenizer');
const HTMLTokenizer = require('./tokenizers/HTMLTokenizer');

const tokenizer = new HTMLTokenizer();
const tagTokenizer = new HTMLTagTokenizer();

class ComponentRenderer {
  constructor (context) {
    this._context = context;
    this._isCanceled = false;
    this._localContextProvider = new LocalContextProvider();
  }

  renderDocumentComponent () {
    if (this._isCanceled || this._context.isDocumentRendered) {
      return;
    }

    Promise.resolve()
      .then(() => {
        this._localContextProvider.setContext(this._context.documentComponent);

        return this._foundComponentHandler({
          context: this._localContextProvider.getCurrentContext(),
          attributes: Object.create(null)
        });
      })
      .then((html) => this.processHTML(html))
      .catch((e) => console.log(e));
  }

  /**
   * @param {String} html
   */
  processHTML (html) {
    tokenizer.setHTMLString(html);
    const queue = [];
    let tokenDescriptor;

    while ((tokenDescriptor = tokenizer.next()).value !== null) {
      queue.push(tokenDescriptor);
    }

    this._tokenQueue = queue.concat(this._tokenQueue);
  }

  /**
   * Handle founded component and render it to string.
   * @param {Object} componentDetails
   * @param {Object} componentDetails.context - Local context associated with current tag.
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

    const localContext = componentDetails.context;

    let componentRenderingContext = Object.create(this._context);

    componentRenderingContext.currentLocalContext = localContext;
    componentRenderingContext.currentAttributes = componentDetails.attributes;

    return this._renderComponent(componentRenderingContext);
  }

  /**
   * Renders the component.
   * @param {Object} context - Component's rendering context.
   * @returns {Promise<String>} HTML.
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
    const templateMethod = moduleHelper.getMethodToInvoke(context.instance, 'template');

    return moduleHelper.getSafePromise(renderMethod)
      .then((dataContext = {}) => moduleHelper.getSafePromise(templateMethod, dataContext))
      .then((html) => {
        const ERROR_MSG = `Template function should return string, component ${localContext.name} will be ignored.`;

        if (typeof html !== 'string') {
          this._context.eventBus.emit('error', ERROR_MSG);
          return '';
        }

        return html;
      })
      .catch((reason) => this._handleComponentError(context, reason));
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

    return Object.freeze(componentContext);
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
}

/**
 * Does nothing as a stub method.
 * @returns {null} Always null.
 */
function stub () {
  return null;
}

module.exports = ComponentRenderer;
