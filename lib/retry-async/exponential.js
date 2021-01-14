/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

function* generateExponential(factor, initial, maxValue, count) {
  let value = Math.min(initial, maxValue);
  for (let i = 0; i < count; i += 1) {
    yield value;
    value = Math.min(value * factor, maxValue);
  }
}

/** Generates an exponentially-increasing value, with optional count/limit.
 *
 * @private
 * @param {number} factor Multiplicative increase between each yielded
 * value.
 * @param {number=} initial Initial value to yield.  (Default: 1)
 * @param {number=} maxValue Maximum value to yield.  (Exponential growth
 * is limited/capped to this value.  Default: Infinity)
 * @param {number=} count Number of values to yield.  (Default: Infinity)
 * @yields {number} Exponentially increasing values, starting from initial.
 * @throws {TypeError} If factor, initial, maxValue, or count is not a number.
 * @throws {RangeError} If maxValue or count is NaN, count is negative, or
 * count is not an integer (or Infinity).
 */
module.exports =
function exponential(
  factor,
  initial = 1,
  maxValue = Infinity,
  count = Infinity,
) {
  if (typeof factor !== 'number') {
    throw new TypeError('factor must be a number');
  }
  if (typeof initial !== 'number') {
    throw new TypeError('initial must be a number');
  }
  if (typeof maxValue !== 'number') {
    throw new TypeError('maxValue must be a number');
  }
  if (Number.isNaN(maxValue)) {
    throw new RangeError('maxValue must not be NaN');
  }
  if (typeof count !== 'number') {
    throw new TypeError('count must be a number');
  }
  if (count < 0 || count !== Math.floor(count)) {
    throw new RangeError('count must be a non-negative integer, or Infinity');
  }

  return generateExponential(factor, initial, maxValue, count);
};
