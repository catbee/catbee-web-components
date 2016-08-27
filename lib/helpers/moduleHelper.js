const helper = {
  DOCUMENT_COMPONENT_NAME: 'document',
  DOCUMENT_ELEMENT_NAME: 'html',
  DOCUMENT_TAG_NAME: 'HTML',
  HEAD_TAG_NAME: 'HEAD',
  HEAD_COMPONENT_NAME: 'head',

  /**
   * Determines if specified component name is the "document" component name.
   * @param {string} componentName - Name of the component.
   * @returns {boolean} True if specified component is the "document" component.
   */
  isDocumentComponent (componentName) {
    return componentName.toLowerCase() === helper.DOCUMENT_COMPONENT_NAME;
  },

  /**
   * Determines if specified component name is the "head" component name.
   * @param {string} componentName - Name of the component.
   * @returns {boolean} True if specified component is the "head" component.
   */
  isHeadComponent (componentName) {
    return componentName.toLowerCase() === helper.HEAD_COMPONENT_NAME;
  },

  /**
   * Gets method of the module that can be invoked.
   * @param {Object} module - Module implementation.
   * @param {String} prefix - Method prefix (i.e. handle).
   * @param {String?} name - Name of the entity to invoke method for (will be converted to camel casing).
   * @returns {Function} Method to invoke.
   */
  getMethodToInvoke (module, prefix, name) {
    if (!module || typeof (module) !== 'object') {
      return defaultPromiseMethod;
    }

    const methodName = helper.getCamelCaseName(prefix, name);

    if (typeof (module[methodName]) === 'function') {
      return module[methodName].bind(module);
    }

    if (typeof (module[prefix]) === 'function') {
      return module[prefix].bind(module, name);
    }

    return defaultPromiseMethod;
  },

  /**
   * Gets name in camel casing for everything.
   * @param {String} prefix - Prefix for the name.
   * @param {String} name - Name to convert.
   * @return {String}
   */
  getCamelCaseName (prefix, name) {
    if (!name) {
      return '';
    }

    var parts = name.split(/[^a-z0-9]/i);
    var camelCaseName = String(prefix || '');

    parts.forEach((part) => {
      if (!part) {
        return;
      }

      // first character in method name must be in lowercase
      camelCaseName += camelCaseName ? part[0].toUpperCase() : part[0].toLowerCase();
      camelCaseName += part.substring(1);
    });

    return camelCaseName;
  },

  /**
   * Gets safe promise resolved from action.
   * @param {Function} action Action to wrap with safe promise.
   * @param {Array} args Function arguments
   * @returns {Promise}
   */
  getSafePromise (action, ...args) {
    let result;

    try {
      result = action(...args);
    } catch (e) {
      return Promise.reject(e);
    }

    return Promise.resolve(result);
  }
};

/**
 * Just returns resolved promise.
 * @returns {Promise} Promise for nothing.
 */
function defaultPromiseMethod () {
  return Promise.resolve();
}

module.exports = helper;
