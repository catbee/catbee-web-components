const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const testCases = require('../../cases/lib/streams/ComponentReadable.json');
const ServerResponse = require('../../mocks/ServerResponse');
const ComponentReadable = require('../../../lib/streams/ComponentReadable');
const ServiceLocator = require('catberry-locator');
const { EventEmitter } = require('events');

lab.experiment('lib/streams/ComponentReadable', function () {
  lab.experiment('#renderHtml', function () {
    testCases.cases.forEach(function (testCase) {
      lab.test(testCase.name, function (done) {
        let concat = '';
        const parser = new ComponentReadable(createContext(), testCase.inputStreamOptions);

        parser._isFlushed = true;

        parser._foundComponentHandler = function (tagDetails) {
          var id = tagDetails.attributes.id || '';
          return Promise.resolve('content-' + tagDetails.name + id);
        };

        parser.renderHTML(testCase.input);

        parser
          .on('data', function (chunk) {
            concat += chunk;
          })
          .on('end', function () {
            assert.strictEqual(concat, testCase.expected, 'Wrong HTML content');
            done();
          });
      });
    });
  });
});

function createContext() {
  const locator = new ServiceLocator();
  const eventBus = new EventEmitter();

  locator.registerInstance('eventBus', eventBus);
  locator.registerInstance('config', {});


  return {
    locator: locator,
    routingContext: {
      middleware: {
        response: new ServerResponse(),
        next: function () {}
      }
    }
  };
}
