/**
 * @copyright Copyright 2017, 2026 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/**
 * Represents an error caused when a commit has does not match the expected
 * value.
 *
 * @alias module:appveyor-status.CommitMismatchError
 */
class CommitMismatchError extends Error {
  /** Constructs an CommitMismatchError.
   *
   * @param {{message: ?string, actual: string, expected: string}} options
   * Options to set on the constructed instance (names shared with
   * assert.AssertionError for consistency).
   */
  constructor(options) {
    super(
      options.message
      || `Commit ${options.actual} did not match ${options.expected}`,
    );

    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = '===';
    this.generatedMessage = !options.message;
  }
}
CommitMismatchError.prototype.message = 'Commit mismatch';
CommitMismatchError.prototype.name = 'CommitMismatchError';

module.exports = CommitMismatchError;
