var Lab = require('lab');
var lab = exports.lab = Lab.script();
var assert = require('assert');
var ServiceLocator = require('catberry-locator');
var events = require('events');
var { URI } = require('catberry-uri');
var ServerResponse = require('../mocks/ServerResponse');
var HeadComponentMock = require('../mocks/HeadComponent');
var DocumentRenderer = require('../../lib/DocumentRenderer');

lab.experiment('lib/DocumentRenderer', () => {
  lab.experiment('#render', () => {
    lab.test('Should render document with empty state object if signal not passed', (done) => {
      class Document {
        template () {
          return ``
        }

        render () {
          assert.deepEqual(this.$context.state.get(), {});
          done();
        }
      }

      var routingContext = createRoutingContext(Document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      var eventBus = routingContext.locator.resolve('eventBus');

      documentRenderer.render(routingContext);
    });

    lab.test('should render nothing if no such component', (done) => {
      var html = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
        </body>
        </html>
      `;

      class Document {
        template () {
          return html;
        }
      }

      var routingContext = createRoutingContext(Document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      var eventBus = routingContext.locator.resolve('eventBus');

      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, html, 'Wrong HTML');
          done();
        });
    });

    lab.test('should ignore second head and document tags', (done) => {
      class Document {
        template (context) {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            document – ${context.name}
            <head></head>
            <document></document>
            </body>
            </html>
          `
        }

        render () {
          return this.$context;
        }
      }

      class Head {
        template (context) {
          return `<title>head – ${context.name}</title>`
        }

        render () {
          return this.$context;
        }
      }

      var routingContext = createRoutingContext(Document, Head);
      var expected = `
            <!DOCTYPE html>
            <html>
            <head><title>head – head</title></head>
            <body>
            document – document
            <head></head>
            <document></document>
            </body>
            </html>
          `;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');

      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('should properly render components without watchers', (done) => {
      class AsyncComponent {
        template (context) {
          return `<div>test - ${context.name}</div>`;
        }

        render () {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              resolve(this.$context);
            }, 1);
          });
        }
      }

      class Component {
        template (context) {
          return `<div>content - ${context.name}</div>`;
        }

        render () {
          return this.$context;
        }
      }


      class Document {
        constructor () {
          this.components = {
            comp: Component,
            'async-comp': AsyncComponent
          };
        }

        template (context) {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            document – ${context.name}
            <cat-comp id="1"></cat-comp>
            <cat-async-comp id="2"></cat-async-comp>
            </body>
            </html>
          `
        }

        render () {
          return this.$context;
        }
      }

      var routingContext = createRoutingContext(Document);
      var expected = `
        <!DOCTYPE html>
        <html>
        <head></head>
        <body>
        document – document
        <cat-comp id=\"1\"><div>content – comp</div></cat-comp>
        <cat-async-comp id=\"2\"><div>test – async-comp</div></cat-async-comp>
        </body>
        </html>
      `;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });
  });
});

function createRoutingContext(DocumentComponent, HeadComponent = HeadComponentMock, args = {}, config = {}) {
  var locator = new ServiceLocator();
  locator.registerInstance('serviceLocator', locator);
  locator.register('documentRenderer', DocumentRenderer, config, true);
  locator.registerInstance('config', config);

  var eventBus = new events.EventEmitter();
  locator.registerInstance('eventBus', eventBus);

  locator.registerInstance('documentComponent', {
    name: 'document',
    constructor: DocumentComponent
  });

  locator.registerInstance('headComponent', {
    name: 'head',
    constructor: HeadComponent
  });

  return {
    locator, args,
    actions: {

    },
    cookie: {
      setCookie: []
    },
    getInlineScript () {
      return '';
    },
    referrer: new URI(),
    location: new URI(),
    userAgent: 'test',
    middleware: {
      response: new ServerResponse(),
      next: function () {}
    }
  };
}
