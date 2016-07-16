const DocumentRenderer = require('./lib/DocumentRenderer');
const moduleHelper = require('./lib/helpers/moduleHelper');

module.exports = {
  /**
   * Register web components Document Renderer implementation and document component
   * @param {ServiceLocator} locator - Current service locator
   * @param {Object} document - Document component descriptor
   */
  register (locator, document) {
    locator.register('documentRenderer', DocumentRenderer, true);
    locator.registerInstance('documentComponent', Object.assign(
      { name: moduleHelper.DOCUMENT_COMPONENT_NAME }, document)
    );
  },
  DocumentRenderer
};
