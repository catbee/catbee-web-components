## Catbee Web Components

DocumentRenderer implementaion based on [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components), spiced by [Appstate](https://github.com/catbee/appstate) and [Baobab](https://github.com/Yomguithereal/baobab) for state management. You can use it with any template engine (jade, handlebars, dust) and not worry about browser rendering because it uses [morphdom](https://github.com/patrick-steele-idem/morphdom) for partial DOM updates instead of full-page rerendering.

### Getting Started

Web components is one of the implementations of Catbee view layer. It should be registered as Catbee service and provided root document component. Below is a code example for integration in browser.

``` javascript
const catbee = require('catbee');
const components = require('catbee-web-components');
const cat = catbee.create();

// Describe first component
const component = {
  constructor: class Document {
    template () {
      return 'Hello world';
    }
  }
}

components.register(cat.locator, component);

cat.startWhenReady();
```

Similarly, it can be integrated on server.

``` javascript
const catbee = require('catbee');
const components = require('catbee-web-components');
const express = require('express');

const cat = catbee.create();
const app = express();

// Describe first component
const component = {
  constructor: class Document {
    template () {
      return 'Hello world';
    }
  }
}

components.register(cat.locator, component);

app.use(cat.getMiddleware());
app.listen(3000);
```

### Instalation

``` 
npm install catbee-web-components --save
```

### Registration

``` javascript
const components = require('catbee-web-components');
components.register(locator, root);
```

### Component detection

Catbee Web Components marks tag as component if it has `cat-*` prefix.
Head is special name, and can be used without prefix.

### Component Specification

``` javascript
class Component {
  constructor (locator) {
    // Every component get locator as argument in constructor, 
    // it's can be used for resolve services (config, uhr, api, etc...)
    this._config = locator.resolve('config');
  }
  
  // Template is a function that is called when you render component to HTML string
  // It accepts ctx as a first argument, and should return string.
  // You can use any template language that can be compiled to function.
  // For example, you can use Handlebars require hook on server, 
  // and webpack loader for client side bundle, with the following code:
  // 
  // constructor () {
  //   this.template = require('./template.hbs');
  // }
  template (ctx) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head></head>
      <body>
        <a class="link">Hello ${ctx.world}</a>
        <cat-main></cat-main>
        <script src="/build.js"></script>
      </body>
      </html>
    `
  }
  
  render () {
    // This method creates ctx for template function
    // You should return Object or Promise resolved by Object
    // Also here you can make any DOM manipulation, because at this point 
    // all nodes are already in DOM.
    return { 
      world: 'Earth'
    }
  }
  
  bind () {
    // This method should return DOM event bindings map as Promise or Object
    return {
      click: {
        'a.link': (e) => console.log(e.currentTarget)
      }
    }
  }
  
  unbind () {
    // This method can be used as dispose component hook.
    // It's called before DOM gets disposed and event listeners detached.
  }
}

module.exports = {
  // This is component descriptor.
  // It's provide information about component context usage
  constrcutor: Component,
  children: [
    // Here should be described all chidren components (cat-*)
    // Document and head, it's special names used by library for better dev expirience.
    {
      name: "head",
      component: require('./headDescriptor') // You should head descriptor, same object as exports here
    },
    {
      name: "main",
      component: require('./mainDescriptor'),
      watcher: {
        value: ['path', 'to', 'value']
      }, // Bind to component part of data tree. Use this.$context.getWatcherData() to get it.
      props: {
        size: 'big'
      } // Pass to component some static props. Will be avaliable as this.$context.props
    }
  ]
}
```

### Shared context
Catbee sets as the property $context for every instance of each signal action and component.

- __this.$context.isBrowser__ – true if code is being executed in the browser.
- __this.$context.isServer__ – true if code is being executed on the server.
- __this.$context.userAgent__ – the current user agent string of the environment.
- __this.$context.cookie__ – the current cookie wrapper object.
- __this.$context.location__ – the current URI object that contains the current location.
- __this.$context.referrer__ – the current URI object that contains the current referrer.
- __this.$context.locator__ – the Service Locator of the application.
- __this.$context.redirect('String')__ – redirects to a specified location string. If used while rendering the document or head component, this action will be accomplished using HTTP headers and status codes on the server, else via an inline `<script>` tag.
- __this.$context.notFound()__ – hands over request handling to the next express/connect middleware. If used while rendering the document or head component, this action will be accomplished using HTTP headers and status codes on the server, else via an inline `<script>` tag.

### Component context
Every component's $context is extended with the following properties & methods:

- __this.$context.getWatcherData()__ - return Promise resolved by state tree projection data.
- __this.$context.signal(actions, args)__ - run [appstate](https://github.com/catbee/appstate) signal with actions array and args object.
- __this.$context.state__ - the current application state reference.
- __this.$context.props__ - the set of props passed by parent component.
- __this.$context.element__ – the current DOM element that represents the current component.
- __this.$context.attributes__ – the set of attributes which component's DOM element has at the moment.
- __this.$context.getComponentById('id')__ – gets another component object by ID of its element.
- __this.$context.getComponentByElement(domElement)__ – gets another component's object by its DOM element.
- __this.$context.createComponent('tagName', descriptor, attributesObject)__ – creates a new component's instance and returns a promise of its DOM element.
- __this.$context.collectGarbage()__ – collects all components which have been created using the createComponent('tagName', attributesObject) method and are not attached to the DOM at the moment.

### Component Slots
[Slots](https://github.com/w3c/webcomponents/blob/gh-pages/proposals/Slots-Proposal.md) it's part of W3C Web Components specification.
Slots allow you inject content from parent-to-child. Catbee support bare-bone version of this feature.

Example:

```
// Child.js
class Child {
  template () {
    return '<slot></slot>'
  }
}

module.exports = {
  constructor: Child
}

// Parent.js
class Parent {
  template () {
    return '<cat-child>Content injection</cat-child>';
  }
}

module.exports = {
  constructor: Parent,
  children: [
    {
      name: 'child',
      component: require('./Child')
    }
  ]
}

// Result HTML
<cat-parent>
  <cat-child><slot>Content injected</slot></cat-child>
</cat-parent>
```

Features supported:

- Inject components (should be described in parent)
- Default values if content not provided

### Data flow

Library provides built-in data-flow system.

![Data Flow](https://raw.githubusercontent.com/catbee/catbee-web-components/master/image.png "Data Flow")

__Core things:__

- Components are stateless
- Components can't directly change state
- Components send signals
- Signals run actions that mutate state
- Components watch tree branches
- State send updates to components when a branch was changed
- Component rerenders when watched branches were changed
