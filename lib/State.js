var Baobab = require('baobab');
var appstate = require('appstate');

class State {
  /**
   * Main class for control application state.
   * Use Baobab as main state storage and expose interface for state modification.
   * @constructor
   * @param {ServiceLocator} locator
   */
  constructor (locator) {
    this._locator = locator;
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');

    this.tree = new Baobab({}, this._config.baobab);
    this.signal = this.signal.bind(this);
  }

  /**
   * Find and run signal, after signal is resolved,
   * all result will pushed to history stack.
   * @param {Array} actions
   * @param {Object} routingContext
   * @param {Object} [args={}]
   * @return {Promise}
   */
  signal (actions, routingContext, args = {}) {
    return new Promise((resolve, reject) => {
      var signal = appstate.create(actions);

      signal(
        this.tree,
        {
          locator: this._locator,
          context: routingContext,
          tree: this.tree
        },
        args
      )
      .then((result) => {
        resolve();
        this._eventBus.emit('signalEnd', result);
      })
      .catch((error) => reject(error));
    });
  }

  /**
   * Get watcher from tree
   * @param {Object} definition
   * @return {Object}
   */
  getWatcher (definition) {
    return this.tree.watch(definition);
  }
}

module.exports = State;
