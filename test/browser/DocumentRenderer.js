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
    lab.test('should init and bind all components in right order', { only: true }, (done) => {
      var html = fs.readFileSync(__dirname + '/../cases/browser/DocumentRenderer/initWithState.html');
      var bindCalls = [];

      class NestedComponent {
        bind () {
          var id = this.$context.attributes.id ?
          '-' + this.$context.attributes.id : '';
          bindCalls.push(this.$context.name + id);
        }
      }

      var nested = {
        constructor: NestedComponent
      };

      var documentComponent = {
        name: 'document',
        constructor: NestedComponent,
        children: [
          {
            name: 'comp',
            component: nested
          },
          {
            name: 'head',
            component: nested
          }
        ]
      };

      var locator = createLocator(documentComponent);
      var eventBus = locator.resolve('eventBus');

      var expected = [
        'comp-1',
        'comp-2',
        'comp-3',
        'comp-4',
        'comp-5',
        'comp-6',
        'comp-7',
        'comp-8',
        'comp-9',
        'comp-10',
        'comp-11',
        'comp-12',
        'comp-13',
        'comp-14',
        'comp-15',
        'comp-16',
        'comp-17',
        'comp-18',
        'head',
        'document'
      ];

      eventBus.on('error', done);

      jsdom.env({
        html: html,
        done: (errors, window) => {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);

          renderer.initWithState({
            args: {

            }
          })
          .then(() => {
            assert.deepEqual(bindCalls, expected);
            done();
          })
          .catch(done);
        }
      });
    });
  });
});

function createLocator(documentComponent, config = {}) {
  var locator = new ServiceLocator();
  var eventBus = new events.EventEmitter();

  locator.registerInstance('serviceLocator', locator);
  locator.registerInstance('config', config);
  locator.registerInstance('eventBus', eventBus);
  locator.registerInstance('documentComponent', documentComponent);

  return locator;
}
