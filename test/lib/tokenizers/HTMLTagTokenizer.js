const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const tests = require('../../cases/lib/tokenizers/HTMLTagTokenizer.json');
const HTMLTagTokenizer = require('../../../lib/tokenizers/HTMLTagTokenizer');

lab.experiment('lib/tokenizers/HTMLTagTokenizer', function () {
  lab.experiment('#next', function () {
    tests.cases.forEach(function (testCase) {
      lab.test(testCase.description, function (done) {
        var tokenizer = new HTMLTagTokenizer(),
          tokens = [],
          next;
        tokenizer.setTagString(testCase.html);
        do {
          next = tokenizer.next();
          tokens.push({
            name: findName(next.state),
            value: testCase.html.substring(next.start, next.end)
          });
        } while (
        next.state !== HTMLTagTokenizer.STATES.TAG_CLOSE &&
        next.state !== HTMLTagTokenizer.STATES.ILLEGAL
          );
        assert.deepEqual(tokens, testCase.expected);
        done();
      });
    });
  });
});

function findName(state) {
  let name = '';
  Object.keys(HTMLTagTokenizer.STATES)
    .some(function (key) {
      if (HTMLTagTokenizer.STATES[key] === state) {
        name = key;
        return true;
      }

      return false;
    });
  return name;
}
