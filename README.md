## Catbee Web Components

DocumentRenderer implementaion based on [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components), spiced by [Appstate](https://github.com/catbee/appstate) and [Baobab](https://github.com/Yomguithereal/baobab) for state management. You can use it with any template engine (jade, handlebars, dust) and don't care about browser rendering because it's use [morphdom](https://github.com/patrick-steele-idem/morphdom) for patial DOM updates insteadof full-page rerendering.

### Getting Started

Web components is one of implementation Catbee view layer. It's should be register as Catbee service and provide root document component. Below you can get code example, that can be used for integration in browser.

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

Catbee Web Components mark tag as component if it have `cat-*` prefix.
Head is special name, and can be used without prefix.

### Component Specification

``` javascript
class Component {
  constructor (locator) {
    // Every component get locator as argument in constructor, 
    // it's can be used for resolve services (config, uhr, api, etc...)
    this._config = locator.resolve('config');
  }
  
  // Template is function that called when you render component to HTML string
  // It's accept ctx as first argument, and should return string.
  // You can use any template language that can be compiled to function.
  // For example, you can use Handlebars require hook on server, 
  // and webpack loader for client side bundle, and use next code:
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
    // This method create ctx for template function
    // You should return Object or Promise resolved by Object
    // Also here you can make any DOM manipulation, because at this step 
    // all nodes already in DOM.
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
    // It's called before DOM is will be disposed and event listeners detached.
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
- __this.$context.location__ – the current URI object that constains the current location.
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

### Data flow

Library provide built-in data-flow system.

![Data Flow](https://raw.githubusercontent.com/catbee/catbee-web-components/master/image.png "Data Flow")

__Core things:__

- Components are stateless
- Components can't direct change state
- Components send signals
- Signals run actions that mutate state
- Components watch tree branches
- State send updates to components when branch was changed
- Component rerender when watched branches was changed
