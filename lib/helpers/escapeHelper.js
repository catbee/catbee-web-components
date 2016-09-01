const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /\"/g;
const SINGLE_QUOT = /\'/g;
const NEW_LINE = /\r?\n/g;

/**
 * Escapes error text.
 * @param {string} value Error text.
 * @returns {string} escaped and formatted string.
 */
module.exports = function escape (value) {
  return value
    .replace(AMP, '&amp;')
    .replace(LT, '&lt;')
    .replace(GT, '&gt;')
    .replace(QUOT, '&quot;')
    .replace(SINGLE_QUOT, '&#39;')
    .replace(NEW_LINE, '<br/>');
};
