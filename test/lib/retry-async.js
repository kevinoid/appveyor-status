/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon');
const timers = require('timers');
const { promisify } = require('util');

const retryAsync = require('../../lib/retry-async.js');

// TODO [engine:node@>=15]: import { setImmediate } from 'timers/promises';
const setImmediateP = promisify(timers.setImmediate);

const clock = sinon.useFakeTimers({
  target: { Date },
});
const timeOptions = {
  now: clock.Date.now,
  setTimeout: promisify(clock.setTimeout),
};

function neverCalled() {
  throw new Error('should not be called');
}

describe('retryAsync', () => {
  beforeEach(() => clock.reset());

  it('calls operation immediately with given args once if truthy', async () => {
    const stubResult = {};
    const stub = sinon.stub().resolves(stubResult);
    const args = [1, {}, false];
    const result = retryAsync(
      stub,
      { setTimeout: neverCalled },
      ...args,
    );
    stub.calledOnceWithExactly(...args);
    assert.strictEqual(await result, stubResult);
    stub.calledOnceWithExactly(...args);
  });

  it('calls operation with given number of args', async () => {
    const stubResult = {};
    const stub = sinon.stub().resolves(stubResult);
    const args = [undefined, undefined];
    const result = retryAsync(
      stub,
      { setTimeout: neverCalled },
      ...args,
    );
    stub.calledOnceWithExactly(...args);
    assert.strictEqual(await result, stubResult);
    stub.calledOnceWithExactly(...args);
  });

  it('returns immediately for !shouldRetry', async () => {
    const stubResult = null;
    const stub = sinon.stub().resolves(stubResult);
    const shouldRetry = sinon.stub().returns(false);
    const result = retryAsync(
      stub,
      {
        setTimeout: neverCalled,
        shouldRetry,
      },
    );
    stub.calledOnceWithExactly();
    shouldRetry.calledOnceWithExactly(stubResult);
    assert.strictEqual(await result, stubResult);
    stub.calledOnceWithExactly();
    shouldRetry.calledOnceWithExactly(stubResult);
  });

  it('handles non-Promise return values', async () => {
    const stubResult = undefined;
    const stub = sinon.stub().returns(stubResult);
    const shouldRetry = sinon.stub().returns(false);
    const result = retryAsync(
      stub,
      {
        setTimeout: neverCalled,
        shouldRetry,
      },
    );
    stub.calledOnceWithExactly();
    shouldRetry.calledOnceWithExactly(stubResult);
    assert.strictEqual(await result, stubResult);
    stub.calledOnceWithExactly();
    shouldRetry.calledOnceWithExactly(stubResult);
  });

  it('returns immediately for empty waitMs', async () => {
    const stub = sinon.stub();
    const result = retryAsync(
      stub,
      {
        setTimeout: neverCalled,
        waitMs: [],
      },
    );
    stub.calledOnceWithExactly();
    await result;
    stub.calledOnceWithExactly();
  });

  // Behave like for-of and only call .return for early exit
  it('does not call return on exhausted waitMs iterator', async () => {
    const stub = sinon.stub();
    const result = retryAsync(
      stub,
      {
        setTimeout: neverCalled,
        waitMs: {
          [Symbol.iterator]: () => ({
            next: () => ({ done: true }),
            return: neverCalled,
          }),
        },
      },
    );
    stub.calledOnceWithExactly();
    await result;
    stub.calledOnceWithExactly();
  });

  // Behave like for-of and call .return for early exit
  it('calls .return on non-exhausted waitMs iterator', async () => {
    const stubResult = 1;
    const stub = sinon.stub();
    stub.onFirstCall().returns(undefined);
    stub.onSecondCall().returns(stubResult);
    const waitMs = 1000;
    const iterReturn = sinon.stub();
    const iter = {
      next: () => ({ value: waitMs }),
      return: iterReturn,
    };
    const result = retryAsync(
      stub,
      {
        ...timeOptions,
        waitMs: {
          [Symbol.iterator]: () => iter,
        },
      },
    );
    assert.strictEqual(stub.callCount, 1);

    await setImmediateP();
    assert.strictEqual(clock.countTimers(), 1);
    clock.tick(waitMs);

    await setImmediateP();
    assert.strictEqual(stub.callCount, 2);
    assert.strictEqual(clock.countTimers(), 0);

    assert.strictEqual(await result, stubResult);
    assert.strictEqual(stub.callCount, 2);
    stub.alwaysCalledWithExactly();

    // .return() is called exactly once, on iter, with no arguments
    iterReturn.calledOnceWithExactly();
    iterReturn.alwaysCalledOn(iter);
  });

  it('returns after all waitMs', async () => {
    const stubResult = false;
    const stub = sinon.stub();
    stub.onFirstCall().returns(undefined);
    stub.onSecondCall().returns(stubResult);
    const args = [false, undefined];
    const waitMs = [1000];
    const result = retryAsync(
      stub,
      {
        ...timeOptions,
        waitMs,
      },
      ...args,
    );
    assert.strictEqual(stub.callCount, 1);

    await setImmediateP();
    assert.strictEqual(stub.callCount, 1);
    assert.strictEqual(clock.countTimers(), 1);

    clock.tick(waitMs[0] - 1);
    await setImmediateP();
    assert.strictEqual(stub.callCount, 1);
    assert.strictEqual(clock.countTimers(), 1);

    clock.tick(1);
    await setImmediateP();
    assert.strictEqual(stub.callCount, 2);
    assert.strictEqual(clock.countTimers(), 0);

    assert.strictEqual(await result, stubResult);
    assert.strictEqual(stub.callCount, 2);
    stub.alwaysCalledWithExactly(...args);
  });

  it('accepts constant number waitMs', async () => {
    const stubResult = 1;
    const stub = sinon.stub();
    stub.onThirdCall().returns(stubResult);
    const waitMs = 1000;
    const result = retryAsync(
      stub,
      {
        ...timeOptions,
        waitMs,
      },
    );
    assert.strictEqual(stub.callCount, 1);

    await setImmediateP();
    assert.strictEqual(clock.countTimers(), 1);

    clock.tick(waitMs);
    await setImmediateP();
    assert.strictEqual(stub.callCount, 2);
    assert.strictEqual(clock.countTimers(), 1);

    clock.tick(waitMs);
    await setImmediateP();
    assert.strictEqual(stub.callCount, 3);
    assert.strictEqual(clock.countTimers(), 0);

    assert.strictEqual(await result, stubResult);
    assert.strictEqual(stub.callCount, 3);
    stub.alwaysCalledWithExactly();
  });

  // Prefer consistent formatting of arrow functions passed to it()
  /* eslint-disable arrow-body-style */

  it('rejects with TypeError without arguments', () => {
    return assert.rejects(
      () => retryAsync(),
      TypeError,
    );
  });

  it('rejects with TypeError for non-function operation', () => {
    return assert.rejects(
      () => retryAsync(1),
      TypeError,
    );
  });

  it('rejects with TypeError for null options', () => {
    return assert.rejects(
      () => retryAsync(neverCalled, null),
      TypeError,
    );
  });

  it('rejects with TypeError if options.waitMs is not iterable', () => {
    return assert.rejects(
      () => retryAsync(neverCalled, { waitMs: {} }),
      TypeError,
    );
  });
});
