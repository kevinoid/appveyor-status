/**
 * Assert module with functions back-ported from current Node.js releases.
 *
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
// Based on https://github.com/nodejs/node/blob/v15.6.0/lib/assert.js
// With the following copyright notice:
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

const assert = require('assert');
const { inspect, types: { isRegExp } } = require('util');

const { AssertionError } = assert;

// Copy properties to polyfill to avoid modifying assert
const assertPoly = function ok(...args) {
  return assert(...args);
};
Object.assign(assertPoly, assert);

// Copy properties to strict polyfill to avoid modifying assert.strict
assertPoly.strict = function strict(...args) {
  return assert.strict(...args);
};
// eslint-disable-next-line unicorn/consistent-destructuring
Object.assign(assertPoly.strict, assert.strict);

// By default, export the original assert module.
// If any properties need to be polyfilled, assertPoly is exported.
module.exports = assert;

function internalMatch(string, regexp, message, fn) {
  if (!isRegExp(regexp)) {
    const err = new TypeError(
      '[ERR_INVALID_ARG_TYPE]: The "regexp" argument must be an instance ' +
      `of RegExp. Received type ${typeof regexp} (${inspect(regexp)})`,
    );
    err.code = 'ERR_INVALID_ARG_TYPE';
    throw err;
  }
  const match = fn.name === 'match';
  if (typeof string !== 'string' ||
      RegExp.prototype.test.call(regexp, string) !== match) {
    if (message instanceof Error) {
      throw message;
    }

    const generatedMessage = !message;

    // 'The input was expected to not match the regular expression ' +
    message = message || (typeof string !== 'string' ?
      'The "string" argument must be of type string. Received type ' +
        `${typeof string} (${inspect(string)})` :
      (match ?
        'The input did not match the regular expression ' :
        'The input was expected to not match the regular expression ') +
          `${inspect(regexp)}. Input:\n\n${inspect(string)}\n`);
    const err = new AssertionError({
      actual: string,
      expected: regexp,
      message,
      operator: fn.name,
      stackStartFn: fn
    });
    err.generatedMessage = generatedMessage;
    throw err;
  }
}

// TODO [engine:node@>=12.16]: Remove this polyfill
if (!assertPoly.match) {
  module.exports = assertPoly;

  assertPoly.match = function match(string, regexp, message) {
    internalMatch(string, regexp, message, match);
  };
  assertPoly.doesNotMatch = function doesNotMatch(string, regexp, message) {
    internalMatch(string, regexp, message, doesNotMatch);
  };
  assertPoly.strict.match = assertPoly.match;
  assertPoly.strict.doesNotMatch = assertPoly.doesNotMatch;
}
