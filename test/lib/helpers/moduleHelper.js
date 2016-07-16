const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const moduleHelper = require('../../../lib/helpers/moduleHelper');

lab.experiment('lib/helpers/moduleHelper', function () {
  lab.experiment('#getCamelCaseName', function () {
    lab.test('should convert name to camel case with prefix', function (done) {
      const badName = 'awesome-module_name';
      const camelCaseName = moduleHelper.getCamelCaseName('some', badName);

      assert.strictEqual(camelCaseName, 'someAwesomeModuleName');
      done();
    });

    lab.test('should convert name to camel without prefix', function (done) {
      const badName = 'awesome-module_name';
      const camelCaseName1 = moduleHelper.getCamelCaseName(null, badName);
      const camelCaseName2 = moduleHelper.getCamelCaseName('', badName);

      assert.strictEqual(camelCaseName1, 'awesomeModuleName');
      assert.strictEqual(camelCaseName2, 'awesomeModuleName');
      done();
    });

    lab.test('should return string with prefix if input is in camel case', function (done) {
      const camelCaseName = moduleHelper.getCamelCaseName('some', 'awesomeModuleName');

      assert.strictEqual(camelCaseName, 'someAwesomeModuleName');
      done();
    });

    lab.test('should return input string if input is in camel case', function (done) {
      const camelCaseName = moduleHelper.getCamelCaseName(null, 'awesomeModuleName');

      assert.strictEqual(camelCaseName, 'awesomeModuleName');
      done();
    });

    lab.test('should handle separators at the end', function (done) {
      const camelCaseName = moduleHelper.getCamelCaseName(null, 'awesome-module-name-');

      assert.strictEqual(camelCaseName, 'awesomeModuleName');
      done();
    });

    lab.test('should return empty string if input is empty', function (done) {
      const camelCaseName1 = moduleHelper.getCamelCaseName(null, null);
      const camelCaseName2 = moduleHelper.getCamelCaseName('', '');

      assert.strictEqual(camelCaseName1, '');
      assert.strictEqual(camelCaseName2, '');
      done();
    });
  });

  lab.experiment('#getOriginalComponentName', function () {
    lab.test('should return name without prefix', function (done) {
      const originalName = moduleHelper.getOriginalComponentName(moduleHelper.COMPONENT_PREFIX + 'some');
      assert.strictEqual(originalName, 'some');
      done();
    });
    lab.test('should return empty string for null value', function (done) {
      const originalName = moduleHelper.getOriginalComponentName(null);
      assert.strictEqual(originalName, '');
      done();
    });
  });

  lab.experiment('#getTagNameForComponentName', function () {
    lab.test('should return name with prefix', function (done) {
      const tagName = moduleHelper.getTagNameForComponentName('some');
      assert.strictEqual(tagName, moduleHelper.COMPONENT_PREFIX.toUpperCase() + 'SOME');
      done();
    });
    lab.test('should return name without prefix for HEAD', function (done) {
      const tagName = moduleHelper.getTagNameForComponentName('head');
      assert.strictEqual(tagName, 'HEAD');
      done();
    });
    lab.test('should return name HTML without prefix for document', function (done) {
      const tagName = moduleHelper.getTagNameForComponentName('document');
      assert.strictEqual(
        tagName, moduleHelper.DOCUMENT_ELEMENT_NAME.toUpperCase()
      );
      done();
    });
    lab.test('should return empty string for null value', function (done) {
      const tagName = moduleHelper.getTagNameForComponentName(null);
      assert.strictEqual(tagName, '');
      done();
    });
  });

  lab.experiment('#getMethodToInvoke', function () {
    lab.test('should find method in module', function (done) {
      const module = {
          someMethodToInvoke: function () {
            return 'hello';
          }
        };
      const name = 'method-to-invoke';
      const method = moduleHelper.getMethodToInvoke(module, 'some', name);

      assert.strictEqual(typeof (method), 'function');
      assert.strictEqual(method(), 'hello');
      done();
    });

    lab.test('should find default method in module and pass name into it', function (done) {
      const name = 'method-to-invoke';
      const module = {
          some: function (passedName) {
            assert.strictEqual(passedName, name);
            return 'hello';
          }
        };
      const method = moduleHelper.getMethodToInvoke(module, 'some', name);

      assert.strictEqual(typeof (method), 'function');
      assert.strictEqual(method(), 'hello');
      done();
    });

    lab.test('should return method with promise if do not find in module', function (done) {
      const module = {};
      const name = 'method-to-invoke';
      const method = moduleHelper.getMethodToInvoke(module, 'some', name);

      assert.strictEqual(typeof (method), 'function');
      assert.strictEqual(method() instanceof Promise, true);
      done();
    });

    lab.test('should return method with promise if arguments are wrong', function (done) {
      const module = null;
      const name = '';
      const method = moduleHelper.getMethodToInvoke(module, 'some', name);

      assert.strictEqual(typeof (method), 'function');
      assert.strictEqual(method() instanceof Promise, true);
      done();
    });
  });
});
