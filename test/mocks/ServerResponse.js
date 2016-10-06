const Writable = require('stream').Writable;

class ServerResponse extends Writable {
  constructor () {
    super();
    this.setHeaders = {};
    this.status = 200;
    this.headersSent = false;
    this.result = '';
  }

  writeHead (code, headers) {
    if (this.headersSent) {
      throw new Error('Headers were sent');
    }
    this.status = code;
    this.setHeaders = headers;
  }

  end () {
    super.end(...arguments);
  }

  _write (chunk, encoding, callback) {
    if (this.isEnded) {
      throw new Error('Write after EOF');
    }

    this.headersSent = true;
    this.result += chunk;
    callback();
  }
}

module.exports = ServerResponse;
