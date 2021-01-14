/**
 * @copyright Copyright 2017-2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const timers = require('timers');
const { promisify } = require('util');

const constant = require('./retry-async/constant.js');
const exponential = require('./retry-async/exponential.js');

// TODO [engine:node@>=15]: import { setTimeout } from 'timers/promises';
const setTimeoutP = promisify(timers.setTimeout);

function defaultShouldRetry(result) {
  // Retry if the value was falsey
  return !result;
}

/** Options for {@link retryAsync}.
 *
 * @private
 * @template TReturn
 * @typedef {module:timers.SetTimeoutOptions} RetryAsyncOptions
 * @property {(function(): number)=} now Function to get the current time in
 * milliseconds since the epoch.
 * @property {number=} maxTotalMs Maximum amount of time, in milliseconds,
 * during which retries are attempted.  Duration of last wait may be reduced to
 * avoid exceeding maxTotalMs.  Once maxTotalMs has elapsed, the value from
 * the last attempt is returned.
 * @property {number=} minWaitMs Minimum amount of time, in milliseconds,
 * to wait.  If less than this amount of time remains before maxTotalMs is
 * exceeded, the value of the last attempt is returned immediately.
 * @property {module:timers/promise.setTimeout=} setTimeout Function to
 * perform waits between retries.
 * @property {(function(TReturn): boolean)=} shouldRetry Predicate which
 * determines whether to retry the operation based on the return value of the
 * previous attempt.
 * @property {(number|module:globals.Iterable<number>)=} waitMs Number of
 * milliseconds to wait between attempts.
 */

/** Default values for options.
 *
 * @constant
 * @private
 * @type {RetryAsyncOptions}
 */
const DEFAULT_OPTIONS = Object.freeze({
  maxTotalMs: Infinity,
  minWaitMs: 4000,
  now: Date.now,
  setTimeout: setTimeoutP,
  shouldRetry: defaultShouldRetry,
  get waitMs() {
    return exponential(2, 4000, 60000, Infinity);
  },
});

/** Repeatedly invoke a function with given arguments on an exponential
 * delay until the Promise it returns resolves to true.
 *
 * @template TReturn
 * @param {function(...): !Promise<TReturn>} operation Function to retry.
 * @param {RetryAsyncOptions=} options Options.
 * @param {Array=} args Arguments passed to operation.
 * @returns {!Promise<TReturn>} Promise for return value of last call to
 * operation.
 */
module.exports =
async function retryAsync(
  operation,
  {
    maxTotalMs = DEFAULT_OPTIONS.maxTotalMs,
    minWaitMs = DEFAULT_OPTIONS.minWaitMs,
    now = DEFAULT_OPTIONS.now,
    setTimeout: retrySetTimeout = DEFAULT_OPTIONS.setTimeout,
    shouldRetry = DEFAULT_OPTIONS.shouldRetry,
    waitMs = DEFAULT_OPTIONS.waitMs,
    ...setTimeoutOptions
  } = {},
  ...args
) {
  // eslint-disable-next-line no-restricted-globals
  const deadline = isFinite(maxTotalMs) ? now() + maxTotalMs : Infinity;

  let waitIterator;
  if (typeof waitMs === 'number') {
    waitIterator = constant(waitMs);
  } else if (waitMs && typeof waitMs[Symbol.iterator] === 'function') {
    waitIterator = waitMs[Symbol.iterator]();
  } else {
    throw new TypeError('waitMs must be a number or Iterable');
  }

  let waitResult;
  try {
    /* eslint-disable no-await-in-loop */
    for (;;) {
      const result = await operation(...args);
      if (!shouldRetry(result)) {
        return result;
      }

      const remaining = deadline - now();
      if (remaining < minWaitMs) {
        return result;
      }

      waitResult = waitIterator.next();
      if (waitResult.done) {
        return result;
      }

      const delay = Math.min(
        waitResult.value,
        remaining,
      );
      await retrySetTimeout(delay, undefined, setTimeoutOptions);
    }
    /* eslint-enable no-await-in-loop */
  } finally {
    if (waitResult && !waitResult.done && waitIterator.return !== undefined) {
      waitIterator.return();
    }
  }
};

module.exports.DEFAULT_OPTIONS = DEFAULT_OPTIONS;
