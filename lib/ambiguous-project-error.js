/**
 * @copyright Copyright 2017, 2026 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/** Represents an error caused when a project is not uniquely identified.
 *
 * @alias module:appveyor-status.AmbiguousProjectError
 */
class AmbiguousProjectError extends Error {
  /** Constructs an AmbiguousProjectError.
   *
   * @param {?string=} message Optional message describing the error.
   * @param {Array<string>=} projects Array of projects which matched.
   */
  constructor(message, projects) {
    super(message);

    if (projects) {
      this.projects = projects;
    }
  }
}
AmbiguousProjectError.prototype.message = 'Project not uniquely identified';
AmbiguousProjectError.prototype.name = 'AmbiguousProjectError';

module.exports = AmbiguousProjectError;
