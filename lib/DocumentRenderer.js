'use strict';

const ServerRenderer = require('./ServerRenderer');

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

        const renderingContext = {
          routingContext,
          isDocumentRendered: false,
          isHeadRendered: false,
          locator: this._locator,
          eventBus: this._eventBus,
          config: this._config
        };

        middleware.response.on('finish', () => {
          this._eventBus.emit('documentRendered', routingContext);
        });

        const renderer = new ServerRenderer(renderingContext);
        renderer.renderDocument(documentComponent);
      })
      .catch((reason) => this._eventBus.emit('error', reason));
  }
}

module.exports = DocumentRenderer;
