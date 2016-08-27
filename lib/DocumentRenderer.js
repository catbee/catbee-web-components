'use strict';

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Document component is not register.';
const asyncWriter = require('async-writer');
const ComponentRenderer = require('./ComponentRenderer');

class DocumentRenderer {
  constructor (locator) {
    this._locator = locator;
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');
  }

  render (routingContext) {
    return Promise.resolve()
      .then(() => {
        const documentComponent = this._locator.resolve('documentComponent');
        const middleware = routingContext.middleware;

        if (!documentComponent) {
          this._eventBus.emit('error', ERROR_MISSED_REQUIRED_COMPONENTS);
          middleware.next();
          return;
        }

        const response = asyncWriter.create(middleware.response);

        const renderingContext = {
          routingContext,
          documentComponent,
          response,
          isDocumentRendered: false,
          isHeadRendered: false,
          locator: this._locator,
          eventBus: this._eventBus,
          config: this._config
        };

        response.on('finish', () => this._eventBus.emit('documentRendered', routingContext));

        const componentRenderer = new ComponentRenderer(renderingContext);
        componentRenderer.renderDocumentComponent();
      })
      .catch((reason) => this._eventBus.emit('error', reason));
  }
}

module.exports = DocumentRenderer;
