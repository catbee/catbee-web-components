var Lab = require('lab');
var lab = exports.lab = Lab.script();
var assert = require('assert');
var events = require('events');
var jsdom = require('jsdom');
var appstate = require('appstate');
var fs = require('fs');
var ServiceLocator = require('catberry-locator');
var DocumentRenderer = require('../../browser/DocumentRenderer');

lab.experiment('browser/DocumentRenderer', () => {
  lab.experiment('#initWithState', () => {
    lab.test('should init and bind all components in right order', (done) => {
      var html = fs.readFileSync(__dirname + '/../cases/browser/DocumentRenderer/initWithState.html');

      var locator = createLocator();
    });
  });
});

function createLocator(actions = [], config = {}) {
  var locator = new ServiceLocator();

  locator.register('componentLoader', ComponentLoader, config, true);
  locator.register('contextFactory', ContextFactory, config, true);
  locator.register('moduleApiProvider', ModuleApiProvider, config);
  locator.register('cookieWrapper', CookieWrapper, config);
  locator.registerInstance('serviceLocator', locator);
  locator.registerInstance('config', config);
  locator.registerInstance('eventBus', new events.EventEmitter());

  return locator;
}
