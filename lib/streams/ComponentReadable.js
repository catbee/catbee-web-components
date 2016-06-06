var stream = require('stream');
var Readable = stream.Readable;
var entities = require('entities');
var moduleHelper = require('../helpers/moduleHelper');
var errorHelper = require('../helpers/errorHelper');
var HTMLTagTokenizer = require('./../tokenizers/HTMLTagTokenizer');
var tagTokenizer = new HTMLTagTokenizer();
var HTMLTokenizer = require('./../tokenizers/HTMLTokenizer');
var tokenizer = new HTMLTokenizer();

const BODY_TAG = 'body';
const CONTENT_TYPE = 'text/html; charset=utf-8';
const POWERED_BY = 'Catbee';
const HTML_ENTITY_REFERENCE_REGEXP = /\&#?\w+;/ig;

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
    this._localContextRegistry = {};
    this._rendereredComponentsList = {};
    this._processingFoundTagPromise = null;
    this._delayedHTML = '';
    this._isFlushed = false;
    this._isCanceled = false;

    this.renderHTML = this.renderHTML.bind(this);
  }

  renderHTML (html) {
    tokenizer.setHTMLString(html);
    var tokenDescriptor;
    var queue = [];

    while ((tokenDescriptor = tokenizer.next()).value !== null) {
      tokenDescriptor = tokenDescriptor.state === 2 ? Object.assign({
        parent: this._currentComponent
      }, tokenDescriptor) : tokenDescriptor;
      queue.push(tokenDescriptor);
    }

    this._tokenQueue = queue.concat(this._tokenQueue);
    this._processingFoundTagPromise = null;

    this.read(0);
  }

  renderDocument () {
    // if we did not render anything then start from root template
    if (this._isCanceled || this._context.isDocumentRendered) {
      return;
    }

    this._processingFoundTagPromise = this._foundComponentHandler({
        name: moduleHelper.DOCUMENT_COMPONENT_NAME,
        attributes: Object.create(null)
      })
      .then(this.renderHTML);
  }

  _foundComponentHandler (tagDetails, parentComponent) {
    if (this._isCanceled) {
      return null;
    }

    if (tagDetails.name === BODY_TAG) {
      var inlineScript = this._context.routingContext.getInlineScript();
      var hydrationScript = this.getHydrationScript();

      return inlineScript || hydrationScript ? Promise.resolve(inlineScript + hydrationScript) : null;
    }

    this._currentComponent = moduleHelper.getOriginalComponentName(tagDetails.name);

    var isDocument = moduleHelper.isDocumentComponent(tagDetails.name);
    var isHead = moduleHelper.isHeadComponent(tagDetails.name);

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

    var component;

    if (isDocument) {
      component = this._context.document;
    } else {
      var descriptor = this._localContextRegistry[parentComponent]
        .find((descriptor) => descriptor.name === this._currentComponent);

      if (!descriptor) {
        return null;
      }

      if (descriptor.recursive) {
        component = this._rendereredComponentsList[parentComponent];
      } else {
        component = transformDescriptorToComponent(descriptor);
      }
    }

    if (!component) {
      return null;
    }

    // Save local context for current component
    this._rendereredComponentsList[this._currentComponent] = component;
    this._localContextRegistry[this._currentComponent] = component.children || [];

    var componentContext = Object.create(this._context);

    componentContext.currentComponent = component;
    componentContext.currentAttributes = tagDetails.attributes;

    return this._renderComponent(componentContext)
      .then(html => {
        if (!isDocument) {
          this._initializeResponse();
        }

        return html;
      });
  }

  _read () {
    if (this._processingFoundTagPromise) {
      this.push('');
      return;
    }

    if (this._tokenQueue.length === 0 || this._isCanceled) {
      this.push(null);
      return;
    }

    var toPush = '';

    while (this._tokenQueue.length > 0) {
      var tokenItem = this._tokenQueue.shift();

      if (tokenItem.state !== HTMLTokenizer.STATES.COMPONENT) {
        toPush += tokenItem.value;
        continue;
      }

      var tagDetails = this._parseTag(tokenItem.value);

      if (!tagDetails) {
        toPush += tokenItem.value;
        continue;
      }

      var processingPromise = this._foundComponentHandler(tagDetails, tokenItem.parent);

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

      this._processingFoundTagPromise =
        processingPromise.then(this.renderHTML);

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

  _parseTag (tagString) {
    tagTokenizer.setTagString(tagString);

    var current, currentString;
    var lastAttributeName = '';
    var tag = {
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

  _renderComponent (context) {
    var locator = context.routingContext.locator;
    var component = context.currentComponent;

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

    var renderMethod = moduleHelper.getMethodToInvoke(context.instance, 'render');
    var isDocument = moduleHelper.isDocumentComponent(component.name);
    var isHead = moduleHelper.isHeadComponent(component.name);

    context.eventBus.emit('componentRender', eventArgs);

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

  _handleComponentError (context, error) {
    // if application in debug mode then render
    // error text in component
    var isRelease = Boolean(context.config.isRelease);
    var component = context.currentComponent;

    if (!isRelease && error instanceof Error &&
      !moduleHelper.isDocumentComponent(component.name) &&
      !moduleHelper.isHeadComponent(component.name)) {
      context.eventBus.emit('error', error);
      return errorHelper.prettyPrint(error, context.instance.$context.userAgent);
    }

    context.eventBus.emit('error', error);
    return '';
  }

  _getComponentContext (context) {
    var attributes = context.currentAttributes;
    var componentContext = Object.create(context.routingContext);

    componentContext.element = null;
    componentContext.name = context.currentComponent.name;
    componentContext.attributes = attributes;
    componentContext.getComponentById = stub;
    componentContext.getComponentByElement = stub;
    componentContext.createComponent = stub;
    componentContext.collectGarbage = stub;
    componentContext.state = context.state.tree;
    componentContext.props = context.currentComponent.props;

    componentContext.getWatcherData = () => {
      if (!context.currentComponent.watcher) {
        return Promise.resolve();
      }

      var watcherData;

      if (typeof context.currentComponent.watcher === 'function') {
        var projection = context.currentComponent.watcher(attributes);
        watcherData = componentContext.state.project(projection);
      } else {
        watcherData = componentContext.state.project(context.currentComponent.watcher);
      }

      return Promise.resolve(watcherData);
    };

    return Object.freeze(componentContext);
  }

  _initializeResponse () {
    if (this._isFlushed) {
      return;
    }

    this._isFlushed = true;

    var routingContext = this._context.routingContext;
    var response = routingContext.middleware.response;

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

    var headers = {
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

  getHydrationScript () {
    if (!this._context.asyncActionResults) {
      return '';
    }

    try {
      return `<script>var CATBEE_CACHE = ${JSON.stringify(this._context.asyncActionResults)}</script>`;
    } catch (e) {
      this._eventBus.emit('error', e);
      return '';
    }
  }
}

/**
 * Transform parent descriptor to local component
 * @param {Object} descriptor
 * @returns {{name: String, constructor: Object, children: Array}|null}
 * @private
 */
function transformDescriptorToComponent (descriptor) {
  if (typeof descriptor !== 'object' || !descriptor.name || !descriptor.component) {
    return null;
  }

  return {
    name: descriptor.name,
    constructor: descriptor.component.constructor,
    children: descriptor.component.children || [],
    watcher: descriptor.watcher,
    props: descriptor.props || Object.create(null)
  }
}

function stub () {

}

module.exports = ComponentReadable;
