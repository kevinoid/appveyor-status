/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var inherits = require('util').inherits;

/** Constructs an AmbiguousProjectError.
 *
 * @class Represents an error caused when a project is not uniquely identified.
 * @constructor
 * @param {?string=} message Optional message describing the error.
 * @param {Array<string>=} projects Array of projects which matched.
 * @alias module:appveyor-status.AmbiguousProjectError
 */
function AmbiguousProjectError(message, projects) {
  if (!(this instanceof AmbiguousProjectError)) {
    return new AmbiguousProjectError(message, projects);
  }

  if (projects) {
    this.projects = projects;
  }

  if (message) {
    // Like http://www.ecma-international.org/ecma-262/6.0/#sec-error-message
    Object.defineProperty(this, 'message', {
      value: String(message),
      configurable: true,
      writable: true
    });
  }

  Error.captureStackTrace(this, AmbiguousProjectError);
}
inherits(AmbiguousProjectError, Error);
AmbiguousProjectError.prototype.message = 'Project not uniquely identified';
AmbiguousProjectError.prototype.name = 'AmbiguousProjectError';

module.exports = AmbiguousProjectError;
