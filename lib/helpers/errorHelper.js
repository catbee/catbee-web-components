const util = require('util');
const escape = require('./escapeHelper');

const TITLE = `Catbee@1.0.0 (<a href="https://github.com/catbee/catbee-web-components/issues "target="_blank">report an issue</a>)`;
const ERROR_MESSAGE_REGEXP = /^(?:[\w$]+): (?:.+)\r?\n/i;
const ERROR_MESSAGE_FORMAT = `<span style="color: red; font-size: 16pt; font-weight: bold;">%s%s</span>`;

module.exports = {
  /**
   * Prints error with pretty formatting.
   * @param {Error} error Error to print.
   * @param {string} userAgent User agent information.
   * @returns {string} HTML with all information about error.
   */
  prettyPrint (error, userAgent) {
    if (!error || typeof (error) !== 'object') {
      return '';
    }

    const dateString = (new Date()).toUTCString() + ';<br/>';
    const userAgentString = (userAgent ? (userAgent + ';<br/>') : '');
    const name = (typeof (error.name) === 'string' ? error.name + ': ' : '');
    const message = String(error.message || '');
    const stack = String(error.stack || '').replace(ERROR_MESSAGE_REGEXP, '');
    const fullMessage = util.format(ERROR_MESSAGE_FORMAT, escape(name), escape(message));

    return '<div style="background-color: white; font-size: 12pt;">' +
      dateString +
      userAgentString +
      TITLE + '<br/><br/>' +
      fullMessage + '<br/><br/>' +
      escape(stack) +
      '</div>';
  }
};

