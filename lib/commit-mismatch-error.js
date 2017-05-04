/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const inherits = require('util').inherits;

/** Constructs an CommitMismatchError.
 *
 * @class Represents an error caused when a commit has does not match the
 * expected value.
 * @constructor
 * @param {{message: string?, actual: string, expected: string}} options
 * Options to set on the constructed instance (names shared with
 * assert.AssertionError for consistency).
 * @alias module:appveyor-status.CommitMismatchError
 */
function CommitMismatchError(options) {
  if (!(this instanceof CommitMismatchError)) {
    return new CommitMismatchError(options);
  }

  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = '===';

  let message;
  if (options.message) {
    message = options.message;
    this.generatedMessage = false;
  } else {
    message = `Commit ${this.actual} did not match ${this.expected}`;
    this.generatedMessage = true;
  }

  // Like http://www.ecma-international.org/ecma-262/6.0/#sec-error-message
  Object.defineProperty(this, 'message', {
    value: message,
    configurable: true,
    writable: true
  });

  Error.captureStackTrace(this, CommitMismatchError);
}
inherits(CommitMismatchError, Error);
CommitMismatchError.prototype.message = 'Commit mismatch';
CommitMismatchError.prototype.name = 'CommitMismatchError';

module.exports = CommitMismatchError;
