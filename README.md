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
