const DocumentRenderer = require('./lib/DocumentRenderer');
const moduleHelper = require('./lib/helpers/moduleHelper');

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Document component is not register.';

module.exports = {
  /**
   * Register web components Document Renderer implementation and document component
   * @param {ServiceLocator} locator - Current service locator
   * @param {Object} documentComponent - Document component descriptor
   */
  register (locator, documentComponent) {
    if (!moduleHelper.isValidDescriptor(documentComponent)) {
      const eventBus = locator.resolve('eventBus');
      eventBus.emit('error', ERROR_MISSED_REQUIRED_COMPONENTS);
      return;
    }

    locator.register('documentRenderer', DocumentRenderer, true);
    locator.registerInstance('documentComponent', Object.assign(
      {
        name: moduleHelper.DOCUMENT_COMPONENT_NAME
      }, documentComponent)
    );
  },

  DocumentRenderer
};
