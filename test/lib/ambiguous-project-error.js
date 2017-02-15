/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var AmbiguousProjectError = require('../../lib/ambiguous-project-error');
var assert = require('assert');

describe('AmbiguousProjectError', function() {
  it('sets .message and .projects from arguments', function() {
    var testMsg = 'test message';
    var testProjects = [];
    var a = new AmbiguousProjectError(testMsg, testProjects);
    assert.strictEqual(a.message, testMsg);
    assert.strictEqual(a.projects, testProjects);
  });

  it('can be instantiated without arguments', function() {
    var a = new AmbiguousProjectError();
    assert(a.message, 'has default message');
    assert.strictEqual(a.projects, undefined);
  });

  it('can be instantiated without new', function() {
    var testMsg = 'test message';
    var testProjects = [];
    var a = AmbiguousProjectError(testMsg, testProjects);
    assert(a instanceof AmbiguousProjectError);
    assert.strictEqual(a.message, testMsg);
    assert.strictEqual(a.projects, testProjects);
  });

  it('inherits from Error', function() {
    var testMsg = 'test message';
    var testProjects = [];
    var a = new AmbiguousProjectError(testMsg, testProjects);
    assert(a instanceof Error);
  });
});
