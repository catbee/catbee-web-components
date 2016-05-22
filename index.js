var DocumentRenderer = require('./lib/DocumentRenderer');

module.exports = {
  register (locator, documentComponent) {
    locator.register('documentRenderer', DocumentRenderer, true);
    locator.register('documentComponent', documentComponent);
  },

  DocumentRenderer
};
