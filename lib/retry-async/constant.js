/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/** Generates a given value a given number of times.
 *
 * @private
 * @template T
 * @param {T} value Value to yield.
 * @param {number=} count Number of times to yield value.
 * @yields {T} value, count times.
 */
module.exports =
function* constant(value, count = Infinity) {
  for (; count > 0; count -= 1) {
    yield value;
  }
};
