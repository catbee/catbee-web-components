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
      var bindCalls = [];

      class NestedComponent {
        bind () {
          var id = this.$context.attributes.id ?
          '-' + this.$context.attributes.id : '';
          bindCalls.push(this.$context.name + id);
        }
      }

      var deepNested = {
        constructor: NestedComponent
      };

      var nested = {
        constructor: NestedComponent,
        children: [
          {
            name: 'comp',
            component: deepNested
          }
        ]
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
        'document',
        'head',
        'comp-1',
        'comp-2',
        'comp-3'
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

  lab.experiment('#renderComponent', () => {
    lab.test('should render component into HTML element', (done) => {
      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = 'test<br><div>Hello, World!</div>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              return `test<br><div>Hello, World!</div>`;
            }
          }

          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');
          element.setAttribute('id', 'unique');

          renderer.renderComponent(element, { constructor: Component, name: 'test' })
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render asynchronous component into HTML element', (done) => {
      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = 'test-async<br><div>Hello, World!</div>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              return `test-async<br><div>Hello, World!</div>`;
            }

            render () {
              return new Promise((resolve) => {
                setTimeout(() => resolve(), 10)
              });
            }
          }

          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');
          element.setAttribute('id', 'unique');

          renderer.renderComponent(element, { constructor: Component, name: 'test' })
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render debug output instead the content when error in debug mode', (done) => {
      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var check = /Error: test/;

      eventBus.on('error', function (error) {
        assert.strictEqual(error.message, 'test');
      });

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              return ``;
            }

            render () {
              throw new Error('test');
            }
          }

          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');
          element.setAttribute('id', 'unique');

          renderer.renderComponent(element, { constructor: Component, name: 'test' })
            .then(function () {
              assert.strictEqual(check.test(element.innerHTML), true);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render debug output instead the content when error in debug mode (async)', (done) => {
      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var check = /Error: test/;

      eventBus.on('error', function (error) {
        assert.strictEqual(error.message, 'test');
      });

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              return ``;
            }

            render () {
              return new Promise((resolve, reject) => {
                setTimeout(() => {
                  reject(new Error(this.$context.name));
                }, 1);
              });
            }
          }

          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');
          element.setAttribute('id', 'unique');

          renderer.renderComponent(element, { constructor: Component, name: 'test' })
            .then(function () {
              assert.strictEqual(check.test(element.innerHTML), true);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render empty string instead the content when error in release mode', (done) => {
      var locator = createLocator({}, { isRelease: true });
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', function (error) {
        assert.strictEqual(error.message, 'test');
      });

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              return ``;
            }

            render () {
              throw new Error('test');
            }
          }

          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');
          element.setAttribute('id', 'unique');

          renderer.renderComponent(element, { constructor: Component, name: 'test' })
            .then(function () {
              assert.strictEqual(element.innerHTML, '');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render empty string instead the content when error in release mode (async)', (done) => {
      var locator = createLocator({}, { isRelease: true });
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', function (error) {
        assert.strictEqual(error.message, 'test');
      });

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              return ``;
            }

            render () {
              return new Promise((resolve, reject) => {
                setTimeout(() => {
                  reject(new Error(this.$context.name));
                }, 1);
              });
            }
          }

          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');
          element.setAttribute('id', 'unique');

          renderer.renderComponent(element, { constructor: Component, name: 'test' })
            .then(function () {
              assert.strictEqual(element.innerHTML, '');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should do nothing if there is no such component', (done) => {
      var locator = createLocator({}, { isRelease: true });
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test-async');

          element.setAttribute('id', 'unique');
          renderer.renderComponent(element)
            .then(function () {
              assert.strictEqual(element.innerHTML, '');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should do nothing if component is HEAD', (done) => {
      var head = '<title>First title</title>' +
        '<base href="someLink1" target="_parent">' +
        '<noscript>noScript1</noscript>' +
        '<style type="text/css">' +
        'some styles1' +
        '</style>' +
        '<style type="text/css">' +
        'some styles2' +
        '</style>' +
        '<script type="application/javascript">' +
        'some scripts1' +
        '</script>' +
        '<script type="application/javascript">' +
        'some scripts2' +
        '</script>' +
        '<script type="application/javascript" ' +
        'src="someScriptSrc1">' +
        '</script>' +
        '<script type="application/javascript" ' +
        'src="someScriptSrc2">' +
        '</script>' +
        '<link rel="stylesheet" href="someStyleLink1">' +
        '<link rel="stylesheet" href="someStyleLink2">' +
        '<meta name="name1" content="value1">' +
        '<meta name="name2" content="value2">' +
        '<meta name="name3" content="value3">';

      var locator = createLocator({}, {});
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', function (error) {
        assert.strictEqual(error.message, 'head');
      });

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Head {
            template () {
              return ``;
            }
          }

          window.document.head.innerHTML = head;
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);

          renderer.renderComponent(window.document.head, { constructor: Head, name: 'head' })
            .then(function () {
              assert.strictEqual(window.document.head.innerHTML, head);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should do nothing if there is no Element\'s ID', (done) => {
      var locator = createLocator({}, {});
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test');

          renderer.renderComponent(element)
            .then(function () {
              assert.strictEqual(element.innerHTML, '');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render nested components', { only: true }, (done) => {
      class Component3 {
        template () {
          return `
            <cat-test1 id="unique1"/>
          `;
        }
      }

      var component3 = {
        constructor: Component3
      };

      class Component2 {
        template () {
          return `
            <div>Hello from test2</div>
            <cat-test3 id="unique2"/>
          `
        }
      }

      var component2 = {
        constructor: Component2,
        children: [
          {
            name: 'test3',
            component: component3
          }
        ]
      };

      class Component1 {
        template () {
          return `
            <div>Hello from test1</div>
            <cat-test2 id="unique2"/>
          `
        }
      }

      var component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      var locator = createLocator({}, {});
      var eventBus = locator.resolve('eventBus');

      var expected = 'test1<br>' +
        '<div>Hello from test1</div>' +
        '<cat-test2 id="unique2">' +
        'test2<br>' +
        '<span>' +
        'Hello from test2' +
        '<cat-test3 id="unique3">' +
        'test3<br>' +
        'Hello from test3' +
        '</cat-test3>' +
        '</span>' +
        '</cat-test2>';

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');

          element.setAttribute('id', 'unique1');
          renderer.renderComponent(element)
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });
  });
});

function createLocator(documentComponent = {}, config = {}) {
  var locator = new ServiceLocator();
  var eventBus = new events.EventEmitter();

  locator.registerInstance('serviceLocator', locator);
  locator.registerInstance('config', config);
  locator.registerInstance('eventBus', eventBus);
  locator.registerInstance('documentComponent', documentComponent);

  return locator;
}
