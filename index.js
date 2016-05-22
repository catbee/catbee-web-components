var DocumentRenderer = require('./lib/DocumentRenderer');

module.exports = {
  register (locator, documentComponent) {
    locator.register('documentRenderer', DocumentRenderer, true);
    locator.registerInstance('documentComponent', Object.assign(
      {
        name: 'document'
      },
      documentComponent
    ));
  },

  DocumentRenderer
};
