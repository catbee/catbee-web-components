'use strict';

const uuid = require('uuid');

class LocalContextProvider {
  constructor () {
    /**
     * Context storage.
     * @type {Object}
     * @private
     */
    this._storage = Object.create(null);

    /**
     * Current component id.
     * @type {String}
     * @private
     */
    this._currentId = null;
  }

  setContext (context, parentId) {
    const id = uuid.v4();
    this._storage[id] = { context, parentId };
    this._currentId = id;
  }

  /**
   * Return context associated with current id.
   * @returns {Object|null}
   */
  getCurrentContext () {
    if (!this._currentId) {
      return null;
    }

    return this._storage[this._currentId].context;
  }
}

module.exports = LocalContextProvider;
