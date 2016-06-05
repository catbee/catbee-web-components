var ComponentReadable = require('./streams/ComponentReadable');
var State = require('./State');

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Document component is not register.';

class DocumentRenderer {
  constructor (locator) {
    this._locator = locator;
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');
    this._document = this._loadDocumentComponent();
  }

  render (routingContext) {
    Promise.resolve()
      .then(() => {
        var state = new State(this._locator);

        if (!routingContext.args.signal) {
          return { state };
        }

        var { signal } = routingContext.args;
        return state.signal(signal, routingContext, routingContext.args)
          .then(({ asyncActionResults }) => ({ asyncActionResults, state }))
          .catch((error) => {
            this._eventBus.emit('error', error);
            // if signal throw error, in next then must be resolved by state anyway
            return { state };
          });
      })
      .then(({ asyncActionResults, state }) => {
        var renderingContext = {
          state,
          asyncActionResults,
          routingContext,
          isDocumentRendered: false,
          isHeadRendered: false,
          config: this._config,
          eventBus: this._eventBus,
          document: this._document,
          renderedIds: Object.create(null)
        };

        var renderStream = new ComponentReadable(renderingContext);
        renderStream.renderDocument();

        renderStream
          .pipe(routingContext.middleware.response)
          .on('finish', () => this._eventBus.emit('documentRendered', routingContext));
      })
      .catch(reason => this._eventBus.emit('error', reason));
  }

  _loadDocumentComponent () {
    var document = this._locator.resolve('documentComponent');

    if (!document) {
      this._eventBus.emit('error', ERROR_MISSED_REQUIRED_COMPONENTS);
      return;
    }

    return document;
  }
}

module.exports = DocumentRenderer;
