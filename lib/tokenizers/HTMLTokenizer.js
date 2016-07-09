'use strict';

const STATES = {
  ILLEGAL: -1,
  INITIAL: 0,
  CONTENT: 1,
  COMPONENT: 2,
  COMMENT: 3,
  END: 4,
  SLOT: 5
};

Object.freeze(STATES);

const COMPONENT_TAG_NAME_REGEXP = /^<((cat-)|((document|head|body)[\s/>]))/i;
const COMPONENT_NAME_MIN_LENGTH = 10;
const SLOT_TAG_REGEXP = /^<((slot)[\s/>])/i;
const SLOT_MIN_LENGTH = 6;

class HTMLTokenizer {

  /**
   * Creates a new instance of the simplified streaming HTML tokenizer.
   */
  constructor () {
    /**
     * Current token buffer.
     * @type {string}
     * @private
     */
    this._source = '';

    /**
     * Current index in buffer.
     * @type {number}
     * @private
     */
    this._currentIndex = 0;

    /**
     * Current token identifier.
     * @type {number}
     * @private
     */
    this._currentState = STATES.INITIAL;
  }

  /**
   * Gets the state constants map.
   */
  static get STATES () {
    return STATES;
  }

  /**
   * Sets a HTML string to the tokenizer.
   * @param {string} html HTML string.
   */
  setHTMLString (html) {
    this._source = html;
    this._currentIndex = 0;
    this._currentState = STATES.INITIAL;
  }

  /**
   * Gets a next token.
   * @returns {{state: number, value: string}} Token descriptor.
   */
  next () {
    const start = this._currentIndex;
    const state = this._currentState;

    switch (this._currentState) {
      case STATES.CONTENT:
        this.content();
        break;
      case STATES.COMPONENT:
        this.component();
        break;
      case STATES.COMMENT:
        this.comment();
        break;
      case STATES.SLOT:
        this.slot();
        break;
      case STATES.END:
        return {
          state,
          value: null
        };
      case STATES.ILLEGAL:
        this._currentState = STATES.INITIAL;
        this._currentIndex++;
        break;
      default:
        this.initial();
        return this.next();
    }

    let value = this._source.substring(start, this._currentIndex);

    return {
      state, value
    };
  }

  /**
   * Switches machine to the "data" state.
   */
  initial () {
    if (this._currentIndex >= this._source.length) {
      this._currentState = STATES.END;
      return;
    }

    // maybe comment or component
    if (this._source[this._currentIndex] === '<') {
      // comment
      if (this._source[this._currentIndex + 1] === '!') {
        if (this._source[this._currentIndex + 2] === '-' &&
          this._source[this._currentIndex + 3] === '-') {
          this._currentState = STATES.COMMENT;
          return;
        }

        this._currentState = STATES.CONTENT;
        return;
      }

      if (this.checkIfComponent()) {
        this._currentState = STATES.COMPONENT;
        return;
      }

      if (this.checkIfSlot()) {
        this._currentState = STATES.SLOT;
        return;
      }
    }

    this._currentState = STATES.CONTENT;
  }

  /**
   * Switches machine to the "tag" state.
   */
  component () {
    this._currentIndex += 5;
    while (this._currentIndex < this._source.length) {
      if (this._source[this._currentIndex] === '>') {
        this._currentIndex++;
        this._currentState = STATES.INITIAL;
        return;
      }
      this._currentIndex++;
    }
    this._currentState = STATES.ILLEGAL;
  }

  /**
   * Switches machine to the "content" state.
   */
  content () {
    this._currentIndex++;
    while (this._currentIndex < this._source.length) {
      // Should split closing tag and content to two different tokens
      if (this._source[this._currentIndex] === '<' || this._source[this._currentIndex - 1] === '>') {
        this._currentState = STATES.INITIAL;
        return;
      }
      this._currentIndex++;
    }
    this._currentState = STATES.END;
  }

  /**
   * Switches machine to the "comment" state.
   */
  comment () {
    this._currentIndex += 4;

    while (this._currentIndex < this._source.length) {
      if (this._source[this._currentIndex] === '-') {
        if (this._currentIndex + 2 >= this._source.length) {
          this._currentState = STATES.ILLEGAL;
          return;
        }

        if (this._source[this._currentIndex + 1] === '-' &&
          this._source[this._currentIndex + 2] === '>') {
          this._currentIndex += 3;
          this._currentState = STATES.INITIAL;
          return;
        }
      }
      this._currentIndex++;
    }
    this._currentState = STATES.ILLEGAL;
  }

  /**
   * Switches machine to the "slot" state.
   */
  slot () {
    this._currentIndex += 5;

    while (this._currentIndex < this._source.length) {
      if (this._source[this._currentIndex] === '>') {
        this._currentIndex++;
        this._currentState = STATES.INITIAL;
        return;
      }
      this._currentIndex++;
    }

    this._currentState = STATES.ILLEGAL;
  }

  /**
   * Checks if following HTML is a component.
   * @returns {boolean} Is it a component?
   */
  checkIfComponent () {
    const testString = this._source.substr(this._currentIndex, COMPONENT_NAME_MIN_LENGTH);
    return COMPONENT_TAG_NAME_REGEXP.test(testString);
  }

  /**
   * Checks if following HTML is a slot.
   * @returns {boolean} Is it a slot?
   */
  checkIfSlot () {
    const testString = this._source.substr(this._currentIndex, SLOT_MIN_LENGTH);
    return SLOT_TAG_REGEXP.test(testString);
  }
}

module.exports = HTMLTokenizer;
