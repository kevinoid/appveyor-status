/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');

const execFileOut = require('../../lib/exec-file-out');

function neverCalled() {
  throw new Error('Should not be called');
}

function quote(str) {
  return `'${
    str.replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      // Escape newline and tab for easier debugging
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
  }'`;
}

/**
 * Creates a JavaScript test script which prints the given strings to stdout
 * and stderr then exits with the given code.
 *
 * @private
 */
function makeScript(outStr, errStr, exitCode) {
  let script = '';
  if (outStr) {
    script += `process.stdout.write(${quote(outStr)});`;
  }
  if (errStr) {
    script += `process.stderr.write(${quote(errStr)});`;
  }
  script += `process.exit(${exitCode || '0'})`;
  return script;
}

describe('execFileOut', () => {
  it('returns a Promise with stdout', () => {
    const testOut = 'stdout content';
    const testArgs = ['-e', makeScript(testOut)];
    return execFileOut(process.execPath, testArgs)
      .then((stdout) => {
        assert.strictEqual(stdout, testOut);
      });
  });

  it('returns a Promise with stdout as Buffer', () => {
    const testOut = 'stdout content';
    const testArgs = ['-e', makeScript(testOut)];
    const options = { encoding: 'buffer' };
    return execFileOut(process.execPath, testArgs, options)
      .then((stdout) => {
        assert.deepStrictEqual(stdout, Buffer.from(testOut));
      });
  });

  it('rejects Promise with Error for non-0 exit code', () => {
    const testOut = 'stdout content';
    const testCode = 2;
    const testArgs = ['-e', makeScript(testOut, null, testCode)];
    return execFileOut(process.execPath, testArgs).then(
      neverCalled,
      (err) => {
        assert.strictEqual(
          err.cmd,
          [process.execPath, ...testArgs].join(' '),
        );
        assert.strictEqual(err.code, testCode);
        assert.strictEqual(err.stderr, '');
        assert.strictEqual(err.stdout, testOut);
      },
    );
  });

  it('rejects Promise with Error for non-empty stderr', () => {
    const testOut = 'stdout content';
    const testErr = 'stderr content';
    const testArgs = ['-e', makeScript(testOut, testErr)];
    return execFileOut(process.execPath, testArgs).then(
      neverCalled,
      (err) => {
        assert(err.message.includes(testErr), 'stderr is in message');
        assert.strictEqual(
          err.cmd,
          [process.execPath, ...testArgs].join(' '),
        );
        assert.strictEqual(err.code, 0);
        assert.strictEqual(err.stderr, testErr);
        assert.strictEqual(err.stdout, testOut);
      },
    );
  });

  it('rejects Promise with Error for non-empty stderr Buffer', () => {
    const testOut = 'stdout content';
    const testErr = 'stderr content';
    const testArgs = ['-e', makeScript(testOut, testErr)];
    const options = { encoding: 'buffer' };
    return execFileOut(process.execPath, testArgs, options).then(
      neverCalled,
      (err) => {
        assert(err.message.includes(testErr), 'stderr is in message');
        assert.strictEqual(
          err.cmd,
          [process.execPath, ...testArgs].join(' '),
        );
        assert.strictEqual(err.code, 0);
        assert.deepStrictEqual(err.stderr, Buffer.from(testErr));
        assert.deepStrictEqual(err.stdout, Buffer.from(testOut));
      },
    );
  });

  // Previously ignored whitespace on stderr.
  // Changed due to perf and maintenance cost of feature with no known use.
  // If there is a need for this in the future, reconsider ignoring.
  it('rejects stderr with only whitespace', () => {
    const testOut = 'stdout content';
    const testErr = '\n\t\t  \n';
    const testArgs = ['-e', makeScript(testOut, testErr)];
    return execFileOut(process.execPath, testArgs).then(
      neverCalled,
      (err) => {
        assert(err.message.includes(testErr), 'stderr is in message');
        assert.strictEqual(
          err.cmd,
          [process.execPath, ...testArgs].join(' '),
        );
        assert.strictEqual(err.code, 0);
        assert.deepStrictEqual(err.stderr, testErr);
        assert.deepStrictEqual(err.stdout, testOut);
      },
    );
  });

  // Note: use node (i.e. process.execPath) to test, since it will not exit
  // until it reaches the end of stdin.
  it('closes stdin to prevent hanging', () => execFileOut(process.execPath));
});
