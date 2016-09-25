const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const ServiceLocator = require('catberry-locator');
const events = require('events');
const { URI } = require('catberry-uri');
const ServerResponse = require('../mocks/ServerResponse');
const DocumentRenderer = require('../../index');
const DocumentComponent = require('../mocks/DocumentComponent');

lab.experiment('lib/DocumentRenderer', () => {
  lab.experiment('#render', () => {
    lab.test('Should render document with empty state object if signal not passed', (done) => {
      const routingContext = createRoutingContext(DocumentComponent);
      const documentRenderer = routingContext.locator.resolve('documentRenderer');

      documentRenderer.render(routingContext);

      routingContext.middleware.response
        .on('error', done)
        .on('finish', () => {
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
