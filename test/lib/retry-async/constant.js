/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');

const constant = require('../../../lib/retry-async/constant.js');

describe('retryAsync.constant', () => {
  it('returns an iterable of number first argument', () => {
    const expect = 1;
    let count = 0;
    for (const val of constant(expect)) {
      assert.strictEqual(val, expect);
      count += 1;
      if (count > 10) {
        break;
      }
    }
    assert.strictEqual(count, 11);
  });

  it('returns an iterable of object first argument', () => {
    const expect = {};
    let count = 0;
    for (const val of constant(expect)) {
      assert.strictEqual(val, expect);
      count += 1;
      if (count > 10) {
        break;
      }
    }
    assert.strictEqual(count, 11);
  });

  // Note: This behavior is subject to change.  Better to throw?
  it('yields undefined if called without arguments', () => {
    let count = 0;
    for (const val of constant()) {
      assert.strictEqual(val, undefined);
      count += 1;
      if (count > 10) {
        break;
      }
    }
    assert.strictEqual(count, 11);
  });

  it('yields count times for positive count', () => {
    const expectValue = 1;
    const expectCount = 5;
    let count = 0;
    for (const val of constant(expectValue, expectCount)) {
      assert.strictEqual(val, expectValue);
      count += 1;
    }
    assert.strictEqual(count, expectCount);
  });

  it('yields 0 times for 0 count', () => {
    // eslint-disable-next-line no-unused-vars
    for (const val of constant(1, 0)) {
      assert.fail('Unexpected value');
    }
  });

  it('throws RangeError for negative count', () => {
    assert.throws(
      () => constant(1, -1),
      RangeError,
    );
  });

  it('throws RangeError for NaN count', () => {
    assert.throws(
      () => constant(1, NaN),
      RangeError,
    );
  });

  it('throws RangeError for non-integer count', () => {
    assert.throws(
      () => constant(1, 1.5),
      RangeError,
    );
  });

  it('throws TypeError for non-coerces-to-NaN count', () => {
    assert.throws(
      () => constant(1, {}),
      TypeError,
    );
  });

  // Note: Subject to change.  Better to be lenient?
  it('throws TypeError for coerces-to-number count', () => {
    assert.throws(
      () => constant(1, '1'),
      TypeError,
    );
  });
});
