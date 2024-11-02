/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('node:assert');

const AmbiguousProjectError = require('../../lib/ambiguous-project-error.js');

describe('AmbiguousProjectError', () => {
  it('sets .message and .projects from arguments', () => {
    const testMsg = 'test message';
    const testProjects = [];
    const a = new AmbiguousProjectError(testMsg, testProjects);
    assert.strictEqual(a.message, testMsg);
    assert.strictEqual(a.projects, testProjects);
  });

  it('can be instantiated without arguments', () => {
    const a = new AmbiguousProjectError();
    assert(a.message, 'has default message');
    assert.strictEqual(a.projects, undefined);
  });

  it('can be instantiated without new', () => {
    const testMsg = 'test message';
    const testProjects = [];
    // eslint-disable-next-line new-cap, unicorn/throw-new-error
    const a = AmbiguousProjectError(testMsg, testProjects);
    assert(a instanceof AmbiguousProjectError);
    assert.strictEqual(a.message, testMsg);
    assert.strictEqual(a.projects, testProjects);
  });

  it('inherits from Error', () => {
    const testMsg = 'test message';
    const testProjects = [];
    const a = new AmbiguousProjectError(testMsg, testProjects);
    assert(a instanceof Error);
  });
});
