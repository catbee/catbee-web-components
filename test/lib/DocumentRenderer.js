var Lab = require('lab');
var lab = exports.lab = Lab.script();
var assert = require('assert');
var ServiceLocator = require('catberry-locator');
var events = require('events');
var { URI } = require('catberry-uri');
var ServerResponse = require('../mocks/ServerResponse');
var headComponentMock = require('../mocks/HeadComponent');
var DocumentRenderer = require('../../lib/DocumentRenderer');

lab.experiment('lib/DocumentRenderer', { only:true }, () => {
  lab.experiment('#render', () => {
    lab.test('Should render document with empty template', (done) => {
      class Document {
        template () {
          return ``;
        }

        render () {
          done();
        }
      }

      var document = {
        name: 'document',
        constructor: Document
      };

      var routingContext = createRoutingContext(document);
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
        <cat-empty></cat-empty>
        </body>
        </html>
      `;

      class Document {
        template () {
          return html;
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          }
        ]
      };

      var routingContext = createRoutingContext(document);
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

    lab.test('should render nothing if no such head component', (done) => {
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

      var document = {
        name: 'document',
        constructor: Document
      };

      var routingContext = createRoutingContext(document);
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

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: {
              constructor: Head
            }
          }
        ]
      };

      var routingContext = createRoutingContext(document);
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

    lab.test('should properly render components', (done) => {
      class AsyncComponent {
        template (context) {
          return `<div>test – ${context.name}</div>`;
        }

        render () {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              resolve(this.$context);
            }, 1);
          });
        }
      }

      var asyncComponent = {
        constructor: AsyncComponent
      };

      class Component {
        template (context) {
          return `<div>content – ${context.name}</div>`;
        }

        render () {
          return this.$context;
        }
      }

      var component = {
        constructor: Component
      };

      class Document {
        template (context) {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            document – ${context.name}
            <cat-comp></cat-comp>
            <cat-async-comp></cat-async-comp>
            </body>
            </html>
          `
        }

        render () {
          return this.$context;
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'comp',
            component: component
          },
          {
            name: 'async-comp',
            component: asyncComponent
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var expected = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            document – document
            <cat-comp><div>content – comp</div></cat-comp>
            <cat-async-comp><div>test – async-comp</div></cat-async-comp>
            </body>
            </html>
          `;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('should properly render local components without conflicts', (done) => {
      class Document {
        template (context) {
          return `
          <!DOCTYPE html>
          <html>
          <head></head>
          <body>
          document – ${context.name}
          <cat-slow></cat-slow>
          <cat-fast></cat-fast>
          </body>
          </html>
          `
        }

        render () {
          return this.$context;
        }
      }

      class Slow {
        template () {
          return `
          <cat-reusable></cat-reusable>
          `;
        }

        render () {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(this.$context);
            }, 10);
          });
        }
      }

      class Fast {
        template () {
          return `
          <cat-reusable></cat-reusable>
          `;
        }

        render () {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(this.$context);
            }, 1);
          });
        }
      }

      class SlowReusable {
        template () {
          return `Slow`;
        }
      }

      class FastReusable {
        template () {
          return `Fast`;
        }
      }

      var slowReusable = {
        constructor: SlowReusable
      };

      var fastReusable = {
        constructor: FastReusable
      };

      var slow = {
        constructor: Slow,
        children: [
          {
            name: 'reusable',
            component: slowReusable
          }
        ]
      };

      var fast = {
        constructor: Fast,
        children: [
          {
            name: 'reusable',
            component: fastReusable
          }
        ]
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'slow',
            component: slow
          },
          {
            name: 'fast',
            component: fast
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      var expected = `
          <!DOCTYPE html>
          <html>
          <head></head>
          <body>
          document – document
          <cat-slow>
          <cat-reusable>Slow</cat-reusable>
          </cat-slow>
          <cat-fast>
          <cat-reusable>Fast</cat-reusable>
          </cat-fast>
          </body>
          </html>
          `;

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('should properly render local components without conflicts, in sync mode', (done) => {
      class Document {
        template (context) {
          return `
          <!DOCTYPE html>
          <html>
          <head></head>
          <body>
          document – ${context.name}
          <cat-sync-first id="sync-first" prefix="top"></cat-sync-first>
          <cat-sync-second id="sync-second"></cat-sync-second>
          </body>
          </html>
          `
        }

        render () {
          return this.$context;
        }
      }

      class SyncFirst {
        template (context) {
          return `
          <cat-reusable id="reusable-first-${context.attributes.prefix}"></cat-reusable>
          `;
        }

        render () {
          return this.$context;
        }
      }

      class SyncSecond {
        template () {
          return `
          <cat-reusable id="reusable-second"></cat-reusable>
          <cat-sync-first id="sync-first-inside" prefix="inside"></cat-sync-first>
          `;
        }
      }

      class FirstReusable {
        template () {
          return `First Reusable`;
        }
      }

      class SecondReusable {
        template () {
          return `Second Reusable`;
        }
      }

      var secondReusable = {
        constructor: SecondReusable
      };

      var firstReusable = {
        constructor: FirstReusable
      };

      var syncFirst = {
        constructor: SyncFirst,
        children: [
          {
            name: 'reusable',
            component: firstReusable
          }
        ]
      };

      var syncSecond = {
        constructor: SyncSecond,
        children: [
          {
            name: 'reusable',
            component: secondReusable
          },
          {
            name: 'sync-first',
            component: syncFirst
          }
        ]
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'sync-first',
            component: syncFirst
          },
          {
            name: 'sync-second',
            component: syncSecond
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      var expected = `
          <!DOCTYPE html>
          <html>
          <head></head>
          <body>
          document – document
          <cat-sync-first id="sync-first" prefix="top">
          <cat-reusable id="reusable-first-top">First Reusable</cat-reusable>
          </cat-sync-first>
          <cat-sync-second id="sync-second">
          <cat-reusable id="reusable-second">Second Reusable</cat-reusable>
          <cat-sync-first id="sync-first-inside" prefix="inside">
          <cat-reusable id="reusable-first-inside">First Reusable</cat-reusable>
          </cat-sync-first>
          </cat-sync-second>
          </body>
          </html>
          `;

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('Should render slot inside another component', (done) => {
      var html = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>
            <p>Slot injection</p>
          </cat-slot>
        </body>
        </html>
      `;

      class Slot {
        template () {
          return '<slot></slot>';
        }
      }

      var slot = {
        constructor: Slot
      };

      class Document {
        template () {
          return html;
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'slot',
            component: slot
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      var eventBus = routingContext.locator.resolve('eventBus');

      documentRenderer.render(routingContext);

      var expected = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>
            <p>Slot injection</p>
          </cat-slot>
        </body>
        </html>
      `;

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('Should render default slot state if slot content not provided', (done) => {
      var html = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot></cat-slot>
        </body>
        </html>
      `;

      class Slot {
        template () {
          return '<slot>Default value</slot>';
        }
      }

      var slot = {
        constructor: Slot
      };

      class Document {
        template () {
          return html;
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'slot',
            component: slot
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      var eventBus = routingContext.locator.resolve('eventBus');

      documentRenderer.render(routingContext);

      var expected = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>Default value</cat-slot>
        </body>
        </html>
      `;

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('Should use parent context for components that defined in slot', (done) => {
      var html = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>
            <cat-inner-slot></cat-inner-slot>
          </cat-slot>
        </body>
        </html>
      `;

      class InnerSlot {
        template () {
          return 'Inner Slot';
        }
      }

      var innerSlot = {
        constructor: InnerSlot
      };

      class Slot {
        template () {
          return '<slot></slot>';
        }
      }

      var slot = {
        constructor: Slot
      };

      class Document {
        template () {
          return html;
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'slot',
            component: slot
          },
          {
            name: 'inner-slot',
            component: innerSlot
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      var eventBus = routingContext.locator.resolve('eventBus');

      documentRenderer.render(routingContext);

      var expected = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>
            <cat-inner-slot>Inner Slot</cat-inner-slot>
          </cat-slot>
        </body>
        </html>
      `;

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('Should properly render nested slot components', (done) => {
      var html = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>
            <cat-inner-slot></cat-inner-slot>
          </cat-slot>
        </body>
        </html>
      `;

      class InnerSlotChild {
        template () {
          return 'Inner Slot Child';
        }
      }

      var innerSlotChild = {
        constructor: InnerSlotChild
      };

      class InnerSlot {
        template () {
          return '<cat-inner-slot-child></cat-inner-slot-child>';
        }
      }

      var innerSlot = {
        constructor: InnerSlot,
        children: [
          {
            name: 'inner-slot-child',
            component: innerSlotChild
          }
        ]
      };

      class Slot {
        template () {
          return '<slot></slot>';
        }
      }

      var slot = {
        constructor: Slot
      };

      class Document {
        template () {
          return html;
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'slot',
            component: slot
          },
          {
            name: 'inner-slot',
            component: innerSlot
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      var eventBus = routingContext.locator.resolve('eventBus');

      documentRenderer.render(routingContext);

      var expected = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-slot>
            <cat-inner-slot><cat-inner-slot-child>Inner Slot Child</cat-inner-slot-child></cat-inner-slot>
          </cat-slot>
        </body>
        </html>
      `;

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(routingContext.middleware.response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('should properly render debug info', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            <cat-error></cat-error>
            </body>
            </html>
          `
        }
      }

      class ErrorComponent {
        render () {
          throw new Error(this.$context.name);
        }
      }

      var error = {
        constructor: ErrorComponent
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'error',
            component: error
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(routingContext.middleware.response.result.length > 0, true, 'Wrong HTML');
          done();
        });
    });

    lab.test('should set code 200 and required headers', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            </body>
            </html>
          `
        }
      }

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      var response = routingContext.middleware.response;

      response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(response.status, 200);
          assert.strictEqual(Object.keys(response.setHeaders).length, 2);
          assert.strictEqual(typeof(response.setHeaders['Content-Type']), 'string');
          assert.strictEqual(typeof(response.setHeaders['X-Powered-By']), 'string');
          done();
        });
    });

    lab.test('should set code 302 and Location if redirect in HEAD', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            </body>
            </html>
          `
        }
      }

      class Head {
        render () {
          this.$context.redirect('/to/garden');
        }
      }

      var head = {
        constructor: Head
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: head
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var response = routingContext.middleware.response;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(response.result, '', 'Should be empty content');
          assert.strictEqual(response.status, 302);
          assert.strictEqual(Object.keys(response.setHeaders).length, 1);
          assert.strictEqual(response.setHeaders.Location, '/to/garden');
          done();
        });
    });

    lab.test('should set header if set cookie in HEAD', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            </body>
            </html>
          `
        }
      }

      class Head {
        render () {
          this.$context.cookie.set({
            key: 'first',
            value: 'value1'
          });
          this.$context.cookie.set({
            key: 'second',
            value: 'value2'
          });
        }
      }

      var head = {
        constructor: Head
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: head
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var response = routingContext.middleware.response;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(response.status, 200);
          assert.strictEqual(Object.keys(response.setHeaders).length, 3);
          assert.strictEqual(typeof(response.setHeaders['Content-Type']), 'string');
          assert.strictEqual(typeof(response.setHeaders['X-Powered-By']), 'string');
          assert.deepEqual(response.setHeaders['Set-Cookie'], ['first=value1', 'second=value2']);
          done();
        });
    });

    lab.test('should pass to the next middleware if notFound()', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            </body>
            </html>
          `
        }
      }

      class Head {
        render () {
          this.$context.notFound();
        }
      }

      var head = {
        constructor: Head
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: head
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var response = routingContext.middleware.response;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.next = function () {
        done();
      };

      response
        .on('error', done)
        .on('finish', function () {
          assert.fail('Should not finish the response');
        });
    });

    lab.test('should render inline script if clearFragment() in HEAD', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            </body>
            </html>
          `
        }
      }

      class Head {
        render () {
          this.$context.clearFragment();
        }
      }

      var head = {
        constructor: Head
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: head
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var response = routingContext.middleware.response;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      var expected = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body><script>fragment</script>
            </body>
            </html>
          `;

      response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('should render inline script if redirect()', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            <cat-redirect></cat-redirect>
            </body>
            </html>
          `
        }
      }

      class Redirect {
        render () {
          this.$context.redirect('/')
        }
      }

      var redirect = {
        constructor: Redirect
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'redirect',
            component: redirect
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var response = routingContext.middleware.response;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      var expected = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            <cat-redirect><script>redirect</script></cat-redirect>
            </body>
            </html>
          `;

      response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(response.result, expected, 'Wrong HTML');
          done();
        });
    });

    lab.test('should render inline script if cookie.set()', (done) => {
      class Document {
        template () {
          return `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            <cat-cookie></cat-cookie>
            </body>
            </html>
          `
        }
      }

      class Cookie {
        render () {
          this.$context.cookie.set({
            key: 'first',
            value: 'value1'
          });
        }
      }

      var cookie = {
        constructor: Cookie
      };

      var document = {
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'head',
            component: headComponentMock
          },
          {
            name: 'cookie',
            component: cookie
          }
        ]
      };

      var routingContext = createRoutingContext(document);
      var response = routingContext.middleware.response;

      var documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      var expected = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
            <cat-cookie><script>setCookie</script></cat-cookie>
            </body>
            </html>
          `;

      response
        .on('error', done)
        .on('finish', function () {
          assert.strictEqual(response.result, expected, 'Wrong HTML');
          done();
        });
    });
  });
});

function createRoutingContext(documentDescriptor, args = {}, config = {}) {
  var locator = new ServiceLocator();
  locator.registerInstance('serviceLocator', locator);
  locator.register('documentRenderer', DocumentRenderer, true);
  locator.registerInstance('config', config);

  var eventBus = new events.EventEmitter();
  locator.registerInstance('eventBus', eventBus);
  locator.registerInstance('documentComponent', documentDescriptor);

  eventBus.on('error', function () {

  });

  var response = new ServerResponse();
  var context = {
    locator, args,
    actions: {},
    redirect: function (uriString) {
      context.actions.redirectedTo = uriString;
      return Promise.resolve();
    },
    notFound: function () {
      context.actions.isNotFoundCalled = true;
      return Promise.resolve();
    },
    clearFragment: function () {
      this.actions.isFragmentCleared = true;
      return Promise.resolve();
    },
    cookie: {
      setCookie: [],
      set: function ({ key, value }) {
        context.cookie.setCookie.push(`${key}=${value}`);
      }
    },
    getInlineScript () {
      var script = '';

      if (context.actions.isFragmentCleared) {
        script += '<script>fragment</script>';
      }

      if (context.actions.redirectedTo) {
        script += '<script>redirect</script>'
      }

      if (context.cookie.setCookie.length > 0) {
        script += '<script>setCookie</script>'
      }

      return script;
    },
    referrer: new URI(),
    location: new URI(),
    userAgent: 'test',
    middleware: {
      response: response,
      next: function () {}
    }
  };

  return context;
}
