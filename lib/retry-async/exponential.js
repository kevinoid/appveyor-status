/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

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
 */
module.exports =
function* exponential(
  factor,
  initial = 1,
  maxValue = Infinity,
  count = Infinity,
) {
  let value = Number(initial);
  if (Number.isNaN(value)) {
    throw new TypeError('initial must be a number');
  }

  for (let i = 0; i < count; i += 1) {
    yield value;
    value = Math.min(value * factor, maxValue);
  }
};
