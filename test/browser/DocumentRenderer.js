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

          renderer.renderComponent(element, { constructor: Component })
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

          renderer.renderComponent(element, { constructor: Component })
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

          renderer.renderComponent(element, { constructor: Component })
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

          renderer.renderComponent(element, { constructor: Component })
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

          renderer.renderComponent(element, { constructor: Component })
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

          renderer.renderComponent(element, { constructor: Component })
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
      var head = `<title>First title</title>
        <base href="someLink1" target="_parent">
        <noscript>noScript1</noscript>
        <style type="text/css">
        some styles1
        </style>
        <style type="text/css">

        some styles2
        </style>
        <script type="application/javascript">
        some scripts1
        </script>
        <script type="application/javascript">
        some scripts2
        </script>
        <script type="application/javascript" src="someScriptSrc1"></script>
        <script type="application/javascript" src="someScriptSrc2"></script>
        <link rel="stylesheet" href="someStyleLink1">
        <link rel="stylesheet" href="someStyleLink2">
        <meta name="name1" content="value1">
        <meta name="name2" content="value2">
        <meta name="name3" content="value3">
      `;

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', function (error) {
        assert.strictEqual(error.message, 'head');
      });

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          window.document.head.innerHTML = head;
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);

          renderer.renderComponent(window.document.head)
            .then(function () {
              assert.strictEqual(window.document.head.innerHTML, head);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should render nested components', (done) => {
      class Component3 {
        template () {
          return `
            <div>Hello from test3</div>
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
            <cat-test3 id="unique3"/>
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

      var expected = `
            <div>Hello from test1</div>
            <cat-test2 id="unique2">
            <div>Hello from test2</div>
            <cat-test3 id="unique3">
            <div>Hello from test3</div>
            <cat-test1 id="unique1">
          </cat-test1></cat-test3></cat-test2>`;

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');

          element.setAttribute('id', 'unique1');
          renderer.renderComponent(element, component1)
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should merge HEAD component with new rendered HTML', (done) => {
      var head = `
        <title>First title</title>
        <base href="someLink1" target="_parent">
        <style type="text/css">
        some styles1
        </style>
        <style type="text/css">
        some styles2
        </style>
        <script type="application/javascript">
        some scripts1
        </script>
        <script type="application/javascript">
        some scripts2
        </script>
        <script type="application/javascript"
        src="someScriptSrc1">
        </script>
        <script type="application/javascript"
        src="someScriptSrc2">
        </script>
        <link rel="stylesheet" href="someStyleLink1">
        <link rel="stylesheet" href="someStyleLink2">
        <meta name="name1" content="value1">
        <meta name="name2" content="value2">
        <meta name="name3" content="value3">
      `;

      var template = `
        <title>Second title</title>
        <base href="someLink2" target="_parent">
        <style type="text/css">
        some styles1
        </style>
        <style type="text/css">
        some styles2
        </style>
        <script type="application/javascript">
        some scripts1
        </script>
        <script type="application/javascript">
        some scripts2
        </script>
        <script type="application/javascript"
        src="someScriptSrc1">
        </script>
        <script type="application/javascript"
        src="someScriptSrc2">
        </script>
        <link rel="stylesheet" href="someStyleLink1">
        <link rel="stylesheet" href="someStyleLink2">
        <meta name="name1" content="value1">
        head<br><noscript>noScript2</noscript>
        <style type="text/css">
        some styles3
        </style>
        <script type="application/javascript">
        some scripts3
        </script>
        <script type="application/javascript"
        src="someScriptSrc3">
        </script>
        <link rel="stylesheet" href="someStyleLink3">
        <meta name="name4" content="value4">
      `;

      class Head {
        template () {
          return template;
        }
      }

      var headComponent = {
        constructor: Head
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          window.document.head.innerHTML = head;
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);

          renderer.renderComponent(window.document.head, headComponent)
            .then(function () {
              assert.strictEqual(window.document.head.querySelector('title').innerHTML, 'Second title');
              assert.strictEqual(window.document.head.querySelector('base').getAttribute('href'), 'someLink2');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('should bind all events from bind method', (done) => {
      class Component1 {
        template () {
          return `<div><a class="clickable"></a></div><cat-test2 id="unique2"/>`;
        }

        render () {
          return this.$context;
        }

        bind () {
          return {
            click: {
              'a.clickable': function (event) {
                event.target.innerHTML += 'Component1';
              }
            }
          };
        }
      }

      class Component2 {
        template () {
          return `<span><a class="clickable"></a></span>`;
        }

        render () {
          return this.$context;
        }

        bind () {
          return {
            click: {
              'a.clickable': function (event) {
                event.currentTarget.innerHTML = 'Component2';
              }
            }
          };
        }
      }

      var component2 = {
        constructor: Component2
      };

      var component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = `<div><a class="clickable">Component1</a></div><cat-test2 id="unique2"><span><a class="clickable">Component2Component1</a></span></cat-test2>`;
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);

          var element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              var event;
              var links = element.querySelectorAll('a.clickable');

              for (var i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              setTimeout(() => {
                assert.strictEqual(element.innerHTML, expected);
                done();
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('should handle dispatched events', (done) => {
      class Component1 {
        template () {
          return `
            <div><a class="clickable">
            <span><div class="toclick"></div></span>
            </a></div>
          `
        }

        render () {
          return this.$context;
        }

        bind () {
          return {
            click: {
              'a.clickable': function (event) {
                event.target.parentNode.innerHTML += 'Component1';
                event.currentTarget
                  .parentNode.innerHTML += 'Component1';
              }
            }
          };
        }
      }

      var component1 = {
        constructor: Component1
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = `
            <div><a class="clickable">
            <span><div class="toclick"></div>Component1</span>
            </a>Component1</div>
          `;

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              var event;
              var toClick = element.querySelectorAll('div.toclick');

              for (var i = 0; i < toClick.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                toClick[i].dispatchEvent(event);
              }

              setTimeout(function () {
                assert.strictEqual(element.innerHTML, expected);
                done();
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('should do nothing if event selector does not match', (done) => {
      class Component1 {
        template () {
          return '<div><a class="clickable"></a></div>';
        }

        bind () {
          return {
            click: {
              'a.non-clickable': function (event) {
                event.target.innerHTML += 'Component1';
              }
            }
          };
        }
      }

      var component1 = {
        constructor: Component1
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = '<div><a class="clickable"></a></div>';
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              var event;
              var links = element.querySelectorAll('a.clickable');

              for (var i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              setTimeout(function () {
                assert.strictEqual(element.innerHTML, expected);
                done();
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('should do nothing if event handler is not a function', (done) => {
      class Component1 {
        template () {
          return '<div><a class="clickable"></a></div>'
        }

        bind () {
          return {
            click: {
              'a.clickable': 'wrong'
            }
          };
        }
      }

      var component1 = {
        constructor: Component1
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = '<div><a class="clickable"></a></div>';
      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              var event;
              var links = element.querySelectorAll('a.clickable');

              for (var i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              setTimeout(function () {
                assert.strictEqual(element.innerHTML, expected);
                done();
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('should unbind all events and call unbind', (done) => {
      var bindCounters = {
        first: 0,
        second: 0
      };
      var unbindCounters = {
        first: 0,
        second: 0
      };

      class Component1 {
        template () {
          return '<div><a class="clickable"></a></div>' +
            '<cat-test2/>'
        }

        bind () {
          bindCounters.first++;

          if (bindCounters.first > 1) {
            return;
          }

          return {
            click: {
              'a.clickable': function (event) {
                event.target.innerHTML = 'Component1';
              }
            }
          };
        }

        unbind () {
          unbindCounters.first++;
        }
      }

      class Component2 {
        template () {
          return '<span><a class="clickable"></a></span>';
        }

        bind () {
          bindCounters.second++;

          if (bindCounters.second > 1) {
            return;
          }

          return {
            click: {
              'a.clickable': function (event) {
                event.target.innerHTML = 'Component2';
              }
            }
          };
        }

        unbind () {
          unbindCounters.second++;
        }
      }

      var component2 = {
        constructor: Component2
      };

      var component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      var expected = '<div><a class="clickable">' +
        '</a></div>' +
        '<cat-test2>' +
        '<span><a class="clickable">' +
        '</a></span>' +
        '</cat-test2>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              return renderer.renderComponent(element, component1);
            })
            .then(function () {
              var event;
              var links = element.querySelectorAll('a.clickable');

              for (var i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              setTimeout(function () {
                //assert.strictEqual(element.innerHTML, expected);
                assert.strictEqual(bindCounters.first, 2);
                assert.strictEqual(bindCounters.second, 2);
                assert.strictEqual(unbindCounters.first, 1);
                assert.strictEqual(unbindCounters.second, 1);
                done();
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('should render inner component with actual attributes', (done) => {
      var attributesLabel = null;

      class OuterComponent {
        template (ctx) {
          return `<cat-test2 label='${ctx.label}' />`;
        }

        render () {
          return this.$context.attributes;
        }
      }

      class InnerComponent {
        template () {
          return ({ label }) => `${label}`;
        }

        render () {
          attributesLabel = this.$context.attributes.label;
        }
      }

      var innerComponent = {
        constructor: InnerComponent
      };

      var outerComponent = {
        constructor: OuterComponent,
        children: [
          {
            name: 'test2',
            component: innerComponent
          }
        ]
      };

      var locator = createLocator();
      var eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done (errors, window) {
          locator.registerInstance('window', window);
          var renderer = new DocumentRenderer(locator);
          var element = window.document.createElement('cat-test1');
          element.setAttribute('label', 'first');

          renderer.renderComponent(element)
        }
      })
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
