/**
 * @copyright Copyright 2023 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/** Create setInterval and setTimeout functions compatible with the
 * timers/promises API which wrap the setInterval and setTimeout functions
 * from a given object.
 *
 * @param {!{setImmediate: !Function, setTimeout: !Function}} timers Timer
 * functions to wrap.
 * @returns {!{setImmediate: !Function, setTimeout: !Function}} Promisified
 * versions.
 */
function promisifyTimers(timers) {
  if (typeof timers.setImmediate !== 'function') {
    throw new TypeError('timers.setImmediate must be a function');
  }

  if (typeof timers.setTimeout !== 'function') {
    throw new TypeError('timers.setTimeout must be a function');
  }

  // eslint-disable-next-line no-shadow
  function setImmediate(value, options) {
    if (options && (options.ref || options.signal)) {
      throw new TypeError('options is not supported');
    }

    return new Promise((resolve) => {
      timers.setImmediate(resolve, value);
    });
  }

  // eslint-disable-next-line no-shadow
  function setTimeout(delay, value, options) {
    if (options && (options.ref || options.signal)) {
      throw new TypeError('options is not supported');
    }

    return new Promise((resolve) => {
      timers.setTimeout(resolve, delay, value);
    });
  }

  return {
    setImmediate,
    setTimeout,
  };
}

module.exports = promisifyTimers;
