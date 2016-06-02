var morphdom = require('morphdom');
var errorHelper = require('../lib/helpers/errorHelper');
var moduleHelper = require('../lib/helpers/moduleHelper');
var State = require('../lib/State');
var uuid = require('uuid');

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
  constructor (locator) {
    this._locator = locator;
    this._window = locator.resolve('window');
    this._eventBus = locator.resolve('eventBus');
    this._config = locator.resolve('config');

    this._isUpdating = false;
    this._currentRoutingContext = null;
    this._state = null;
    this._componentInstances = Object.create(null);
    this._componentElements = Object.create(null);
    this._componentBindings = Object.create(null);
    this._componentWatchers = Object.create(null);
    this._localContextRegistry = Object.create(null);
    this._currentChangedComponents = Object.create(null);

    this._eventBus.on('componentStateChanged', (componentId) => {
      this._currentChangedComponents[componentId] = true;

      // We must wait next tick, before we run update.
      // It allows to collect all sync update events
      Promise.resolve()
        .then(() => this._updateComponents());
    });
  }

  initWithState (routingContext) {
    return Promise.resolve()
      .then(() => {
        this._currentRoutingContext = routingContext;
        this._state = new State(this._locator);

        var signal = routingContext.args.signal;

        if (!signal || !Array.isArray(signal)) {
          return;
        }

        return this._state.signal(signal, routingContext, routingContext.args)
          .then(() => this._state.tree.commit()); // Tree should clear the updates queue;;
      })
      .then(() => {
        const documentElement = this._window.document.documentElement;
        const action = (element) => this._initializeComponent(element);
        return this._traverseComponents([documentElement], action);
      })
      .catch(reason => this._eventBus.emit('error', reason));
  }

  updateState (routingContext) {
    return Promise.resolve()
      .then(() => {
        this._currentRoutingContext = routingContext;
        var signal = routingContext.args.signal;

        if (!signal || !Array.isArray(signal)) {
          return;
        }

        return this._state.signal(signal, routingContext, routingContext.args)
          .then(() => this._state.tree.commit()); // Tree should clear the updates queue
      })
      .catch(reason => this._eventBus.emit('error', reason));
  }

  renderComponent (element, rootComponentDescriptor, renderingContext) {
    return Promise.resolve()
      .then(() => {
        const id = this._getId(element);
        const componentName = moduleHelper.getOriginalComponentName(element.tagName);
        var rootComponentContext;

        if (rootComponentDescriptor) {
          rootComponentContext = {
            name: componentName,
            component: rootComponentDescriptor
          };
        }

        if (!renderingContext) {
          renderingContext = this._createRenderingContext();
          renderingContext.rootIds[id] = true;
        }

        const hadChildrenNodes = (element.children.length > 0);
        const localContext = this._generateLocalContext(element, rootComponentContext);

        if (!localContext) {
          return null;
        }

        renderingContext.renderedIds[id] = true;

        let instance = this._componentInstances[id];
        const ComponentConstructor = localContext.constructor;

        if (!instance) {
          ComponentConstructor.prototype.$context = this._getComponentContext(element);
          instance = new ComponentConstructor(this.locator);
          instance.$context = ComponentConstructor.prototype.$context;
          this._componentInstances[id] = instance;
        }

        this._componentElements[id] = element;

        return Promise.resolve()
          .then(() => {
            // we need to unbind the whole hierarchy only at
            // the beginning, not for any new elements
            if (!(id in renderingContext.rootIds) || !hadChildrenNodes) {
              return [];
            }

            return this._unbindAll(element, renderingContext);
          })
          .catch(reason => this._eventBus.emit('error', reason))
          .then(() => this._bindWatcher(localContext, element))
          .then(() => {
            const renderMethod = moduleHelper.getMethodToInvoke(instance, 'render');
            return moduleHelper.getSafePromise(renderMethod);
          })
          .then(dataContext => instance.template(dataContext))
          .catch((reason) => this._handleRenderError(element, reason))
          .then(html => {
            const isHead = element.tagName === TAG_NAMES.HEAD;
            if (html === '' && isHead) {
              return [];
            }

            const tmpElement = element.cloneNode(false);
            tmpElement.innerHTML = html;

            if (isHead) {
              this._mergeHead(element, tmpElement);
              return [];
            }

            morphdom(element, tmpElement, {
              onBeforeMorphElChildren: (foundElement) =>
                foundElement === element || !moduleHelper.isComponentNode(foundElement)
            });

            const promises = this._findNestedComponents(element)
              .map(child => this.renderComponent(child, null, renderingContext));

            return Promise.all(promises);
          })
          .then(() => this._bindComponent(element))
          .then(() => {
            // collecting garbage only when
            // the whole rendering is finished
            if (!(id in renderingContext.rootIds) || !hadChildrenNodes) {
              return;
            }
            this._collectRenderingGarbage(renderingContext);
          })
          .catch(reason => this._eventBus.emit('error', reason));
      });
  }

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

  createComponent (tagName, component, attributes = {}) {
    if (typeof (tagName) !== 'string' || (typeof (attributes) !== 'object' || Array.isArray(attributes))) {
      return Promise.reject(
        new Error('Tag name should be a string and attributes should be an object')
      );
    }

    attributes = attributes || Object.create(null);

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

  getComponentById (id) {
    const element = this._window.document.getElementById(id);
    return this.getComponentByElement(element);
  }

  getComponentByElement(element) {
    if (!element) {
      return null;
    }
    const id = element[moduleHelper.COMPONENT_ID];
    if (!id) {
      return null;
    }
    return this._componentInstances[id] || null;
  }

  _generateLocalContext (element, rootElementContext) {
    const componentId = this._getId(element);

    if (rootElementContext) {
      this._localContextRegistry[componentId] = rootElementContext;
      return contextToDescriptor(rootElementContext);
    } else {
      const componentName = moduleHelper.getOriginalComponentName(element.tagName);
      const parentComponent = findParentComponent(element);

      // All descendant components must get context from the parent node
      if (!parentComponent) {
        return;
      }

      const parentId = this._getId(parentComponent);
      const parentContext = this._localContextRegistry[parentId];

      // If component is not described in the parent node, it can't be rendered
      if (!parentContext || !parentContext.component.children) {
        return;
      }

      // Extend local registry
      var componentContext = parentContext.component.children.find((child) => child.name === componentName);

      if (!componentContext) {
        return;
      }

      this._localContextRegistry[componentId] = componentContext;
      return contextToDescriptor(componentContext);
    }
  }

  _getComponentContext (element) {
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
    componentContext.signal = (actions, args) => this._state.signal(actions, this._currentRoutingContext, args);
    componentContext.props = this._localContextRegistry[id].props;

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

  _traverseComponents (elements, action) {
    if (elements.length === 0) {
      return Promise.resolve();
    }

    const root = elements.shift();

    return Promise.resolve()
      .then(() => action(root))
      .then(() => {
        elements = elements.concat(this._findNestedComponents(root));
        return this._traverseComponents(elements, action);
      });
  }

  _findNestedComponents (root) {
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

  _initializeComponent (element) {
    return Promise.resolve()
      .then(() => {
        const id = this._getId(element);
        const componentName = moduleHelper.getOriginalComponentName(element.tagName);
        const isDocument = moduleHelper.isDocumentComponent(componentName);
        var rootContext;

        if (isDocument) {
          var documentComponentDescriptor = this._locator.resolve('documentComponent');

          rootContext = {
            name: 'document',
            component: documentComponentDescriptor
          };
        }

        const localContext = this._generateLocalContext(element, rootContext);

        if (!localContext) {
          return;
        }

        const ComponentConstructor = localContext.constructor;
        ComponentConstructor.prototype.$context = this._getComponentContext(element);

        const instance = new ComponentConstructor(this._locator);
        instance.$context = ComponentConstructor.prototype.$context;

        this._componentElements[id] = element;
        this._componentInstances[id] = instance;

        return this._bindWatcher(localContext, element)
          .then(() => this._bindComponent(element));
      });
  }

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

  _bindWatcher (localContext, element) {
    var id = this._getId(element);
    var attributes = attributesToObject(element.attributes);
    var watcherDefinition = localContext.watcher;

    if (!watcherDefinition) {
      return Promise.resolve();
    }

    if (typeof watcherDefinition === 'function') {
      watcherDefinition = watcherDefinition.apply(null, [attributes]);
    }

    var watcher = this._state.getWatcher(watcherDefinition);
    watcher.on('update', () => this._eventBus.emit('componentStateChanged', id));
    this._componentWatchers[id] = watcher;

    return Promise.resolve();
  }

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

  _tryDispatchEvent (selectors, matchPredicate, handlers, event) {
    return selectors.some(selector => {
      if (!matchPredicate(selector)) {
        return false;
      }
      handlers[selector](event);
      return true;
    });
  }

  _unbindAll (element, renderingContext) {
    const action = (innerElement) => {
      const id = this._getId(innerElement);
      renderingContext.unboundIds[id] = true;
      return this._unbindComponent(innerElement)
        .then(() => this._unbindWatcher(id));
    };

    return this._traverseComponents([element], action);
  }

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

  _unbindWatcher (id) {
    var watcher = this._componentWatchers[id];

    if (!watcher) {
      return;
    }

    watcher.off('update');
    watcher.release();
    delete this._componentWatchers[id];
  }

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

  _removeComponentById (id) {
    delete this._componentElements[id];
    delete this._componentInstances[id];
    delete this._componentBindings[id];
  }

  _removeDetachedComponents(context) {
    if (context.roots.length === 0) {
      return Promise.resolve();
    }
    const root = context.roots.pop();
    return this._traverseComponents([root], element => this._removeDetachedComponent(element))
      .then(() => this._removeDetachedComponents(context));
  }

  _removeDetachedComponent (element) {
    const id = this._getId(element);
    return this._unbindComponent(element)
      .then(() => this._unbindWatcher(id))
      .then(() => this._removeComponentById(id));
  }

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

  _updateComponents () {
    if (this._isUpdating) {
      return Promise.resolve();
    }

    this._isUpdating = true;

    var changedComponentsIds = Object.keys(this._currentChangedComponents);
    var renderingContext = this._createRenderingContext(changedComponentsIds);

    var promises = renderingContext.roots.map(root => {
      var id = this._getId(root);
      renderingContext.rootIds[id] = true;
      return this.renderComponent(root, false, renderingContext);
    });

    return Promise.all(promises)
      .catch(reason => this._eventBus.emit('error', reason))
      .then(() => {
        this._isUpdating = false;
      });
  }

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
}

function createCustomEvent (event, currentTargetGetter) {
  const catEvent = Object.create(event);
  const keys = [];
  const properties = {};

  for (const key in event) {
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

function getMatchesMethod (element) {
  const method = (element.matches ||
  element.webkitMatchesSelector ||
  element.mozMatchesSelector ||
  element.oMatchesSelector ||
  element.msMatchesSelector);

  return method.bind(element);
}

function findParentComponent (element) {
  var parent;
  parent = element.parentNode;

  while (parent) {
    if (moduleHelper.isComponentNode(parent)) {
      return parent;
    }

    parent = parent.parentNode;
  }

  return null;
}

function contextToDescriptor (context) {
  return Object.assign({
    name: context.name,
    watcher: context.watcher
  }, context.component)
}

function attributesToObject (attributes) {
  const result = Object.create(null);
  Array.prototype.forEach.call(attributes, current => {
    result[current.name] = current.value;
  });
  return result;
}

function isTagImmutable (element) {
  // these 3 kinds of tags cannot be removed once loaded,
  // otherwise it will cause style or script reloading
  return element.nodeName === TAG_NAMES.SCRIPT ||
    element.nodeName === TAG_NAMES.STYLE ||
    element.nodeName === TAG_NAMES.LINK &&
    element.getAttribute('rel') === 'stylesheet';
}

module.exports = DocumentRenderer;
