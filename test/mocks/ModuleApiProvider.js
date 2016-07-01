class ModuleApiProvider {
  constructor (locator) {
    this.locator = locator;
  }

  redirect () {
    const documentRenderer = this.locator.resolve('documentRenderer');
    const routeDefinition = this.locator.resolve('routeDefinition');

    const contextBase = Object.create(this);

    documentRenderer.updateState(Object.assign(contextBase, routeDefinition));
  }
}

module.exports = ModuleApiProvider;
