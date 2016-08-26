'use strict';

class DocumentRenderer {
  /**
   * Creates a new instance of the document renderer.
   * @param {ServiceLocator} locator - Locator for resolving dependencies.
   */
  constructor (locator) {

  }

  /**
   * Sets the initial state of the application.
   * @param {Object} routingContext - Routing context.
   * @returns {Promise} Promise for nothing.
   */
  initWithState (routingContext) {

  }

  /**
   * Renders a new state of the application.
   * @param {Object} routingContext - Routing context.
   * @returns {Promise} Promise for nothing.
   */
  updateState (routingContext) {

  }

  /**
   * Renders a component into the HTML element.
   * @param {Element} rootElement - HTML element of the component.
   * @param {Object} rootContext - Root component context
   */
  renderComponent (rootElement, rootContext) {

  }

  /**
   * Checks that every instance of the component has an element on the page and
   * removes all references to those components which were removed from DOM.
   * @returns {Promise} Promise for nothing.
   */
  collectGarbage () {

  }

  /**
   * Creates and renders a component element.
   * @param {String} tagName - Name of the HTML tag.
   * @param {Object} component - Component descriptor.
   * @param {Object} [attributes={}] - Element attributes.
   * @returns {Promise<Element>} Promise for HTML element with the rendered component.
   */
  createComponent (tagName, component, attributes = {}) {

  }

  /**
   * Gets a component instance by ID.
   * @param {string} id Component's element ID.
   * @returns {Object|null} Component instance.
   */
  getComponentById (id) {

  }

  /**
   * Gets component instance by a DOM element.
   * @param {Element} element Component's Element.
   * @returns {Object|null} Component instance.
   */
  getComponentByElement (element) {

  }
}

module.exports = DocumentRenderer;
