/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var CommitMismatchError = require('../../lib/commit-mismatch-error');
var assert = require('assert');

describe('CommitMismatchError', function() {
  it('sets .actual and .expected from arguments', function() {
    var testOptions = {
      actual: 'abc',
      expected: '123'
    };
    var err = new CommitMismatchError(testOptions);
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

  it('can set .message from arguments', function() {
    var testOptions = {
      actual: 'abc',
      expected: '123',
      message: 'test'
    };
    var err = new CommitMismatchError(testOptions);
    assert.strictEqual(err.actual, testOptions.actual);
    assert.strictEqual(err.expected, testOptions.expected);
    assert.strictEqual(err.operator, '===');
    assert.strictEqual(err.message, testOptions.message);
  });

  it('can be instantiated without new', function() {
    var testOptions = {
      actual: 'abc',
      expected: '123'
    };
    var err = CommitMismatchError(testOptions);
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

  it('inherits from Error', function() {
    var testOptions = {
      actual: 'abc',
      expected: '123'
    };
    var err = new CommitMismatchError(testOptions);
    assert(err instanceof Error);
  });
});
