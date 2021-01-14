/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

function* generateConstant(value, count) {
  for (; count > 0; count -= 1) {
    yield value;
  }
}

/** Generates a given value a given number of times.
 *
 * @private
 * @template T
 * @param {T} value Value to yield.
 * @param {number=} count Number of times to yield value.
 * @yields {T} value, count times.
 * @throws {TypeError} If count is not a number.
 * @throws {RangeError} If count is not a positive integer.
 */
module.exports =
function constant(value, count = Infinity) {
  if (typeof count !== 'number') {
    throw new TypeError('count must be a number');
  }
  if (count < 0 || count !== Math.floor(count)) {
    throw new RangeError('count must be a non-negative integer, or Infinity');
  }

  return generateConstant(value, count);
};
