const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const ServiceLocator = require('catberry-locator');
const events = require('events');
const { URI } = require('catberry-uri');
const ServerResponse = require('../mocks/ServerResponse');
const AsyncComponent = require('../mocks/AsyncComponent');
const SyncComponent = require('../mocks/SyncComponent');
const DocumentRenderer = require('../../index');

lab.experiment('lib/DocumentRenderer', () => {
  lab.experiment('#render', () => {
    lab.test('Should render document on server and send it with correct content, code and headers', (done) => {
      class Document {
        template () {
          return '';
        }
      }

      const routingContext = createRoutingContext({ constructor: Document });
      const documentRenderer = routingContext.locator.resolve('documentRenderer');

      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.deepEqual(routingContext.middleware.response.result, '', 'Incorrect HTML');
          assert.deepEqual(routingContext.middleware.response.status, 200, 'Incorrect status');
          assert.deepEqual(routingContext.middleware.response.setHeaders['Content-Type'], 'text/html; charset=utf-8');
          assert.deepEqual(routingContext.middleware.response.setHeaders['X-Powered-By'], 'Catbee');
          done();
        });
    });

    lab.test('Should throw error if you register DocumentRenderer without documentComponent', (done) => {
      const routingContext = createRoutingContext();
      assert.throws(routingContext.locator.resolve.bind(routingContext.locator, 'documentRenderer'), Error);
      done();
    });

    lab.test('Should properly render component tree', (done) => {
      class Document {
        template () {
          return `
<!DOCTYPE html>
<html>
<head></head>
<body>
<cat-component></cat-component>
</body>
</html>
`;
        }
      }

      class Head {
        template () {
          return 'head';
        }
      }

      class Component {
        template () {
          return 'component'
        }
      }

      const routingContext = createRoutingContext({
        constructor: Document,
        children: [
          {
            name: 'head',
            component: {
              constructor: Head
            }
          },
          {
            name: 'component',
            component: {
              constructor: Component
            }
          }
        ]
      });

      const expected = `
<!DOCTYPE html>
<html>
<head>head</head>
<body>
<cat-component>component</cat-component>
</body>
</html>
`;

      const documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.deepEqual(routingContext.middleware.response.result, expected, 'Incorrect HTML');
          done();
        });
    });

    lab.test('Should render empty component if it not provided in parent children', (done) => {
      class Document {
        template () {
          return `
<!DOCTYPE html>
<html>
<head></head>
<body>
<cat-component></cat-component>
</body>
</html>
`;
        }
      }

      const routingContext = createRoutingContext({ constructor: Document });

      const expected = `
<!DOCTYPE html>
<html>
<head></head>
<body>
<cat-component></cat-component>
</body>
</html>
`;

      const documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.deepEqual(routingContext.middleware.response.result, expected, 'Incorrect HTML');
          done();
        });
    });

    lab.test('Should ignore second document and head tags', (done) => {
      class Document {
        template() {
          return `
<!DOCTYPE html>
<html>
<head></head>
<body>
<head></head>
<document></document>
</body>
</html>
`;
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

      const routingContext = createRoutingContext({
        constructor: Document,
        children: [
          {
            name: 'head',
            component: {
              constructor: Head
            }
          }
        ]
      });

      const expected = `
<!DOCTYPE html>
<html>
<head><title>head – head</title></head>
<body>
<head></head>
<document></document>
</body>
</html>
`;

      const documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.deepEqual(routingContext.middleware.response.result, expected, 'Incorrect HTML');
          done();
        });
    });

    lab.test('Should properly render sync and async components', (done) => {
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
`;
        }

        render () {
          return this.$context;
        }
      }

      const routingContext = createRoutingContext({
        constructor: Document,
        children: [
          {
            name: 'comp',
            component: SyncComponent
          },
          {
            name: 'async-comp',
            component: AsyncComponent
          }
        ]
      });

      const expected = `
<!DOCTYPE html>
<html>
<head></head>
<body>
document – document
<cat-comp><div>content – comp</div></cat-comp>
<cat-async-comp><div>content – async-comp</div></cat-async-comp>
</body>
</html>
`;

      const documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.deepEqual(routingContext.middleware.response.result, expected, 'Incorrect HTML');
          done();
        });
    });

    lab.test('Should use correct children without name conflicts while rendering nested component tree', (done) => {
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
`;
        }

        render () {
          return this.$context;
        }
      }

      class Slow {
        template () {
          return '<cat-reusable></cat-reusable>';
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
          return '<cat-reusable></cat-reusable>';
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
          return 'Slow';
        }
      }

      class FastReusable {
        template () {
          return 'Fast';
        }
      }

      const routingContext = createRoutingContext({
        constructor: Document,
        children: [
          {
            name: 'slow',
            component: {
              constructor: Slow,
              children: [
                {
                  name: 'reusable',
                  component: {
                    constructor: SlowReusable
                  }
                }
              ]
            }
          },
          {
            name: 'fast',
            component: {
              constructor: Fast,
              children: [
                {
                  name: 'reusable',
                  component: {
                    constructor: FastReusable
                  }
                }
              ]
            }
          }
        ]
      });

      const expected = `
<!DOCTYPE html>
<html>
<head></head>
<body>
document – document
<cat-slow><cat-reusable>Slow</cat-reusable></cat-slow>
<cat-fast><cat-reusable>Fast</cat-reusable></cat-fast>
</body>
</html>
`;

      const documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
          assert.deepEqual(routingContext.middleware.response.result, expected, 'Incorrect HTML');
          done();
        });
    });

    lab.test('Should set code 302 and Location if redirect', (done) => {
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
        template () {
          return '';
        }

        render () {
          this.$context.redirect('/to/garden');
        }
      }

      const routingContext = createRoutingContext({
        constructor: Document,
        children: [
          {
            name: 'head',
            component: {
              constructor: Head
            }
          }
        ]
      });

      const response = routingContext.middleware.response;
      const documentRenderer = routingContext.locator.resolve('documentRenderer');

      documentRenderer.render(routingContext);

      response
        .on('error', done)
        .on('finish', () => {
          assert.strictEqual(response.result, '', 'Should be empty content');
          assert.strictEqual(response.status, 302);
          assert.strictEqual(Object.keys(response.setHeaders).length, 1);
          assert.strictEqual(response.setHeaders.Location, '/to/garden');
          done();
        });
    });

    lab.test('Should set header if set cookie', (done) => {
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

      const routingContext = createRoutingContext({
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
      });

      const response = routingContext.middleware.response;
      const documentRenderer = routingContext.locator.resolve('documentRenderer');

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

    lab.test('Should pass to the next middleware if notFound()', (done) => {
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

      const routingContext = createRoutingContext({
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
      });

      const response = routingContext.middleware.response;
      const documentRenderer = routingContext.locator.resolve('documentRenderer');

      documentRenderer.render(routingContext);

      routingContext.middleware.next = () => {
        done();
      };

      response
        .on('error', done)
        .on('finish', function () {
          assert.fail('Should not finish the response');
        });
    });

    lab.test('Should render recursive components', (done) => {
      class Document {
        template () {
          return `
<!DOCTYPE html>
<html>
<head></head>
<body>
<cat-recursive id="1"></cat-recursive>
</body>
</html>
`;
        }
      }

      class Recursive {
        template (ctx) {
          if (ctx.id > 10) {
            return;
          }
          return `<cat-recursive id="${ctx.id}"></cat-recursive>`;
        }
        render () {
          return {
            id: Number(this.$context.attributes['id']) + 1
          };
        }
      }

      const routingContext = createRoutingContext({
        name: 'document',
        constructor: Document,
        children: [
          {
            name: 'recursive',
            component: {
              constructor: Recursive,
              children: [
                {
                  name: 'recursive',
                  recursive: true
                }
              ]
            }
          }
        ]
      });

      const documentRenderer = routingContext.locator.resolve('documentRenderer');
      documentRenderer.render(routingContext);

      const expected = `
        <!DOCTYPE html>
        <html>
          <head></head>
        <body>
          <cat-recursive id="1"><cat-recursive id="2"><cat-recursive id="3"><cat-recursive id="4"><cat-recursive id="5"><cat-recursive id="6"><cat-recursive id="7"><cat-recursive id="8"><cat-recursive id="9"><cat-recursive id="10">undefined</cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive>
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
  });
});

function createRoutingContext(documentComponent, args = {}, config = {}) {
  const locator = new ServiceLocator();

  locator.registerInstance('config', config);
  locator.registerInstance('serviceLocator', locator);

  const eventBus = new events.EventEmitter();
  locator.registerInstance('eventBus', eventBus);

  eventBus.on('error', (error) => {});

  DocumentRenderer.register(locator, documentComponent);

  const response = new ServerResponse();

  const context = {
    locator,
    args,
    actions: {},
    redirect: (uriString) => {
      context.actions.redirectedTo = uriString;
      return Promise.resolve();
    },
    notFound: () => {
      context.actions.isNotFoundCalled = true;
      return Promise.resolve();
    },
    clearFragment: () => {
      this.actions.isFragmentCleared = true;
      return Promise.resolve();
    },
    cookie: {
      setCookie: [],
      set: ({ key, value }) => {
        context.cookie.setCookie.push(`${key}=${value}`);
      }
    },
    getInlineScript () {
      let script = '';

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
      next: () => {}
    }
  };

  return context;
}
