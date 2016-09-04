'use strict';

const Baobab = require('baobab');
const appstate = require('appstate');

class StateManager {
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
    this._currentRoutingContext = null;

    /**
     * Baobab tree instance
     * @type {Baobab}
     */
    this.tree = new Baobab({}, this._config.baobab);

    this.signal = this.signal.bind(this);
  }

  /**
   * Generate and run signal, after signal is resolved,
   * all result will pushed to history stack.
   * @param {Array} actions
   * @param {Object} [args={}]
   * @param {Array} asyncActionResults
   * @return {Promise}
   */
  signal (actions, args = {}, asyncActionResults) {
    var signal = appstate.create(actions);

    return signal(
      this.tree,
      {
        locator: this._locator,
        context: this._currentRoutingContext,
        tree: this.tree
      },
      args,
      asyncActionResults
    )
    .then((result) => {
      this._eventBus.emit('signalEnd', result);
      return result.asyncActionResults;
    })
    .catch((error) => {
      this._eventBus.emit('error', error);
    });
  }

  /**
   * Update routing context to actual.
   * @param {Object} routingContext
   * @return {Promise}
   */
  setRoutingContext (routingContext) {
    this._currentRoutingContext = routingContext;
    return Promise.resolve();
  }

  /**
   * Get watcher from tree.
   * @param {Object} definition
   * @return {Object}
   */
  getWatcher (definition) {
    return this.tree.watch(definition);
  }

  /**
   * Project tree data.
   * @param {Object} definition
   * @returns {Object}
   */
  project (definition) {
    return this.tree.project(definition);
  }
}

module.exports = StateManager;
