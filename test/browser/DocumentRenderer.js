const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const events = require('events');
const jsdom = require('jsdom');
const appstate = require('appstate');
const fs = require('fs');
const ServiceLocator = require('catberry-locator');
const DocumentRenderer = require('../../browser/DocumentRenderer');
const ModuleApiProvider = require('../mocks/ModuleApiProvider');

lab.experiment('browser/DocumentRenderer', () => {
  lab.experiment('#initWithState', () => {
    lab.test('Should init and bind all components in right order', (done) => {
      const html = fs.readFileSync(__dirname + '/../cases/browser/DocumentRenderer/initWithState.html');
      let bindCalls = [];

      class NestedComponent {
        bind () {
          const id = this.$context.attributes.id ?
          '-' + this.$context.attributes.id : '';
          bindCalls.push(this.$context.name + id);
        }
      }

      const deepNested = {
        constructor: NestedComponent
      };

      const nested = {
        constructor: NestedComponent,
        children: [
          {
            name: 'comp',
            component: deepNested
          }
        ]
      };

      const documentComponent = {
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

      const locator = createLocator(documentComponent);
      const eventBus = locator.resolve('eventBus');

      const expected = [
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
          const renderer = new DocumentRenderer(locator);

          renderer.initWithState({
            args: {}
          })
            .then(() => {
              assert.deepEqual(bindCalls, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should access to watcher data in bind', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      class Empty {
        template () {
          return ``;
        }

        bind () {
          this.$context.getWatcherData()
            .then(data => assert
              .deepEqual({ text: 'Test' }, data))
            .then(() => done())
            .catch(done);
        }
      }

      class Document {
      }

      const empty = {
        constructor: Empty
      };

      const document = {
        constructor: Document,
        children: [
          {
            name: 'empty',
            component: empty,
            watcher: {
              text: ['text']
            }
          }
        ]
      };

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
      </head>
      <body>
      <cat-empty></cat-empty>
      </body>
      </html>
      `;

      eventBus.on('error', done);
      jsdom.env({
        html: html,
        done: function (errors, window) {

          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          locator.registerInstance('documentComponent', document);

          renderer.initWithState({
            args: {
              signal: [
                function (args, state) {
                  state.set('text', 'Test');
                }
              ]
            }
          })
            .catch(done);
        }
      });
    });

    lab.test('Should take parent props by parentPropsMap option', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');
      const propertyValue = 'test';

      class Document { }
      class Parent {
        template () {
          return `<cat-current />`
        }
      }
      class Current {
        constructor () {
          assert.equal(this.$context.props.field, propertyValue);
          done();
        }

        template () {
          return '';
        }
      }

      const current = {
        constructor: Current
      };

      const parent = {
        constructor: Parent,
        children: [
          {
            name: 'current',
            component: current,
            parentPropsMap: {
              field: 'parentProperty'
            }
          }
        ]
      };

      const document = {
        constructor: Document,
        children: [
          {
            name: 'parent',
            component: parent,
            props: {
              parentProperty: propertyValue
            }
          }
        ]
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
        </head>
        <body>
        <cat-parent><cat-current></cat-current></cat-parent>
        </body>
        </html>
      `;

      eventBus.on('error', done);
      jsdom.env({
        html,
        done (errors, window) {
          locator.registerInstance('window', window);
          locator.registerInstance('documentComponent', document);

          const renderer = new DocumentRenderer(locator);
          renderer
            .initWithState({ args: { signal: [] } })
            .catch(done);
        }
      })
    });

    lab.test('Should correct init slot nested components', (done) => {
      let bindCalls = [];
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
        </head>
        <body>
        <cat-slot>
          <slot>
            <cat-nested-slot>
              <cat-nested-child></cat-nested-child>
            </cat-nested-slot>
          </slot>
        </cat-slot>
        <cat-slot>
          <slot>
            <cat-nested-second></cat-nested-second>
          </slot>
        </cat-slot>
        </body>
        </html>
      `;

      class Document {
        bind () {
          bindCalls.push('document');
        }
      }

      class Slot {
        bind () {
          bindCalls.push('slot');
        }
      }

      class NestedSlot {
        bind () {
          bindCalls.push('nested-slot');
        }
      }

      class NestedChild {
        bind () {
          bindCalls.push('nested-child');
        }
      }

      class NestedSecond {
        bind () {
          bindCalls.push('nested-second');
        }
      }

      const nestedSecond = {
        constructor: NestedSecond
      };

      const nestedChild = {
        constructor: NestedChild
      };

      const nestedSlot = {
        constructor: NestedSlot,
        children: [
          {
            name: 'nested-child',
            component: nestedChild
          }
        ]
      };

      const slot = {
        constructor: Slot
      };

      const document = {
        constructor: Document,
        children: [
          {
            name: 'slot',
            component: slot
          },
          {
            name: 'nested-slot',
            component: nestedSlot
          },
          {
            name: 'nested-second',
            component: nestedSecond
          }
        ]
      };

      const locator = createLocator(document);
      const eventBus = locator.resolve('eventBus');

      const expected = [
        'document',
        'slot',
        'slot',
        'nested-slot',
        'nested-second',
        'nested-child'
      ];

      jsdom.env({
        html: html,
        done: (errors, window) => {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          renderer.initWithState({
              args: {}
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
    lab.test('Should render component into HTML element', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = 'test<br><div>Hello, World!</div>';

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

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should render asynchronous component into HTML element', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = 'test-async<br><div>Hello, World!</div>';

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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should block render if shouldComponentUpdate return false', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');
      let renderCount = 0;

      const expected = 'test<br><div>Hello, World 1!</div>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              renderCount += 1;
              return `test<br><div>Hello, World ${renderCount}!</div>`;
            }

            shouldComponentUpdate () {
              return false;
            }
          }

          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(() => {
              assert.strictEqual(element.innerHTML, expected);
              assert.strictEqual(renderCount, 1);
              return renderer.renderComponent(element, { constructor: Component });
            })
            .then(() => {
              assert.strictEqual(element.innerHTML, expected);
              assert.strictEqual(renderCount, 1);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should not block render if shouldComponentUpdate return true', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');
      let renderCount = 0;

      const expected1 = 'test<br><div>Hello, World 1!</div>';
      const expected2 = 'test<br><div>Hello, World 2!</div>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          class Component {
            template () {
              renderCount += 1;
              return `test<br><div>Hello, World ${renderCount}!</div>`;
            }

            shouldComponentUpdate () {
              return true;
            }
          }

          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(() => {
              assert.strictEqual(element.innerHTML, expected1);
              assert.strictEqual(renderCount, 1);
              return renderer.renderComponent(element, { constructor: Component });
            })
            .then(() => {
              assert.strictEqual(element.innerHTML, expected2);
              assert.strictEqual(renderCount, 2);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should render debug output instead the content when error in debug mode', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const check = /Error: test/;

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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(function () {
              assert.strictEqual(check.test(element.innerHTML), true);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should render debug output instead the content when error in debug mode (async)', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const check = /Error: test/;

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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(function () {
              assert.strictEqual(check.test(element.innerHTML), true);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should render empty string instead the content when error in release mode', (done) => {
      const locator = createLocator({}, { isRelease: true });
      const eventBus = locator.resolve('eventBus');

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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(function () {
              assert.strictEqual(element.innerHTML, '');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should render empty string instead the content when error in release mode (async)', (done) => {
      const locator = createLocator({}, { isRelease: true });
      const eventBus = locator.resolve('eventBus');

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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, { constructor: Component })
            .then(function () {
              assert.strictEqual(element.innerHTML, '');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should do nothing if there is no such component', (done) => {
      const locator = createLocator({}, { isRelease: true });
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test-async');

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

    lab.test('Should render nested components', (done) => {
      class Component3 {
        template () {
          return `
            <div>Hello from test3</div>
            <cat-test1 id="unique1"/>
          `;
        }
      }

      const component3 = {
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

      const component2 = {
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

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      const locator = createLocator({}, {});
      const eventBus = locator.resolve('eventBus');

      const expected = `
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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

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

    lab.test('Should merge HEAD component with new rendered HTML', (done) => {
      const head = `
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

      const template = `
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

      const headComponent = {
        constructor: Head
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          window.document.head.innerHTML = head;
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

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

    lab.test('Should bind all events from bind method', (done) => {
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

      const component2 = {
        constructor: Component2
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = `<div><a class="clickable">Component1</a></div><cat-test2 id="unique2"><span><a class="clickable">Component2Component1</a></span></cat-test2>`;
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          const element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              let event;
              const links = element.querySelectorAll('a.clickable');

              for (let i = 0; i < links.length; i++) {
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

    lab.test('Should handle dispatched events', (done) => {
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

      const component1 = {
        constructor: Component1
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = `
            <div><a class="clickable">
            <span><div class="toclick"></div>Component1</span>
            </a>Component1</div>
          `;

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              let event;
              const toClick = element.querySelectorAll('div.toclick');

              for (let i = 0; i < toClick.length; i++) {
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

    lab.test('Should do nothing if event selector does not match', (done) => {
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

      const component1 = {
        constructor: Component1
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<div><a class="clickable"></a></div>';
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              let event;
              const links = element.querySelectorAll('a.clickable');

              for (let i = 0; i < links.length; i++) {
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

    lab.test('Should do nothing if event handler is not a function', (done) => {
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

      const component1 = {
        constructor: Component1
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<div><a class="clickable"></a></div>';
      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              let event;
              const links = element.querySelectorAll('a.clickable');

              for (let i = 0; i < links.length; i++) {
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

    lab.test('Should unbind all events and call unbind', (done) => {
      let bindCounters = {
        first: 0,
        second: 0
      };
      let unbindCounters = {
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

      const component2 = {
        constructor: Component2
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<div><a class="clickable">' +
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
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              return renderer.renderComponent(element, component1);
            })
            .then(function () {
              let event;
              const links = element.querySelectorAll('a.clickable');

              for (let i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              setTimeout(function () {
                assert.strictEqual(element.innerHTML, expected);
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

    lab.test('Should render inner component with actual attributes', (done) => {
      let attributesLabel = null;

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

      const innerComponent = {
        constructor: InnerComponent
      };

      const outerComponent = {
        constructor: OuterComponent,
        children: [
          {
            name: 'test2',
            component: innerComponent
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');
          element.setAttribute('label', 'first');

          renderer.renderComponent(element, outerComponent)
            .then(() => {
              assert.strictEqual(attributesLabel, 'first');
              element.setAttribute('label', 'second');
              return renderer.renderComponent(element, outerComponent);
            })
            .then(() => {
              assert.strictEqual(attributesLabel, 'second');
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should use the same component instance if it\'s element recreated after rendering', (done) => {
      const instances = {
        first: [],
        second: [],
        third: []
      };

      class Component1 {
        constructor () {
          instances.first.push(this);
        }

        template () {
          return `
          <div>Hello from test1</div>
          <cat-test2 id="unique2"/>
        `
        }

        render () {
          return this.$context;
        }
      }

      class Component2 {
        constructor () {
          instances.second.push(this);
        }

        template () {
          return `
          <span>
          Hello from test2
          <cat-test3 id="unique3"/>
          </span>
        `
        }

        render () {
          return this.$context;
        }
      }

      class Component3 {
        constructor () {
          instances.third.push(this);
        }

        template () {
          return `
          Hello from test3
        `
        }

        render () {
          return this.$context;
        }
      }

      const component3 = {
        constructor: Component3
      };

      const component2 = {
        constructor: Component2,
        children: [
          {
            name: 'test3',
            component: component3
          }
        ]
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

          renderer.renderComponent(element, component1)
            .then(function () {
              return renderer.renderComponent(element, component1);
            })
            .then(function () {
              return renderer.renderComponent(element, component1);
            })
            .then(function () {
              assert.strictEqual(instances.first.length, 1);
              assert.strictEqual(instances.second.length, 1);
              assert.strictEqual(instances.third.length, 1);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should use new component instance if it\'s element removed after rendering', (done) => {
      const instances = {
        first: [],
        second: [],
        third: []
      };

      let counter = 0;

      class Component1 {
        constructor () {
          instances.first.push(this);
        }

        template () {
          return `
          <div>Hello from test1</div>
          ${counter % 2 === 0 ? '' : '<cat-test2 />'}
        `
        }

        render () {
          return this.$context;
        }
      }

      class Component2 {
        constructor () {
          instances.second.push(this);
        }

        template () {
          return `
          <span>
          Hello from test2
          <cat-test3/>
          </span>
        `
        }

        render () {
          return this.$context;
        }
      }

      class Component3 {
        constructor () {
          instances.third.push(this);
        }

        template () {
          return `
          Hello from test3
        `
        }

        render () {
          return this.$context;
        }
      }

      const component3 = {
        constructor: Component3
      };

      const component2 = {
        constructor: Component2,
        children: [
          {
            name: 'test3',
            component: component3
          }
        ]
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test1');

          counter++;

          renderer.renderComponent(element, component1)
            .then(function () {
              counter++;
              return renderer.renderComponent(element, component1);
            })
            .then(function () {
              counter++;
              return renderer.renderComponent(element, component1);
            })
            .then(function () {
              assert.strictEqual(instances.first.length, 1);
              assert.strictEqual(instances.second.length, 2);
              assert.strictEqual(instances.third.length, 2);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should correct render recursive components', (done) => {
      class Recursive {
        template (ctx) {
          if (ctx.id > 10) {
            return '';
          }

          return `<cat-recursive id="${ctx.id}"></cat-recursive>`;
        }

        render () {
          return {
            id: Number(this.$context.attributes['id']) + 1
          };
        }
      }

      const recursive = {
        constructor: Recursive,
        children: [
          {
            name: 'recursive',
            recursive: true
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<cat-recursive id="2"><cat-recursive id="3"><cat-recursive id="4"><cat-recursive id="5"><cat-recursive id="6"><cat-recursive id="7"><cat-recursive id="8"><cat-recursive id="9"><cat-recursive id="10"></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive></cat-recursive>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-recursive');
          element.setAttribute('id', '1');

          renderer.renderComponent(element, recursive)
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should properly render slot', (done) => {
      class Slot {
        template () {
          return '<slot></slot>';
        }
      }

      const slot = {
        constructor: Slot
      };

      class Root {
        template () {
          return `
            <cat-slot>
              <p>Slot injection</p>
            </cat-slot>
          `
        }
      }

      const root = {
        constructor: Root,
        children: [
          {
            name: 'slot',
            component: slot
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = `
            <cat-slot><slot>
              <p>Slot injection</p>
            </slot></cat-slot>
          `;
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-root');
          renderer.renderComponent(element, root)
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should properly render default content if slot not provided', (done) => {
      class Slot {
        template () {
          return '<slot>Default value</slot>';
        }
      }

      const slot = {
        constructor: Slot
      };

      class Root {
        template () {
          return '<cat-slot></cat-slot>';
        }
      }

      const root = {
        constructor: Root,
        children: [
          {
            name: 'slot',
            component: slot
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<cat-slot><slot>Default value</slot></cat-slot>';
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-root');
          renderer.renderComponent(element, root)
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should properly render nested components inside slot', (done) => {
      class InnerSlot {
        template () {
          return 'Inner Slot';
        }
      }

      const innerSlot = {
        constructor: InnerSlot
      };

      class Slot {
        template () {
          return '<slot></slot>';
        }
      }

      const slot = {
        constructor: Slot
      };

      class Root {
        template () {
          return `
          <cat-slot>
            <cat-inner-slot></cat-inner-slot>
          </cat-slot>
          `;
        }
      }

      const root = {
        constructor: Root,
        children: [
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

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = `
          <cat-slot><slot>
            <cat-inner-slot>Inner Slot</cat-inner-slot>
          </slot></cat-slot>
          `;
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-root');
          renderer.renderComponent(element, root)
            .then(function () {
              assert.strictEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should properly render slot content twice', (done) => {
      let bindQueue = [];
      let renderQueue = [];

      class NestedSlot {
        template () {
          return 'Slot content';
        }

        bind () {
          bindQueue.push('nested-slot');
        }

        render () {
          renderQueue.push('nested-slot');
        }
      }

      class Nested {
        template () {
          return '<slot></slot>';
        }

        bind () {
          bindQueue.push('nested');
        }

        render () {
          renderQueue.push('nested');
        }
      }

      class Root {
        template () {
          return '<cat-nested><cat-nested-slot></cat-nested-slot></cat-nested>'
        }


        bind () {
          bindQueue.push('root');
        }

        render () {
          renderQueue.push('root');
        }
      }

      const nested = {
        constructor: Nested
      };

      const nestedSlot = {
        constructor: NestedSlot
      };

      const root = {
        constructor: Root,
        children: [
          {
            name: 'nested',
            component: nested
          },
          {
            name: 'nested-slot',
            component: nestedSlot
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, root)
            .then(function () {
              const nestedElement = element.querySelector('cat-nested');
              return renderer.renderComponent(nestedElement, nested);
            })
            .then(function () {
              assert.deepEqual(renderQueue, ['root', 'nested', 'nested-slot', 'nested', 'nested-slot']);
              assert.deepEqual(bindQueue, ['root', 'nested', 'nested-slot', 'nested', 'nested-slot']);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should render unique content for two slots', (done) => {
      class Nested {
        template () {
          return '<slot></slot>';
        }
      }

      class Root {
        template () {
          return '<cat-nested>Content 1</cat-nested><cat-nested>Content 2</cat-nested>'
        }
      }

      const nested = {
        constructor: Nested
      };

      const root = {
        constructor: Root,
        children: [
          {
            name: 'nested',
            component: nested
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<cat-nested><slot>Content 1</slot></cat-nested><cat-nested><slot>Content 2</slot></cat-nested>';

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);

          const renderer = new DocumentRenderer(locator);
          const element = window.document.createElement('cat-test');

          renderer.renderComponent(element, root)
            .then(function () {
              assert.deepEqual(element.innerHTML, expected);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should correct re-render slot after it initialized on server', (done) => {
      let renderCalls = 0;

      class Nested {
        template () {
          return '<slot></slot>';
        }

        render () {
          renderCalls += 1;
        }
      }

      class Root {

      }

      class Inner {
        template () {
          return 'Content';
        }

        render () {
          renderCalls += 1;
        }
      }

      const inner = {
        constructor: Inner
      };

      const nested = {
        constructor: Nested
      };

      const root = {
        constructor: Root,
        children: [
          {
            name: 'nested',
            component: nested
          },
          {
            name: 'inner',
            component: inner
          }
        ]
      };

      let html = `<cat-nested><slot><cat-inner>Content</cat-inner></slot></cat-nested>`;

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<slot><cat-inner>Content</cat-inner></slot>';

      eventBus.on('error', done);
      jsdom.env({
        html,
        done: function (errors, window) {
          locator.registerInstance('window', window);
          locator.registerInstance('documentComponent', root);

          const renderer = new DocumentRenderer(locator);

          renderer.initWithState({ args: {} })
            .then(() => {
              const nestedComponent = window.document.querySelector('cat-nested');
              return renderer.renderComponent(nestedComponent, nested)
                .then(() => {
                  assert.deepEqual(renderCalls, 2);
                  assert.deepEqual(nestedComponent.innerHTML, expected, 'Wrong HTML');
                  done();
                });
            })
            .catch(done);
        }
      });
    });
  });

  lab.experiment('#updateState', () => {
    lab.test('Should update all components that depend on changed watchers in descending order', (done) => {
      const renders = [];

      class Component1 {
        template () {
          return `
            Hello from test2
            <cat-test2 id="2" />
          `
        }

        render () {
          renders.push(this.$context.attributes.id);
          return this.$context;
        };
      }

      class Component2 {
        template () {
          return `
            <span>
            Hello from test2
            <cat-test3 id="3" />
            </span>
          `
        }

        render () {
          renders.push(this.$context.attributes.id);
          return this.$context;
        };
      }

      class Component3 {
        template () {
          return 'Hello from test3';
        }

        render () {
          renders.push(this.$context.attributes.id);
          return this.$context;
        };
      }

      const component3 = {
        constructor: Component3
      };

      const component2 = {
        constructor: Component2,
        children: [
          {
            name: 'test3',
            component: component3,
            watcher: {
              update: ['update']
            }
          }
        ]
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2,
            watcher: {
              update: ['update']
            }
          }
        ]
      };

      const document = {
        constructor: class Document {},
        children: [
          {
            name: 'test1',
            component: component1,
            watcher: {
              update: ['update']
            }
          },
          {
            name: 'test3',
            component: component3,
            watcher: {
              update: ['update']
            }
          }
        ]
      };

      const html = `
        <cat-test1 id="1">
          test1<br>
          <div>Hello from test1</div>
          <cat-test2 id="2">test2<br>
            <span>
              Hello from test2
              <cat-test3 id="3">test3<br>Hello from test3</cat-test3>
            </span>
          </cat-test2>
        </cat-test1>
        <cat-test3 id="4">
          test3<br>
          Hello from test3
        </cat-test3>
      `;

      const locator = createLocator(document);
      const eventBus = locator.resolve('eventBus');
      eventBus.on('error', done);

      jsdom.env({
        html: html,
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          renderer.initWithState({
            args: {
              signal: [
                function (args, state) {
                  state.set('update', 'initial');
                }
              ]
            }
          })
            .then(() => {
              assert.strictEqual(renders.length, 0);
              return renderer.updateState({
                args: {
                  signal: [
                    function (args, state) {
                      state.set('update', 'updated');
                    }
                  ]
                }
              });
            })
            .then(() => {
              // We need wait some time to all updates called
              setTimeout(function () {
                try {
                  assert.strictEqual(renders.length, 4);
                  assert.strictEqual(renders[0], '4');
                  assert.strictEqual(renders[1], '1');
                  assert.strictEqual(renders[2], '2');
                  assert.strictEqual(renders[3], '3');
                  done();
                } catch (e) {
                  done(e);
                }
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('Should do nothing if nothing changes', (done) => {
      const renders = [];

      class Component1 {
        template () {
          return `
            Hello from test2
            <cat-test2 id="2" />
          `
        }

        render () {
          renders.push(this.$context.attributes.id);
          return this.$context;
        };
      }

      class Component2 {
        template () {
          return `
            <span>
            Hello from test2
            <cat-test3 id="3" />
            </span>
          `
        }

        render () {
          renders.push(this.$context.attributes.id);
          return this.$context;
        };
      }

      class Component3 {
        template () {
          return 'Hello from test3';
        }

        render () {
          renders.push(this.$context.attributes.id);
          return this.$context;
        };
      }

      const component3 = {
        constructor: Component3
      };

      const component2 = {
        constructor: Component2,
        children: [
          {
            name: 'test3',
            component: component3,
            watcher: {
              update: ['notExistPath']
            }
          }
        ]
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test2',
            component: component2,
            watcher: {
              update: ['notExistPath']
            }
          }
        ]
      };

      const document = {
        constructor: class Document {},
        children: [
          {
            name: 'test1',
            component: component1,
            watcher: {
              update: ['notExistPath']
            }
          },
          {
            name: 'test3',
            component: component3,
            watcher: {
              update: ['notExistPath']
            }
          }
        ]
      };

      const html = `
        <cat-test1 id="1">
          test1<br>
          <div>Hello from test1</div>
          <cat-test2 id="2">test2<br>
            <span>
              Hello from test2
              <cat-test3 id="3">test3<br>Hello from test3</cat-test3>
            </span>
          </cat-test2>
        </cat-test1>
        <cat-test3 id="4">
          test3<br>
          Hello from test3
        </cat-test3>
      `;

      const locator = createLocator(document);
      const eventBus = locator.resolve('eventBus');
      eventBus.on('error', done);

      jsdom.env({
        html: html,
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          renderer.initWithState({
            args: {
              signal: [
                function (args, state) {
                  state.set('update', 'initial');
                }
              ]
            }
          })
            .then(() => {
              assert.strictEqual(renders.length, 0);
              return renderer.updateState({
                args: {
                  signal: [
                    function (args, state) {
                      state.set('update', 'updated');
                    }
                  ]
                }
              });
            })
            .then(() => {
              // We need wait some time to all updates called
              setTimeout(function () {
                try {
                  assert.strictEqual(renders.length, 0);
                  done();
                } catch (e) {
                  done(e);
                }
              }, 10);
            })
            .catch(done);
        }
      });
    });

    lab.test('Should redirect without running signal, if silent update queued', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');
      eventBus.on('error', done);

      let signalCalled = false;

      const routingContext = getRoutingContext(locator, {
        signal: [
          () => {
            signalCalled = true;
          }
        ]
      });

      Object.assign(routingContext, { args: {} });

      class Document { }

      class Link {
        template () {
          return `<a href="#" class="clickable"></a>`;
        }

        render () {
          return {};
        }

        bind () {
          return {
            click: {
              'a.clickable': this.redirect
            }
          }
        }

        redirect () {
          this.$context.redirect('', { silent: true });
        }
      }

      const link = {
        constructor: Link
      };

      const document = {
        constructor: Document,
        children: [
          {
            name: 'link',
            component: link
          }
        ]
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
        </head>
        <body>
          <cat-link><a href="#" class="clickable"></a></cat-link>
        </body>
        </html>
      `;

      jsdom.env({
        html,
        done (errors, window) {
          locator.registerInstance('window', window);
          locator.registerInstance('documentComponent', document);
          locator.register('documentRenderer', DocumentRenderer, true);

          const renderer = locator.resolve('documentRenderer');

          renderer
            .initWithState(routingContext)
            .then(() => {
              let event;
              const links = window.document.querySelectorAll('a.clickable');

              for (let i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              return new Promise(resolve => setTimeout(resolve, 10));
            })
            .then(() => {
              assert.equal(signalCalled, false);
              done();
            })
            .catch(done);
        }
      })
    });

    lab.test('Should run signal, after redirect to new url, if signal defined in url setup', (done) => {
      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');
      eventBus.on('error', done);

      let signalCalled = false;

      const routingContext = getRoutingContext(locator, {
        signal: [
          () => {
            signalCalled = true;
          }
        ]
      });

      Object.assign(routingContext, { args: {} });

      class Document {
        template () {
          return '';
        }
      }

      class Link {
        template () {
          return `<a href="#" class="clickable"></a>`;
        }

        render () {
          return {};
        }

        bind () {
          return {
            click: {
              'a.clickable': this.redirect
            }
          }
        }

        redirect () {
          this.$context.redirect('');
        }
      }

      const link = {
        constructor: Link
      };

      const document = {
        constructor: Document,
        children: [
          {
            name: 'link',
            component: link
          }
        ]
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
        </head>
        <body>
          <cat-link><a href="#" class="clickable"></a></cat-link>
        </body>
        </html>
      `;

      jsdom.env({
        html,
        done (errors, window) {
          locator.registerInstance('window', window);
          locator.registerInstance('documentComponent', document);
          locator.register('documentRenderer', DocumentRenderer, true);

          const renderer = locator.resolve('documentRenderer');

          renderer
            .initWithState(routingContext)
            .then(() => {
              let event;
              let links = window.document.querySelectorAll('a.clickable');

              for (let i = 0; i < links.length; i++) {
                event = window.document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                links[i].dispatchEvent(event);
              }

              return new Promise(resolve => setTimeout(resolve, 10));
            })
            .then(() => {
              assert.equal(signalCalled, true);
              done();
            })
            .catch(done);
        }
      })
    });
  });

  lab.experiment('#createComponent', () => {
    lab.test('Should properly create and render component', (done) => {
      class Component {
        template () {
          return '<div>Hello, World!</div>'
        }
      }

      let component = {
        constructor: Component
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      const expected = '<div>Hello, World!</div>';
      eventBus.on('error', done);

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          renderer.createComponent('cat-test', component)
            .then(function (element) {
              assert.strictEqual(element.innerHTML, expected);
              assert.strictEqual(renderer.getComponentByElement(element) instanceof Component, true);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should properly render nested components', (done) => {
      class Component1 {
        template () {
          return `
              <div>Hello from test1!</div>
              <cat-test2 id="test2"></cat-test2>
              <cat-test3 id="test3"></cat-test3>
            `
        }
      }

      class Component2 {
        template () {
          return '<div>Hello from test2!</div>'
        }
      }

      class Component3 {
        template () {
          return '<div>Hello from test3!</div>'
        }
      }

      class Component4 {
        template () {
          return '<div>Hello from test4!</div>'
        }
      }

      const component4 = {
        constructor: Component4
      };

      const component3 = {
        constructor: Component3
      };

      const component2 = {
        constructor: Component2
      };

      const component1 = {
        constructor: Component1,
        children: [
          {
            name: 'test3',
            component: component3
          },
          {
            name: 'test2',
            component: component2
          }
        ]
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');
      eventBus.on('error', done);

      const expected1 = `
              <div>Hello from test1!</div>
              <cat-test2 id="test2"><div>Hello from test2!</div></cat-test2>
              <cat-test3 id="test3"><div>Hello from test3!</div></cat-test3>
            `;

      const expected2 = '<div>Hello from test4!</div>';

      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          renderer.createComponent('cat-test1', component1, { id: 'test1' })
            .then(function (element) {
              assert.strictEqual(element.innerHTML, expected1);
              return renderer.createComponent('cat-test4', component4, { id: 'test4' });
            })
            .then(function (element) {
              assert.strictEqual(element.innerHTML, expected2);
              done();
            })
            .catch(done);
        }
      });
    });

    lab.test('Should reject promise if tag name is not a string', (done) => {
      class Component {
        template () {

        }
      }

      const component = {
        constructor: Component
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          renderer.createComponent(500, component)
            .then(function () {
              done(new Error('Should fail'));
            })
            .catch(function (reason) {
              assert.strictEqual(reason.message, 'Tag name should be a string and attributes should be an object');
              done();
            });
        }
      });
    });

    lab.test('Should reject promise if attributes set is not an object', (done) => {
      class Component {
        template () {

        }
      }

      const component = {
        constructor: Component
      };

      const locator = createLocator();
      const eventBus = locator.resolve('eventBus');

      eventBus.on('error', done);
      jsdom.env({
        html: ' ',
        done: function (errors, window) {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);

          renderer.createComponent('cat-test', component, 500)
            .then(function () {
              done(new Error('Should fail'));
            })
            .catch(function (reason) {
              assert.strictEqual(reason.message, 'Tag name should be a string and attributes should be an object');
              done();
            });
        }
      });

    });
  });

  lab.experiment('#collectGarbage',  () => {
    lab.test('Should unlink component if it is not in DOM', (done) => {
      const unbinds = [];

      class TestComponent {
        unbind () {
          unbinds.push(this.$context.name);
        }
      }

      const test3 = {
        constructor: class TestComponent3 extends TestComponent {
          template () {
            return ''
          }
        }
      };

      const test2 = {
        constructor: class TestComponent2 extends TestComponent {
          template () {
            return ''
          }
        }
      };

      const test1 = {
        constructor: class TestComponent1 extends TestComponent {
          template () {
            return `
            <cat-test2></cat-test2>
            <cat-test3></cat-test3>
            `
          }
        },
        children: [
          {
            name: 'test2',
            component: test2
          },
          {
            name: 'test3',
            component: test3
          }
        ]
      };

      const locator = createLocator();

      jsdom.env({
        html: ' ',
        done: (errors, window) => {
          locator.registerInstance('window', window);
          const renderer = new DocumentRenderer(locator);
          let componentElements = null;

          Promise.all([
            renderer.createComponent('cat-test1', test1),
            renderer.createComponent('cat-test2', test2),
            renderer.createComponent('cat-test3', test3)
          ])
            .then(elements => {
              componentElements = elements;
              window.document.body.appendChild(elements[1]);
              const areInstances = elements.every(el => {
                const instance = renderer.getComponentByElement(el);
                return instance instanceof TestComponent;
              });
              assert.strictEqual(areInstances, true);
              return renderer.collectGarbage();
            })
            .then(() => {
              const instance1 = renderer.getComponentByElement(componentElements[0]);
              const instance2 = renderer.getComponentByElement(componentElements[1]);
              const instance3 = renderer.getComponentByElement(componentElements[2]);

              assert.strictEqual(instance1, null);
              assert.strictEqual(instance2 instanceof TestComponent, true);
              assert.strictEqual(instance3, null);

              assert.deepEqual(unbinds, [
                'test3',
                'test1',
                'test2',
                'test3'
              ]);
            })
            .then(done)
            .catch(done);
        }
      });
    });
  });
});

function createLocator (documentComponent = {}, config = {}) {
  const locator = new ServiceLocator();
  const eventBus = new events.EventEmitter();

  locator.registerInstance('serviceLocator', locator);
  locator.registerInstance('config', config);
  locator.registerInstance('eventBus', eventBus);
  locator.registerInstance('documentComponent', documentComponent);

  return locator;
}

function getRoutingContext (locator, args) {
  locator.registerInstance('routeDefinition', { args });

  return new ModuleApiProvider(locator);
}
