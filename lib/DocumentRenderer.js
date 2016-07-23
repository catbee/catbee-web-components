'use strict';

const ComponentReadable = require('./streams/ComponentReadable');

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Document component is not register.';

class DocumentRenderer {
  constructor (locator) {
    this._locator = locator;
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');
  }

  render (routingContext) {
    Promise.resolve()
      .then(() => {
        const document = this._locator.resolve('documentComponent');

        if (!document) {
          this._eventBus.emit('error', ERROR_MISSED_REQUIRED_COMPONENTS);
          routingContext.middleware.next();
          return;
        }

        const renderingContext = {
          routingContext, document,
          isDocumentRendered: false,
          isHeadRendered: false,
          config: this._config,
          eventBus: this._eventBus,
          locator: this._locator
        };

        const renderStream = new ComponentReadable(renderingContext);
        renderStream.renderDocument();

        renderStream
          .pipe(routingContext.middleware.response)
          .on('finish', () => this._eventBus.emit('documentRendered', routingContext));
      })
      .catch(reason => this._eventBus.emit('error', reason));
  }
}

module.exports = DocumentRenderer;
