class DocumentComponent {
  template () {
    return `
<!DOCTYPE html>
<html>
<head></head>
<body><cat-test></cat-test></body>
</html>
`;
  }
}

module.exports = {
  constructor: DocumentComponent
};
