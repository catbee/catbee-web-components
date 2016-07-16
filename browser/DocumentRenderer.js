'use strict';

const morphdom = require('morphdom');
const errorHelper = require('../lib/helpers/errorHelper');
const moduleHelper = require('../lib/helpers/moduleHelper');
const uuid = require('uuid');
const LocalContextProvider = require('../lib/LocalContextProvider');
const StateManager = require('../lib/StateManager');

const ERROR_MISSED_REQUIRED_COMPONENTS = 'Document component is not register.';

const SPECIAL_IDS = {
  $$head: '$$head',
  $$document: '$$document'
};

const TAG_NAMES = {
  HEAD: 'HEAD',
  STYLE: 'STYLE',
  SCRIPT: 'SCRIPT',
  LINK: 'LINK'
};

// http://www.w3.org/TR/2015/WD-uievents-20150319/#event-types-list
const NON_BUBBLING_EVENTS = {
  abort: true,
  blur: true,
  error: true,
  focus: true,
  load: true,
  mouseenter: true,
  mouseleave: true,
  resize: true,
  unload: true
};

class DocumentRenderer {
  /**
   * Creates a new instance of the document renderer.
   * @param {ServiceLocator} locator - Locator for resolving dependencies.
   */
  constructor (locator) {
    this._locator = locator;
    this._window = locator.resolve('window');
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');

    this._isUpdating = false;
    this._isSilentUpdateQueued = false;
    this._currentRoutingContext = null;

    this._componentInstances = Object.create(null);
    this._componentElements = Object.create(null);
    this._componentBindings = Object.create(null);
    this._componentWatchers = Object.create(null);
    this._componentContexts = Object.create(null);
    this._currentChangedComponents = Object.create(null);

    this._stateManager = new StateManager(locator);

    this._eventBus.on('componentStateChanged', (componentId) => {
      this._currentChangedComponents[componentId] = true;

      // We must wait next tick, before we run update.
      // It allows to collect all sync update events
      Promise.resolve()
        .then(() => this._updateComponents());
    });
  }

  /**
   * Sets the initial state of the application.
   * @param {Object} routingContext - Routing context.
   * @returns {Promise} Promise for nothing.
   */
  initWithState (routingContext) {
    const { args } = routingContext;
    const { signal } = args;
    const document = this._locator.resolve('documentComponent');

    if (!document) {
      this._eventBus.emit('error', ERROR_MISSED_REQUIRED_COMPONENTS);
      return Promise.resolve();
    }

    const patchedRoutingContext = this._patchRoutingContext(routingContext);

    this._currentRoutingContext = patchedRoutingContext;
    this._stateManager.setRoutingContext(patchedRoutingContext);

    return Promise.resolve()
      .then(() => {
        if (!signal) {
          return;
        }

        return this._stateManager.signal(signal, args, this._window.CATBEE_CACHE);
      })
      .then(() => {
        this._stateManager.tree.commit();
        const documentElement = this._window.document.documentElement;
        const action = (element, localContext) => this._initializeComponent(element, localContext);
        return this._traverseComponentsWithContext([documentElement], action, document);
      })
      .catch((e) => this._eventBus.emit('error', e));
  }

  /**
   * Renders a new state of the application.
   * @param {Object} routingContext - Routing context.
   * @returns {Promise} Promise for nothing.
   */
  updateState (routingContext) {
    const { args } = routingContext;
    const { signal } = args;

    const patchedRoutingContext = this._patchRoutingContext(routingContext);

    this._currentRoutingContext = patchedRoutingContext;
    this._stateManager.setRoutingContext(patchedRoutingContext);

    return Promise.resolve()
      .then(() => {
        if (!signal || this._isSilentUpdateQueued) {
          return;
        }

        return this._stateManager.signal(signal, args);
      })
      .then(() => {
        this._isSilentUpdateQueued = false;
      })
      .catch((e) => this._eventBus.emit('error', e));
  }

  /**
   * Renders a component into the HTML element.
   * @param {Element} element - HTML element of the component.
   * @param {Object} rootContext - Root component context
   * @param {Object} [renderingContext] - Component rendering context
   */
  renderComponent (element, rootContext, renderingContext) {
    const action = (actionElement, localContext) => {
      const id = this._getId(actionElement);
      const hadChildrenNodes = (actionElement.children.length > 0);

      if (!renderingContext) {
        renderingContext = this._createRenderingContext();
        renderingContext.rootIds[id] = true;
      }

      if (!localContext) {
        return null;
      }

      renderingContext.renderedIds[id] = true;

      let instance = this._componentInstances[id];
      const ComponentConstructor = localContext.constructor;

      if (!instance) {
        ComponentConstructor.prototype.$context = this._getComponentContext(localContext, actionElement);
        instance = new ComponentConstructor(this._locator);
        instance.$context = ComponentConstructor.prototype.$context;
        this._componentInstances[id] = instance;
      }

      this._componentElements[id] = actionElement;
      this._componentContexts[id] = localContext;

      return Promise.resolve()
        .then(() => this._bindWatcher(localContext, actionElement))
        .then(() => {
          // we need to unbind the whole hierarchy only at
          // the beginning, not for any new elements
          if (!(id in renderingContext.rootIds) || !hadChildrenNodes) {
            return null;
          }

          return this._unbindAll(actionElement, renderingContext);
        })
        .catch((reason) => this._eventBus.emit('error', reason))
        .then(() => {
          const renderMethod = moduleHelper.getMethodToInvoke(instance, 'render');
          return moduleHelper.getSafePromise(renderMethod);
        })
        .then((dataContext) => instance.template(dataContext))
        .catch((reason) => this._handleRenderError(actionElement, reason))
        .then(html => {
          const isHead = actionElement.tagName === TAG_NAMES.HEAD;

          if (html === '' && isHead) {
            return null;
          }

          const tmpElement = actionElement.cloneNode(false);
          tmpElement.innerHTML = html;

          if (isHead) {
            this._mergeHead(actionElement, tmpElement);
            return null;
          }

          const slot = findSlot(tmpElement);

          if (slot && hadChildrenNodes) {
            let fragment = this._window.document.createDocumentFragment();
            let nodes = toArray(actionElement.childNodes);
            nodes.forEach((node) => fragment.appendChild(node));

            slot.innerHTML = '';
            slot.appendChild(fragment);
          }

          morphdom(actionElement, tmpElement, {
            onBeforeMorphElChildren: (foundElement) =>
            foundElement === actionElement || !moduleHelper.isComponentNode(foundElement)
          });
        })
        .then(() => this._bindComponent(actionElement))
        .catch(reason => this._eventBus.emit('error', reason));
    };

    return this._traverseComponentsWithContext([element], action, rootContext)
      .then(() => this._collectRenderingGarbage(renderingContext));
  }

  /**
   * Checks that every instance of the component has an element on the page and
   * removes all references to those components which were removed from DOM.
   * @returns {Promise} Promise for nothing.
   */
  collectGarbage () {
    return Promise.resolve()
      .then(() => {
        const context = {
          roots: []
        };

        Object.keys(this._componentElements)
          .forEach(id => {
            // we should not remove any special elements like HEAD
            if (SPECIAL_IDS.hasOwnProperty(id)) {
              return;
            }

            let current = this._componentElements[id];
            while (current !== this._window.document.documentElement) {
              // the component is located in a detached DOM subtree
              if (current.parentElement === null) {
                context.roots.push(current);
                break;
              }
              // the component is another component's descendant
              if (moduleHelper.isComponentNode(current.parentElement)) {
                break;
              }
              current = current.parentElement;
            }
          });

        return this._removeDetachedComponents(context);
      });
  }

  /**
   * Creates and renders a component element.
   * @param {String} tagName - Name of the HTML tag.
   * @param {Object} component - Component descriptor.
   * @param {Object} [attributes={}] - Element attributes.
   * @returns {Promise<Element>} Promise for HTML element with the rendered component.
   */
  createComponent (tagName, component, attributes = {}) {
    if (typeof (tagName) !== 'string' || (typeof (attributes) !== 'object' || Array.isArray(attributes))) {
      return Promise.reject(
        new Error('Tag name should be a string and attributes should be an object')
      );
    }

    return Promise.resolve()
      .then(() => {
        const componentName = moduleHelper.getOriginalComponentName(tagName);

        if (moduleHelper.isHeadComponent(componentName) || moduleHelper.isDocumentComponent(componentName)) {
          return Promise.reject(new Error(`Component for tag "${tagName}" not found`));
        }

        const safeTagName = moduleHelper.getTagNameForComponentName(componentName);
        const element = this._window.document.createElement(safeTagName);

        Object.keys(attributes)
          .forEach(attributeName => element.setAttribute(attributeName, attributes[attributeName]));

        return this.renderComponent(element, component)
          .then(() => element);
      });
  }

  /**
   * Gets a component instance by ID.
   * @param {string} id Component's element ID.
   * @returns {Object|null} Component instance.
   */
  getComponentById (id) {
    const element = this._window.document.getElementById(id);
    return this.getComponentByElement(element);
  }

  /**
   * Gets component instance by a DOM element.
   * @param {Element} element Component's Element.
   * @returns {Object|null} Component instance.
   */
  getComponentByElement (element) {
    if (!element) {
      return null;
    }
    const id = element[moduleHelper.COMPONENT_ID];
    if (!id) {
      return null;
    }
    return this._componentInstances[id] || null;
  }

  /**
   * Gets a component context using the basic context.
   * @param {Object} localContext - Component details.
   * @param {Element} element - DOM element of the component.
   * @returns {Object} Component's context.
   * @private
   */
  _getComponentContext (localContext, element) {
    const componentContext = Object.create(this._currentRoutingContext);
    const name = moduleHelper.getOriginalComponentName(element.tagName);
    const id = this._getId(element);

    Object.defineProperties(componentContext, {
      name: {
        get: () => name,
        enumerable: true
      },
      attributes: {
        get: () => attributesToObject(element.attributes),
        enumerable: true
      }
    });

    componentContext.element = element;
    componentContext.getComponentById = (id) => this.getComponentById(id);
    componentContext.getComponentByElement = (element) => this.getComponentByElement(element);
    componentContext.createComponent = (tagName, descriptor, attributes) =>
      this.createComponent(tagName, descriptor, attributes);
    componentContext.collectGarbage = () => this.collectGarbage();
    componentContext.signal = (actions, args) => this._stateManager.signal(actions, args);
    componentContext.props = localContext.props;
    componentContext.state = this._stateManager.tree;

    componentContext.getWatcherData = () => {
      var watcher = this._componentWatchers[id];

      if (!watcher) {
        return Promise.resolve();
      }

      return Promise.resolve(
        watcher.get()
      );
    };

    return Object.freeze(componentContext);
  }

  /**
   * Creates a rendering context.
   * @param {Array?} changedComponentsIds
   * @returns {Object} The context object.
   * @private
   */
  _createRenderingContext (changedComponentsIds) {
    return {
      config: this._config,
      renderedIds: Object.create(null),
      unboundIds: Object.create(null),
      isHeadRendered: false,
      bindMethods: [],
      routingContext: this._currentRoutingContext,
      rootIds: Object.create(null),
      roots: changedComponentsIds ? this._findRenderingRoots(changedComponentsIds) : []
    };
  }

  /**
   * Does asynchronous traversal through the components hierarchy.
   * @param {Array} elements Elements to start the search.
   * @param {Object} components Current set of components.
   * @param {function} action Action for every component.
   * @returns {Promise} Promise for the finished traversal.
   * @private
   */
  _traverseComponents (elements, action) {
    if (elements.length === 0) {
      return Promise.resolve();
    }

    const root = elements.shift();

    return Promise.resolve()
      .then(() => action(root))
      .then(() => {
        elements = elements.concat(findNestedComponents(root));
        return this._traverseComponents(elements, action);
      });
  }

  /**
   * Extended traverseComponent method, that support context registration during iterations
   * @param {Array} elements - Elements to start the search.
   * @param {Function} action - Action for every component.
   * @param {Object|null} rootContext - Root context for start iterations.
   * @param {LocalContextProvider} [contextProvider] - Current context provider.
   * @returns {Promise} Promise for the finished traversal.
   * @private
   */
  _traverseComponentsWithContext (elements, action, rootContext, contextProvider) {
    if (elements.length === 0) {
      return Promise.resolve();
    }

    if (!contextProvider) {
      contextProvider = new LocalContextProvider();
      contextProvider.setContext(rootContext);
    }

    const root = elements.shift();

    if (root.$parentId && !rootContext) {
      let localContext = contextProvider.getContextByTagName(root.tagName, root.$parentId);
      contextProvider.setContext(localContext);
    }

    const currentContext = contextProvider.getCurrentContext();

    return Promise.resolve()
      .then(() => action(root, currentContext))
      .then(() => {
        let nestedElements = findNestedComponents(root).map((element) => {
          let parentNode = findParentComponent(element);
          let isSlotNode = moduleHelper.isSlotNode(parentNode);

          if (isSlotNode) {
            element.$parentId = root.$parentId;
          } else {
            element.$parentId = contextProvider.getCurrentId();
          }

          return element;
        });

        elements = elements.concat(nestedElements);
        return this._traverseComponentsWithContext(elements, action, null, contextProvider);
      });
  }

  /**
   * Initializes the element as a component.
   * @param {Element} element - The component's element.
   * @param {Object} localContext - The component's local context.
   * @returns {Promise} Promise for the done initialization.
   * @private
   */
  _initializeComponent (element, localContext) {
    return Promise.resolve()
      .then(() => {
        const id = this._getId(element);

        if (!localContext) {
          return;
        }

        const ComponentConstructor = localContext.constructor;
        ComponentConstructor.prototype.$context = this._getComponentContext(localContext, element);

        const instance = new ComponentConstructor(this._locator);
        instance.$context = ComponentConstructor.prototype.$context;

        this._componentElements[id] = element;
        this._componentInstances[id] = instance;
        this._componentContexts[id] = localContext;

        return this._bindWatcher(localContext, element)
          .then(() => this._bindComponent(element));
      });
  }

  /**
   * Binds all required event handlers to the component.
   * @param {Element} element - Component's HTML element.
   * @returns {Promise} Promise for nothing.
   * @private
   */
  _bindComponent (element) {
    const id = this._getId(element);
    const instance = this._componentInstances[id];

    if (!instance) {
      return Promise.resolve();
    }

    const bindMethod = moduleHelper.getMethodToInvoke(instance, 'bind');

    return moduleHelper.getSafePromise(bindMethod)
      .then(bindings => {
        if (!bindings || typeof (bindings) !== 'object') {
          return;
        }

        this._componentBindings[id] = Object.create(null);

        Object.keys(bindings).forEach((eventName) => {
          eventName = eventName.toLowerCase();

          if (eventName in this._componentBindings[id]) {
            return;
          }

          const selectorHandlers = Object.create(null);

          Object.keys(bindings[eventName]).forEach((selector) => {
            const handler = bindings[eventName][selector];

            if (typeof (handler) !== 'function') {
              return;
            }

            selectorHandlers[selector] = handler.bind(instance);
          });

          this._componentBindings[id][eventName] = {
            handler: this._createBindingHandler(element, selectorHandlers),
            selectorHandlers
          };

          element.addEventListener(
            eventName,
            this._componentBindings[id][eventName].handler,
            NON_BUBBLING_EVENTS.hasOwnProperty(eventName)
          );
        });
      });
  }

  /**
   * Bind state tree watcher
   * @param {Object} localContext - Component details.
   * @param {Element} element - Component's HTML element.
   * @returns {Promise}
   * @private
   */
  _bindWatcher (localContext, element) {
    return Promise.resolve()
      .then(() => {
        var id = this._getId(element);
        var attributes = attributesToObject(element.attributes);
        var watcherDefinition = localContext.watcher;

        if (!watcherDefinition) {
          return;
        }

        if (typeof watcherDefinition === 'function') {
          watcherDefinition = watcherDefinition.apply(null, [attributes]);
        }

        var watcher = this._stateManager.getWatcher(watcherDefinition);
        watcher.on('update', () => this._eventBus.emit('componentStateChanged', id));
        this._componentWatchers[id] = watcher;
      });
  }

  /**
   * Creates a universal event handler for delegated events.
   * @param {Element} componentRoot - Root element of the component.
   * @param {Object} selectorHandlers - Map of event handlers by their CSS selectors.
   * @returns {Function} Universal event handler for delegated events.
   * @private
   */
  _createBindingHandler (componentRoot, selectorHandlers) {
    const selectors = Object.keys(selectorHandlers);

    return (event) => {
      var element = event.target;
      const dispatchedEvent = createCustomEvent(event, () => element);
      var targetMatches = getMatchesMethod(element);

      var isHandled = selectors.some(selector => {
        if (targetMatches(selector)) {
          selectorHandlers[selector](dispatchedEvent);
          return true;
        }
        return false;
      });

      if (isHandled || !event.bubbles) {
        return;
      }

      while (element.parentElement && element !== componentRoot) {
        element = element.parentElement;
        targetMatches = getMatchesMethod(element);
        isHandled = this._tryDispatchEvent(selectors, targetMatches, selectorHandlers, dispatchedEvent);

        if (isHandled) {
          break;
        }
      }
    };
  }

  /**
   * Tries to dispatch an event.
   * @param {Array} selectors - The list of supported selectors.
   * @param {Function} matchPredicate - The function to check if selector matches.
   * @param {Object} handlers - The set of handlers for events.
   * @param {Event} event - The DOM event object.
   * @private
   */
  _tryDispatchEvent (selectors, matchPredicate, handlers, event) {
    return selectors.some(selector => {
      if (!matchPredicate(selector)) {
        return false;
      }
      handlers[selector](event);
      return true;
    });
  }

  /**
   * Unbinds all event handlers from the specified component and all it's descendants.
   * @param {Element} element - Component HTML element.
   * @param {Object} renderingContext - Context of rendering.
   * @returns {Promise} Promise for nothing.
   * @private
   */
  _unbindAll (element, renderingContext) {
    const action = (innerElement) => {
      const id = this._getId(innerElement);
      renderingContext.unboundIds[id] = true;
      return this._unbindComponent(innerElement)
        .then(() => this._unbindWatcher(id));
    };

    return this._traverseComponents([element], action);
  }

  /**
   * Unbinds all event handlers from the specified component.
   * @param {Element} element - Component HTML element.
   * @returns {Promise} Promise for nothing.
   * @private
   */
  _unbindComponent (element) {
    const id = this._getId(element);
    const instance = this._componentInstances[id];

    if (!instance) {
      return Promise.resolve();
    }

    if (id in this._componentBindings) {
      Object.keys(this._componentBindings[id])
        .forEach(eventName => {
          element.removeEventListener(
            eventName,
            this._componentBindings[id][eventName].handler,
            NON_BUBBLING_EVENTS.hasOwnProperty(eventName)
          );
        });
      delete this._componentBindings[id];
    }

    const unbindMethod = moduleHelper.getMethodToInvoke(instance, 'unbind');
    return moduleHelper.getSafePromise(unbindMethod)
      .catch(reason => this._eventBus.emit('error', reason));
  }

  /**
   * Unbind state tree watcher.
   * @param {String} id - Component's ID.
   * @private
   */
  _unbindWatcher (id) {
    var watcher = this._componentWatchers[id];

    if (!watcher) {
      return;
    }

    watcher.off('update');
    watcher.release();
    delete this._componentWatchers[id];
  }

  /**
   * Clears all references to removed components during the rendering process.
   * @param {Object} renderingContext Context of rendering.
   * @private
   */
  _collectRenderingGarbage (renderingContext) {
    Object.keys(renderingContext.unboundIds)
      .forEach(id => {
        // this component was rendered again and we do not need to
        // remove it.
        if (id in renderingContext.renderedIds) {
          return;
        }

        this._removeComponentById(id);
      });
  }

  /**
   * Removes a component from the current list.
   * @param {String} id - Component's ID.
   * @private
   */
  _removeComponentById (id) {
    delete this._componentElements[id];
    delete this._componentInstances[id];
    delete this._componentBindings[id];
    delete this._componentContexts[id];
  }

  /**
   * Removes detached subtrees from the components set.
   * @param {{roots: Array}} context Operation context.
   * @returns {Promise} Promise for finished removal.
   * @private
   */
  _removeDetachedComponents (context) {
    if (context.roots.length === 0) {
      return Promise.resolve();
    }
    const root = context.roots.pop();
    return this._traverseComponents([root], element => this._removeDetachedComponent(element))
      .then(() => this._removeDetachedComponents(context));
  }

  /**
   * Removes detached component.
   * @param {Element} element - Element of the detached component.
   * @returns {Promise} Promise for the removed component.
   * @private
   */
  _removeDetachedComponent (element) {
    const id = this._getId(element);
    return this._unbindComponent(element)
      .then(() => this._removeComponentById(id));
  }

  /**
   * Merges new and existed head elements and applies only difference.
   * The problem here is that we can't re-create or change script and style tags,
   * because it causes blinking and JavaScript re-initialization. Therefore such
   * element must be immutable in the HEAD.
   * @param {Node} head - HEAD DOM element.
   * @param {Node} newHead - New HEAD element.
   * @private
   */
  _mergeHead (head, newHead) {
    if (!newHead) {
      return;
    }

    const headSet = Object.create(null);

    // remove all nodes from the current HEAD except the immutable ones
    for (let i = 0; i < head.childNodes.length; i++) {
      const current = head.childNodes[i];
      if (!isTagImmutable(current)) {
        head.removeChild(current);
        i--;
        continue;
      }
      // we need to collect keys for immutable elements to handle
      // attributes reordering
      headSet[this._getElementKey(current)] = true;
    }

    for (let i = 0; i < newHead.children.length; i++) {
      const current = newHead.children[i];
      if (this._getElementKey(current) in headSet) {
        continue;
      }

      head.appendChild(current);
      // when we append the existing child to another parent, it removes
      // the node from the previous parent
      i--;
    }
  }

  /**
   * Render current queue of changed components.
   * @returns {Promise} Promise for nothing.
   * @private
   */
  _updateComponents () {
    if (this._isUpdating) {
      return Promise.resolve();
    }

    this._isUpdating = true;

    const changedComponentsIds = Object.keys(this._currentChangedComponents);
    let renderingContext = this._createRenderingContext(changedComponentsIds);

    this._currentChangedComponents = Object.create(null);

    var promises = renderingContext.roots.map(root => {
      const id = this._getId(root);
      const rootContext = this._componentContexts[id];
      renderingContext.rootIds[id] = true;

      return this.renderComponent(root, rootContext, renderingContext);
    });

    return Promise.all(promises)
      .catch(reason => this._eventBus.emit('error', reason))
      .then(() => {
        this._isUpdating = false;
      });
  }

  /**
   * Finds all rendering roots on the page for all changed stores.
   * @param {Array} [changedComponentsIds=[]] - List of changed store's names.
   * @returns {Array<Element>} HTML elements that are rendering roots.
   * @private
   */
  _findRenderingRoots (changedComponentsIds = []) {
    var lastRoot;
    var lastRootId;
    var current;
    var currentId;
    var roots = [];
    var rootsSet = Object.create(null);

    changedComponentsIds
      .map((componentId) => {
        return {
          id: componentId,
          element: this._componentElements[componentId]
        }
      })
      .filter((component) => component.element)
      .forEach((component) => {
        current = component.element;
        currentId = component.id;

        lastRoot = current;
        lastRootId = currentId;

        while (current.parentElement) {
          current = current.parentElement;
          currentId = this._getId(current);

          if (!(changedComponentsIds.find((id) => currentId === id))) {
            continue;
          }

          lastRoot = current;
          lastRootId = currentId;
        }

        if (lastRootId in rootsSet) {
          return;
        }

        rootsSet[lastRootId] = true;
        roots.push(lastRoot);
      });

    return roots;
  }

  /**
   * Handles an error while rendering.
   * @param {Element} element - Component's HTML element.
   * @param {Error} error - Error to handle.
   * @returns {Promise<string>} Promise for HTML string.
   * @private
   */
  _handleRenderError (element, error) {
    this._eventBus.emit('error', error);

    return Promise.resolve()
      .then(() => {
        // do not corrupt existing HEAD when an error occurs
        if (element.tagName === TAG_NAMES.HEAD) {
          return '';
        }

        if (!this._config.isRelease && error instanceof Error) {
          return errorHelper.prettyPrint(error, this._window.navigator.userAgent);
        }

        return '';
      })
      .catch(() => '');
  }

  /**
   * Gets an ID of the element.
   * @param {Element} element - HTML element of the component.
   * @returns {String} ID.
   */
  _getId (element) {
    if (element === this._window.document.documentElement) {
      return SPECIAL_IDS.$$document;
    }

    if (element === this._window.document.head) {
      return SPECIAL_IDS.$$head;
    }

    // if the element does not have an ID, we create it
    if (!element[moduleHelper.COMPONENT_ID]) {
      element[moduleHelper.COMPONENT_ID] = uuid.v4();
      // deal with possible collisions
      while (element[moduleHelper.COMPONENT_ID] in this._componentInstances) {
        element[moduleHelper.COMPONENT_ID] = uuid.v4();
      }
    }
    return element[moduleHelper.COMPONENT_ID];
  }

  /**
   * Gets an unique element key using element's attributes and its content.
   * @param {Element} element - HTML element.
   * @returns {string} Unique key for the element.
   * @private
   */
  _getElementKey (element) {
    // some immutable elements have several valuable attributes
    // these attributes define the element identity
    const attributes = [];

    switch (element.nodeName) {
      case TAG_NAMES.LINK:
        attributes.push(`href=${element.getAttribute('href')}`);
        break;
      case TAG_NAMES.SCRIPT:
        attributes.push(`src=${element.getAttribute('src')}`);
        break;
    }

    return `<${element.nodeName} ${attributes.sort().join(' ')}>${element.textContent}</${element.nodeName}>`;
  }

  /**
   * Monkey patch routing context methods.
   * @param {Object} routingContext
   * @private
   */
  _patchRoutingContext (routingContext) {
    const patchedRoutingContext = Object.create(routingContext);

    patchedRoutingContext.redirect = (uriString, options = {}) => {
      this._isSilentUpdateQueued = options.silent;
      routingContext.redirect.apply(routingContext, [uriString]);
    };

    return patchedRoutingContext;
  }
}

/**
 * Creates an imitation of the original Event object but with specified currentTarget.
 * @param {Event} event - Original event object.
 * @param {Function} currentTargetGetter - Getter for the currentTarget.
 * @returns {Event} Wrapped event.
 */
function createCustomEvent (event, currentTargetGetter) {
  const catEvent = Object.create(event);
  const keys = [];
  const properties = {};

  for (let key in event) {
    keys.push(key);
  }

  keys.forEach(key => {
    if (typeof (event[key]) === 'function') {
      properties[key] = {
        get: () => event[key].bind(event)
      };
      return;
    }

    properties[key] = {
      get: () => event[key],
      set: value => {
        event[key] = value;
      }
    };
  });

  properties.currentTarget = {
    get: currentTargetGetter
  };

  Object.defineProperties(catEvent, properties);
  Object.seal(catEvent);
  Object.freeze(catEvent);

  return catEvent;
}

/**
 * Gets a cross-browser "matches" method for the element.
 * @param {Element} element - HTML element.
 * @returns {Function} "matches" method.
 */
function getMatchesMethod (element) {
  const method = (element.matches ||
  element.webkitMatchesSelector ||
  element.mozMatchesSelector ||
  element.oMatchesSelector ||
  element.msMatchesSelector);

  return method.bind(element);
}

/**
 * Find parent component of child element
 * @param {Element} element - HTML element.
 * @returns {Element|null}
 */
function findParentComponent (element) {
  var parent;
  parent = element.parentNode;

  while (parent) {
    if (moduleHelper.isComponentNode(parent) || moduleHelper.isSlotNode(parent)) {
      return parent;
    }

    parent = parent.parentNode;
  }

  return null;
}

/**
 * Converts NamedNodeMap of Attr items to the key-value object map.
 * @param {NamedNodeMap} attributes - List of Element attributes.
 * @returns {Object} Map of attribute values by their names.
 */
function attributesToObject (attributes) {
  const result = Object.create(null);
  Array.prototype.forEach.call(attributes, current => {
    result[current.name] = current.value;
  });
  return result;
}

/**
 * Checks if we can mutate the specified HTML tag.
 * @param {Element} element The DOM element.
 * @returns {boolean} true if element should not be mutated.
 */
function isTagImmutable (element) {
  // these 3 kinds of tags cannot be removed once loaded,
  // otherwise it will cause style or script reloading
  return element.nodeName === TAG_NAMES.SCRIPT ||
    element.nodeName === TAG_NAMES.STYLE ||
    element.nodeName === TAG_NAMES.LINK &&
    element.getAttribute('rel') === 'stylesheet';
}

/**
 * Finds all descendant components of the specified component root.
 * @param {Element} root - Root component's HTML root to begin search with.
 * @private
 */
function findNestedComponents (root) {
  const elements = [];
  const queue = [root];

  // does breadth-first search inside the root element
  while (queue.length > 0) {
    const currentChildren = queue.shift().children;

    if (!currentChildren) {
      continue;
    }

    Array.prototype.forEach.call(currentChildren, (currentChild) => {
      // and they should be components
      if (!moduleHelper.isComponentNode(currentChild)) {
        queue.push(currentChild);
        return;
      }

      elements.push(currentChild);
    });
  }

  return elements;
}

/**
 * Finds first slot of the specified component root.
 * @param {Node} root - Component's HTML root to begin search with.
 * @return {Element|null}
 * @private
 */
function findSlot (root) {
  let slot = null;
  const queue = [root];

  while (queue.length > 0) {
    const currentChildren = queue.shift().children;

    if (!currentChildren) {
      continue;
    }

    if (slot !== null) {
      break;
    }

    Array.prototype.forEach.call(currentChildren, (currentChild) => {
      // we should not go inside component nodes
      if (moduleHelper.isComponentNode(currentChild)) {
        return;
      }

      if (currentChild.tagName === moduleHelper.SLOT_TAG_NAME) {
        slot = currentChild;
      }

      queue.push(currentChild);
    });
  }

  return slot;
}

/**
 * Convert array-like object to real array
 * @param {Array} list
 * @param {Number} [start]
 * @returns {Array}
 */
function toArray (list, start = 0) {
  var i = list.length - start;
  var ret = new Array(i);
  while (i--) {
    ret[i] = list[i + start]
  }
  return ret;
}


module.exports = DocumentRenderer;
