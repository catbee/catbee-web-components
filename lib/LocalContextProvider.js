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
    this._parentStorage[id] = parentId;
    this._currentId = id;

    return Promise.resolve();
  }

  /**
   * Set context by generated uuid
   * @param {Object} descriptor
   * @param {String} id
   * @param {String} [parentId]
   * @returns {Promise.<String>}
   */
  setContextById (descriptor, id, parentId) {
    this._contextStorage[id] = descriptor;
    this._parentStorage[id] = parentId;
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

    return this._contextStorage[this._currentId];
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

    if (child.recursive) {
      return this._contextStorage[parentId];
    }

    const { name, component, watcher } = child;
    const props = this._getProps(child.props, child.parentPropsMap, parentId);

    return Object.assign({ name, watcher, props }, component);
  }

  /**
   * Get props for current component
   * @param {Object} props
   * @param {Object} parentPropsMap
   * @param {String} parentId
   * @returns {*}
   * @private
   */
  _getProps (props, parentPropsMap, parentId) {
    let componentProps = Object.create(null);
    let inheritedFromParentProps;

    if (typeof parentPropsMap === 'object') {
      let parentProps = this._contextStorage[parentId].props;

      inheritedFromParentProps = Object
        .keys(parentPropsMap)
        .reduce((props, key) => {
          let value = parentProps[parentPropsMap[key]];

          if (!value) {
            return;
          }

          return Object.assign(props, { [key]: value });
        }, {});
    }

    return Object.assign(componentProps, props, inheritedFromParentProps);
  }
}

module.exports = LocalContextProvider;
