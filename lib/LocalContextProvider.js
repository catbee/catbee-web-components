'use strict';

const uuid = require('uuid');
const moduleHelper = require('./helpers/moduleHelper');

class LocalContextProvider {
  constructor () {
    /**
     * Context storage.
     * @type {Object}
     * @private
     */
    this._contextStorage = Object.create(null);

    /**
     * Current component id.
     * @type {String}
     * @private
     */
    this._currentId = null;
  }

  /**
   * Set current local context.
   * @param {Object} context
   * @param {String} [parentId]
   */
  setContext (context, parentId) {
    const id = uuid.v4();
    this._contextStorage[id] = {
      context: context,
      parentId: parentId
    };
    this._currentId = id;
  }

  /**
   * Cleanup context provider
   */
  dropContext () {
    this._contextStorage = Object.create(null);
    this._currentId = null;
  }

  /**
   * Return current context storage id.
   * @returns {String|null}
   */
  getCurrentId () {
    return this._currentId;
  }

  /**
   * Return context associated with current id.
   * @returns {Object|null}
   */
  getCurrentContext () {
    if (!this._currentId) {
      return null;
    }

    return this._contextStorage[this._currentId].context;
  }

  /**
   * Return descriptor associated with provided tag and parent id.
   * @param {String} tagName
   * @param {String} parentId
   * @returns {Object|null}
   */
  getContextByTagName (tagName, parentId) {
    const parentContext = this._contextStorage[parentId];
    const componentName = moduleHelper.getOriginalComponentName(tagName);

    if (!parentContext) {
      return null;
    }

    const { children } = parentContext.context;

    if (!children) {
      return null;
    }

    const child = children.find((child) => child.name === componentName);

    if (!child) {
      return null;
    }

    if (child.recursive) {
      return this._contextStorage[parentId].context;
    }

    const { name, component, watcher } = child;
    const props = this._getProps(child.props, child.parentPropsMap, parentId);

    return Object.assign({ name, watcher, props }, component);
  }

  /**
   * Get props for current component.
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
      let parentProps = this._contextStorage[parentId].context.props;

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
