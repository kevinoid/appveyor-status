/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const CommitMismatchError = require('../../lib/commit-mismatch-error');
const assert = require('assert');

describe('CommitMismatchError', () => {
  it('sets .actual and .expected from arguments', () => {
    const testOptions = {
      actual: 'abc',
      expected: '123'
    };
    const err = new CommitMismatchError(testOptions);
    assert.strictEqual(err.actual, testOptions.actual);
    assert.strictEqual(err.expected, testOptions.expected);
    assert.strictEqual(err.operator, '===');
    assert(
      err.message.indexOf(testOptions.actual) >= 0,
      'constructs message with actual'
    );
    assert(
      err.message.indexOf(testOptions.expected) >= 0,
      'constructs message with expected'
    );
  });

  it('can set .message from arguments', () => {
    const testOptions = {
      actual: 'abc',
      expected: '123',
      message: 'test'
    };
    const err = new CommitMismatchError(testOptions);
    assert.strictEqual(err.actual, testOptions.actual);
    assert.strictEqual(err.expected, testOptions.expected);
    assert.strictEqual(err.operator, '===');
    assert.strictEqual(err.message, testOptions.message);
  });

  it('can be instantiated without new', () => {
    const testOptions = {
      actual: 'abc',
      expected: '123'
    };
    const err = CommitMismatchError(testOptions);
    assert.strictEqual(err.actual, testOptions.actual);
    assert.strictEqual(err.expected, testOptions.expected);
    assert.strictEqual(err.operator, '===');
    assert(
      err.message.indexOf(testOptions.actual) >= 0,
      'constructs message with actual'
    );
    assert(
      err.message.indexOf(testOptions.expected) >= 0,
      'constructs message with expected'
    );
  });

  it('inherits from Error', () => {
    const testOptions = {
      actual: 'abc',
      expected: '123'
    };
    const err = new CommitMismatchError(testOptions);
    assert(err instanceof Error);
  });
});
