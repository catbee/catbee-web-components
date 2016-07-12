const util = require('util');

const TITLE = `Catbee@1.0.0 (<a href="https://github.com/catbee/catbee-web-components/issues "target="_blank">report an issue</a>)`;
const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /\"/g;
const SINGLE_QUOT = /\'/g;
const ERROR_MESSAGE_REGEXP = /^(?:[\w$]+): (?:.+)\r?\n/i;
const ERROR_MESSAGE_FORMAT = `<span style="color: red; font-size: 16pt; font-weight: bold;">%s%s</span>`;
const NEW_LINE = /\r?\n/g;

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

/**
 * Escapes error text.
 * @param {string} value Error text.
 * @returns {string} escaped and formatted string.
 */
function escape (value) {
  return value
    .replace(AMP, '&amp;')
    .replace(LT, '&lt;')
    .replace(GT, '&gt;')
    .replace(QUOT, '&quot;')
    .replace(SINGLE_QUOT, '&#39;')
    .replace(NEW_LINE, '<br/>');
}
