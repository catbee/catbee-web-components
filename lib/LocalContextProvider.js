const uuid = require('uuid');
const moduleHelper = require('./helpers/moduleHelper');

class LocalContextProvider {
  constructor () {
    /**
     * Context storage
     * @type {Object}
     * @private
     */
    this._contextStorage = Object.create(null);

    /**
     * Parent-child relation storage
     * @type {Object}
     * @private
     */
    this._parentStorage = Object.create(null);

    /**
     * Current component id
     * @type {String}
     * @private
     */
    this._currentId = null;
  }

  /**
   * Set current iteration context
   * @param {Object} descriptor
   * @param {String} [parentId]
   * @returns {Promise.<String>}
   */
  setContext (descriptor, parentId) {
    const id = uuid.v4();
    this._contextStorage[id] = descriptor;

    if (parentId) {
      this._parentStorage[id] = parentId;
    }


    this._currentId = id;

    return Promise.resolve();
  }

  /**
   * Return current context storage id
   * @returns {String|null}
   */
  getCurrentId () {
    return this._currentId;
  }

  /**
   * Return parent id by child id
   * @returns {String|null}
   */
  getParentId (id) {
    return this._parentStorage[id];
  }

  /**
   * Drop current context
   */
  dropContext () {
    this._currentId = null;
  }

  /**
   * Get component associated with current context
   * @returns {Object|void}
   */
  getCurrentContextComponent () {
    if (!this._currentId) {
      return;
    }

    const context = this._contextStorage[this._currentId];

    return {
      name: context.name,
      constructor: context.constructor,
      watcher: context.watcher
    };
  }

  /**
   * Return descriptor associated with provided tag and id
   * @param {String} tagName
   * @param {String} parentId
   * @returns {Object|void}
   */
  getDescriptor (tagName, parentId) {
    const { children } = this._contextStorage[parentId];
    const componentName = moduleHelper.getOriginalComponentName(tagName);

    if (!children) {
      return;
    }

    const child = children.find((child) => child.name === componentName);

    if (!child) {
      return;
    }

    const { name, component } = child;
    const descriptor = Object.create(null);

    return Object.assign(descriptor, component, { name });
  }
}

module.exports = LocalContextProvider;
