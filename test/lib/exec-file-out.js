/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assert = require('assert');
var execFileOut = require('../../lib/exec-file-out');

var deepStrictEqual = assert.deepStrictEqual || assert.deepEqual;

function neverCalled() {
  throw new Error('Should not be called');
}

function quote(str) {
  return "'" +
    str.replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      // Escape newline and tab for easier debugging
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n') +
    "'";
}

/** Creates a JavaScript test script which prints the given strings to stdout
 * and stderr then exits with the given code.
 */
function makeScript(outStr, errStr, exitCode) {
  var script = '';
  if (outStr) {
    script += 'process.stdout.write(' + quote(outStr) + ');';
  }
  if (errStr) {
    script += 'process.stderr.write(' + quote(errStr) + ');';
  }
  script += 'process.exit(' + (exitCode || '0') + ')';
  return script;
}

describe('execFileOut', function() {
  it('returns a Promise with stdout', function() {
    var testOut = 'stdout content';
    var testArgs = ['-e', makeScript(testOut)];
    return execFileOut(process.execPath, testArgs)
      .then(function(stdout) {
        assert.strictEqual(stdout, testOut);
      });
  });

  it('returns a Promise with stdout as Buffer', function() {
    var testOut = 'stdout content';
    var testArgs = ['-e', makeScript(testOut)];
    var options = {encoding: 'buffer'};
    return execFileOut(process.execPath, testArgs, options)
      .then(function(stdout) {
        deepStrictEqual(stdout, new Buffer(testOut));
      });
  });

  it('rejects Promise with Error for non-0 exit code', function() {
    var testOut = 'stdout content';
    var testCode = 2;
    var testArgs = ['-e', makeScript(testOut, null, testCode)];
    return execFileOut(process.execPath, testArgs).then(
      neverCalled,
      function(err) {
        assert.strictEqual(err.cmd, [process.execPath].concat(testArgs).join(' '));
        assert.strictEqual(err.code, testCode);
        assert.strictEqual(err.stderr, '');
        assert.strictEqual(err.stdout, testOut);
      });
  });

  it('rejects Promise with Error for non-empty stderr', function() {
    var testOut = 'stdout content';
    var testErr = 'stderr content';
    var testArgs = ['-e', makeScript(testOut, testErr)];
    return execFileOut(process.execPath, testArgs).then(
      neverCalled,
      function(err) {
        assert(err.message.indexOf(testErr) >= 0, 'stderr is in message');
        assert.strictEqual(err.cmd, [process.execPath].concat(testArgs).join(' '));
        assert.strictEqual(err.code, 0);
        assert.strictEqual(err.stderr, testErr);
        assert.strictEqual(err.stdout, testOut);
      });
  });

  it('rejects Promise with Error for non-empty stderr Buffer', function() {
    var testOut = 'stdout content';
    var testErr = 'stderr content';
    var testArgs = ['-e', makeScript(testOut, testErr)];
    var options = {encoding: 'buffer'};
    return execFileOut(process.execPath, testArgs, options).then(
      neverCalled,
      function(err) {
        assert(err.message.indexOf(testErr) >= 0, 'stderr is in message');
        assert.strictEqual(err.cmd, [process.execPath].concat(testArgs).join(' '));
        assert.strictEqual(err.code, 0);
        deepStrictEqual(err.stderr, new Buffer(testErr));
        deepStrictEqual(err.stdout, new Buffer(testOut));
      });
  });

  it('does not reject stderr with only whitespace', function() {
    var testOut = 'stdout content';
    var testErr = '\n\t\t  \n';
    var testArgs = ['-e', makeScript(testOut, testErr)];
    return execFileOut(process.execPath, testArgs)
      .then(function(stdout) {
        assert.strictEqual(stdout, testOut);
      });
  });

  it('closes stdin to prevent hanging', function() {
    // Test will timeout if stdin is not closed
    return execFileOut(process.execPath);
  });
});
