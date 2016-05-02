var ComponentReadable = require('./streams/ComponentReadable');
var State = require('./State');

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Required components (document or head) is not register.';

class DocumentRenderer {
  constructor (locator) {
    this._locator = locator;
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');
    this._components = this._loadRequiredComponents() || [];
  }

  render (routingContext) {
    Promise.resolve()
      .then(() => {
        var state = new State(this._locator);

        if (!routingContext.args.signal) {
          return state;
        }

        var { signal } = routingContext.args;
        return state.signal(signal, routingContext, routingContext.args)
          .then(() => state)
          .catch((error) => this._eventBus.emit('error', error));
      })
      .then((state) => {
        var renderingContext = {
          state,
          routingContext,
          isDocumentRendered: false,
          isHeadRendered: false,
          config: this._config,
          eventBus: this._eventBus,
          components: this._components,
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

  _loadRequiredComponents () {
    var document = this._locator.resolve('documentComponent');
    var head = this._locator.resolve('headComponent');

    if (!document || !head) {
      this._eventBus.emit('error', ERROR_MISSED_REQUIRED_COMPONENTS);
      return;
    }

    return { document, head };
  }
}

module.exports = DocumentRenderer;
