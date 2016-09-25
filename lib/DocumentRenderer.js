'use strict';

const ComponentRenderer = require('./ComponentRenderer');

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Document component is not register.';

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

        const renderingContext = {
          routingContext,
          isDocumentRendered: false,
          isHeadRendered: false,
          locator: this._locator,
          eventBus: this._eventBus,
          config: this._config
        };

        middleware.response.on('finish', () =>
          this._eventBus.emit('documentRendered', routingContext));

        const renderer = new ComponentRenderer(renderingContext);

        renderer.renderDocument(documentComponent)
          .then((document) => {
            middleware.response.write(document);
            middleware.response.end();
          });
      })
      .catch((reason) => this._eventBus.emit('error', reason));
  }
}

module.exports = DocumentRenderer;
