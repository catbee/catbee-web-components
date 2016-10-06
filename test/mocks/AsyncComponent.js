class AsyncComponent {
  template (context) {
    return `<div>content – ${context.name}</div>`;
  }

  render () {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.$context);
      }, 1);
    });
  }
}

module.exports = {
  constructor: AsyncComponent
};
