'use strict';

class ComponentRenderer {
  constructor (context) {
    this._context = context;
    this._processingFoundTagPromise = null;
    this._isCanceled = false;

  }

  renderDocumentComponent () {
    if (this._isCanceled || this._context.isDocumentRendered) {
      return;
    }

    return this._foundComponentHandler({
      context: this._localContextProvider.getCurrentContext(),
      attributes: Object.create(null)
    });
  }

  /**
   * Handle founded component and render it to string.
   * @param {Object} tagDetails
   * @param {Object} tagDetails.context - Local context associated with current tag.
   * @param {Object} tagDetails.attributes - Component attributes.
   * @returns {Promise}
   * @private
   */
  _foundComponentHandler (tagDetails) {

  }
}

module.exports = ComponentRenderer;
