/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');

const exponential = require('../../../lib/retry-async/exponential.js');

describe('retryAsync.exponential', () => {
  it('returns an iterable of count exponentially increasing values', () => {
    assert.deepStrictEqual(
      [...exponential(2, 1, Infinity, 4)],
      [1, 2, 4, 8],
    );
  });

  it('supports non-integer values', () => {
    assert.deepStrictEqual(
      [...exponential(1.5, 1.5, Infinity, 3)],
      [1.5, 1.5 * 1.5, 1.5 * 1.5 * 1.5],
    );
  });

  it('limits to maximum value', () => {
    assert.deepStrictEqual(
      [...exponential(2, 1, 3, 4)],
      [1, 2, 3, 3],
    );
  });

  it('limits below initial value', () => {
    assert.deepStrictEqual(
      [...exponential(2, 2, 1, 2)],
      [1, 1],
    );
  });

  it('allows negative factor', () => {
    assert.deepStrictEqual(
      [...exponential(-2, 1, Infinity, 4)],
      [1, -2, 4, -8],
    );
  });

  it('allows negative initial', () => {
    assert.deepStrictEqual(
      [...exponential(2, -1, Infinity, 4)],
      [-1, -2, -4, -8],
    );
  });

  it('handles Infinity factor', () => {
    assert.deepStrictEqual(
      [...exponential(Infinity, 1, Infinity, 3)],
      [1, Infinity, Infinity],
    );
  });

  it('handles Infinity initial', () => {
    assert.deepStrictEqual(
      [...exponential(2, Infinity, Infinity, 2)],
      [Infinity, Infinity],
    );
  });

  it('handles NaN factor', () => {
    assert.deepStrictEqual(
      [...exponential(NaN, 1, Infinity, 3)],
      [1, NaN, NaN],
    );
  });

  it('handles NaN initial', () => {
    assert.deepStrictEqual(
      [...exponential(2, NaN, Infinity, 3)],
      [NaN, NaN, NaN],
    );
  });

  it('yields 0 times for 0 count', () => {
    assert.deepStrictEqual(
      [...exponential(2, 1, Infinity, 0)],
      [],
    );
  });

  it('throws TypeError for no args', () => {
    assert.throws(
      () => exponential(),
      TypeError,
    );
  });

  it('throws TypeError for non-number factor', () => {
    assert.throws(
      () => exponential({}),
      TypeError,
    );
  });

  it('throws TypeError for non-number initial', () => {
    assert.throws(
      () => exponential(2, {}),
      TypeError,
    );
  });

  it('throws TypeError for non-number maxValue', () => {
    assert.throws(
      () => exponential(2, 1, {}),
      TypeError,
    );
  });

  it('throws RangeError for NaN maxValue', () => {
    assert.throws(
      () => exponential(2, 1, NaN, 4),
      RangeError,
    );
  });

  it('throws TypeError for non-number count', () => {
    assert.throws(
      () => exponential(2, 1, 1, {}),
      TypeError,
    );
  });

  it('throws RangeError for negative count', () => {
    assert.throws(
      () => exponential(2, 1, 1, -1),
      RangeError,
    );
  });

  it('throws RangeError for NaN count', () => {
    assert.throws(
      () => exponential(2, 1, 1, NaN),
      RangeError,
    );
  });

  it('throws RangeError for non-integer count', () => {
    assert.throws(
      () => exponential(2, 1, 1, 1.5),
      RangeError,
    );
  });
});
