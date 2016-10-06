class SyncComponent {
  template (context) {
    return `<div>content – ${context.name}</div>`;
  }

  render () {
    return this.$context;
  }
}

module.exports = {
  constructor: SyncComponent
};
