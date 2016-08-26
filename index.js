const DocumentRenderer = require('./lib/DocumentRenderer');
const moduleHelper = require('./lib/helpers/moduleHelper');

module.exports = {
  /**
   * Register web components Document Renderer implementation and document component
   * @param {ServiceLocator} locator - Current service locator
   * @param {Object} documentComponent
   */
  register (locator, documentComponent) {
    locator.register('documentRenderer', DocumentRenderer, true);
    locator.registerInstance('documentComponent', Object.assign(
      {
        name: moduleHelper.DOCUMENT_COMPONENT_NAME
      }, documentComponent)
    );
  },

  DocumentRenderer
};
