/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const ansiStyles = require('ansi-styles');
const appveyorSwagger = require('appveyor-swagger');
const assert = require('@kevinoid/assert-shim');
const escapeStringRegexp = require('escape-string-regexp');
const fs = require('fs');
const hasAnsi = require('has-ansi');
const path = require('path');
const sinon = require('sinon');
const stream = require('stream');

const packageJson = require('../../package.json');
const appveyorStatus = require('../..');
const appveyorStatusCmd = require('../../bin/appveyor-status');
const CommitMismatchError = require('../../lib/commit-mismatch-error');

const { match } = sinon;
const statusValues = appveyorSwagger.definitions.Status.enum;

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'appveyor-status'];
const TEST_TOKEN_PATH =
  path.join(__dirname, '..', '..', 'test-data', 'token.txt');

process.env.APPVEYOR_API_TOKEN = 'env-token';

// supports-color checks $FORCE_COLOR in require.  Can't test if set.
const colorIt =
  hasOwnProperty.call(process.env, 'FORCE_COLOR') ? xit : it;

const origTerm = process.env.TERM;
function restoreTerm() {
  if (origTerm === undefined) {
    delete process.env.TERM;
  } else {
    process.env.TERM = origTerm;
  }
}

function toRegExp(str) {
  return new RegExp(escapeStringRegexp(str));
}

describe('appveyor-status command', () => {
  // Ensure that expectations are not carried over between tests
  let appveyorStatusMock;
  beforeEach(() => {
    appveyorStatusMock = sinon.mock(appveyorStatus);
  });
  afterEach(() => {
    appveyorStatusMock.restore();
    appveyorStatusMock = null;
  });

  // Test options object with standard streams for convenience
  let options;
  beforeEach(() => {
    options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough(),
    };
  });

  it('returns undefined when called with a function', () => {
    appveyorStatusMock.expects('getStatus')
      .once()
      .withArgs(
        match.object,
        match.func,
      );
    const result = appveyorStatusCmd(RUNTIME_ARGS, sinon.mock().never());
    appveyorStatusMock.verify();
    assert.strictEqual(result, undefined);
  });

  function expectArgsAs(args, expectObj) {
    it(`interprets ${args.join(' ')} as ${expectObj}`, (done) => {
      appveyorStatusMock.expects('getStatus').once()
        .withArgs(
          expectObj,
          match.func,
        )
        .yields(null, 'success');
      const allArgs = [...RUNTIME_ARGS, ...args];
      appveyorStatusCmd(allArgs, options, (err) => {
        assert.ifError(err);
        appveyorStatusMock.verify();
        done();
      });
    });
  }

  function expectArgsResult(args, expectCode, expectOutMsg, expectErrMsg) {
    it(`prints error and exits for ${args.join(' ')}`, (done) => {
      appveyorStatusMock.expects('getStatus').never();
      const allArgs = [...RUNTIME_ARGS, ...args];
      appveyorStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, expectCode);

        if (expectOutMsg instanceof RegExp) {
          assert.match(String(options.out.read()), expectOutMsg);
        } else {
          assert.strictEqual(options.out.read(), expectOutMsg);
        }

        if (expectErrMsg instanceof RegExp) {
          assert.match(String(options.err.read()), expectErrMsg);
        } else {
          assert.strictEqual(options.err.read(), expectErrMsg);
        }

        appveyorStatusMock.verify();
        done();
      });
    });
  }

  // Check individual arguments are handled correctly
  expectArgsResult(['--badge'], 4, null, /missing|not enough/i);
  expectArgsResult(['-B'], 4, null, /missing|not enough/i);
  expectArgsAs(['--badge', 'foo'], match({ statusBadgeId: 'foo' }));
  expectArgsAs(['-B', 'foo'], match({ statusBadgeId: 'foo' }));
  expectArgsAs(['--branch'], match({ branch: true }));
  expectArgsAs(['-b'], match({ branch: true }));
  expectArgsAs(['--branch', 'foo'], match({ branch: 'foo' }));
  expectArgsAs(['-b', 'foo'], match({ branch: 'foo' }));
  expectArgsAs(['--color'], match({ color: true }));
  expectArgsAs(['--no-color'], match({ color: false }));
  expectArgsAs(['--commit'], match({ commit: 'HEAD' }));
  expectArgsAs(['-c'], match({ commit: 'HEAD' }));
  expectArgsAs(['--commit', 'foo'], match({ commit: 'foo' }));
  expectArgsAs(['--commit', '123'], match({ commit: '123' }));
  expectArgsAs(['-c', 'foo'], match({ commit: 'foo' }));
  expectArgsResult(['--help'], 0, /usage/i, null);
  expectArgsResult(['-h'], 0, /usage/i, null);
  expectArgsResult(['-?'], 0, /usage/i, null);
  expectArgsResult(['--project'], 4, null, /missing|not enough/i);
  expectArgsResult(['-p'], 4, null, /missing|not enough/i);
  // Note: Format is checked inside appveyor-status module, not this one
  expectArgsAs(['--project', 'foo'], match({ project: 'foo' }));
  expectArgsAs(['-p', 'foo'], match({ project: 'foo' }));
  expectArgsAs(['--quiet'], match({ verbosity: -1 }));
  expectArgsAs(['-q'], match({ verbosity: -1 }));
  expectArgsAs(['-qq'], match({ verbosity: -2 }));
  expectArgsAs(['--quiet', '-q'], match({ verbosity: -2 }));
  expectArgsResult(['--repo'], 4, null, /missing|not enough/i);
  expectArgsResult(['-r'], 4, null, /missing|not enough/i);
  expectArgsAs(['--repo', 'foo'], match({ repo: 'foo' }));
  expectArgsAs(['-r', 'foo'], match({ repo: 'foo' }));
  expectArgsResult(['--token'], 4, null, /missing|not enough/i);
  expectArgsResult(['-t'], 4, null, /missing|not enough/i);
  // Default token from $APPVEYOR_API_TOKEN
  expectArgsAs([], match({ token: 'env-token' }));
  expectArgsAs(['--token', 'foo'], match({ token: 'foo' }));
  expectArgsAs(['-t', 'foo'], match({ token: 'foo' }));
  expectArgsResult(['--token-file'], 4, null, /missing|not enough/i);
  expectArgsResult(['-T'], 4, null, /missing|not enough/i);
  expectArgsAs(
    ['--token-file', TEST_TOKEN_PATH],
    match({ token: 'file-token' }),
  );
  expectArgsAs(['-T', TEST_TOKEN_PATH], match({ token: 'file-token' }));
  expectArgsResult(['--token-file', 'badfile'], 4, null, /token.*badfile/i);
  expectArgsResult(['-T', 'badfile'], 4, null, /token.*badfile/i);
  expectArgsAs(['--verbose'], match({ verbosity: 1 }));
  expectArgsAs(['-v'], match({ verbosity: 1 }));
  expectArgsAs(['-vv'], match({ verbosity: 2 }));
  expectArgsAs(['--verbose', '-v'], match({ verbosity: 2 }));
  expectArgsAs(['--wait'], match({ wait: Infinity }));
  expectArgsAs(['-w'], match({ wait: Infinity }));
  expectArgsAs(['--wait', '10'], match({ wait: 10000 }));
  expectArgsAs(['-w', '10'], match({ wait: 10000 }));
  expectArgsResult(['--wait', 'foo'], 4, null, /number/i);
  expectArgsResult(['-w', 'foo'], 4, null, /number/i);
  expectArgsResult(['--webhook'], 4, null, /missing|not enough/i);
  expectArgsResult(['-W'], 4, null, /missing|not enough/i);
  expectArgsAs(['--webhook', 'foo'], match({ webhookId: 'foo' }));
  expectArgsAs(['-W', 'foo'], match({ webhookId: 'foo' }));

  expectArgsResult(
    ['-t', 'foo', '-T', 'bar'], 4, null,
    /conflict|exclusive|together/i,
  );

  expectArgsAs(['-q', '-v'], match({ verbosity: 0 }));
  expectArgsAs(['-v', '-q'], match({ verbosity: 0 }));
  expectArgsAs(['-v', '-q', '-v'], match({ verbosity: 1 }));

  // Satisfy GNU Coding Standards --version convention:
  // https://www.gnu.org/prep/standards/html_node/_002d_002dversion.html
  const verStr = `${packageJson.name} ${packageJson.version}`;
  const versionRE = new RegExp(`^${escapeStringRegexp(verStr)}\n`);
  expectArgsResult(['--version'], 0, versionRE, null);
  expectArgsResult(['-V'], 0, versionRE, null);

  // Unexpected arguments
  expectArgsResult(['foo'], 4, null, /\barguments?\b/i);

  it('interprets -T - as reading token from stdin', (done) => {
    appveyorStatusMock.expects('getStatus').once()
      .withArgs(
        match({ token: 'file-token' }),
        match.func,
      )
      .yields(null, 'success');
    const allArgs = [...RUNTIME_ARGS, '-T', '-'];
    options.in = fs.createReadStream(TEST_TOKEN_PATH);
    appveyorStatusCmd(allArgs, options, (err) => {
      assert.ifError(err);
      appveyorStatusMock.verify();
      done();
    });
  });

  function expectCodeForStatusCode(expectCode, status) {
    const desc = `exits with code ${expectCode} for build ${status}`;
    it(desc, (done) => {
      appveyorStatusMock.expects('getStatus')
        .once().withArgs(match.object, match.func).yields(null, status);
      appveyorStatusCmd(RUNTIME_ARGS, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, expectCode);
        done();
      });
    });
  }
  for (const status of statusValues) {
    expectCodeForStatusCode(status === 'success' ? 0 : 2, status);
  }
  expectCodeForStatusCode(2, 'unrecognized');

  colorIt('prints status to stdout by default', (done) => {
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(null, 'success');
    appveyorStatusCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(
        String(options.out.read()),
        // Be strict about this format since other programs may use it
        'AppVeyor build status: success\n',
      );
      assert.strictEqual(options.err.read(), null);
      done();
    });
  });

  // Test what happens when supports-color returns false
  describe('with $TERM=xterm', () => {
    before(() => { process.env.TERM = 'xterm'; });
    after(restoreTerm);

    for (const status of statusValues) {
      const colorName = status === 'success' ? 'green'
        : status === 'failed' ? 'red'
          : 'gray';
      colorIt(`prints ${status} in ${colorName} to TTY`, (done) => {
        appveyorStatusMock.expects('getStatus')
          .once().withArgs(match.object, match.func).yields(null, status);
        options.out.isTTY = true;
        appveyorStatusCmd(RUNTIME_ARGS, options, (err, code) => {
          assert.ifError(err);
          assert.strictEqual(code, status === 'success' ? 0 : 2);
          const outString = String(options.out.read());
          const ansiStyle = ansiStyles[colorName];
          assert.match(
            outString,
            toRegExp(`${ansiStyle.open}status${ansiStyle.close}`),
          );
          assert.strictEqual(options.err.read(), null);
          done();
        });
      });
    }
  });

  // Test what happens when supports-color returns false
  describe('with $TERM=dumb', () => {
    before(() => { process.env.TERM = 'dumb'; });
    after(restoreTerm);

    for (const status of statusValues) {
      colorIt(`prints ${status} without color to TTY`, (done) => {
        appveyorStatusMock.expects('getStatus')
          .once().withArgs(match.object, match.func).yields(null, status);
        options.out.isTTY = true;
        appveyorStatusCmd(RUNTIME_ARGS, options, (err, code) => {
          assert.ifError(err);
          assert.strictEqual(code, status === 'success' ? 0 : 2);
          const outString = String(options.out.read());
          assert(!hasAnsi(outString), 'does not have color escapes');
          assert.strictEqual(options.err.read(), null);
          done();
        });
      });
    }
  });

  for (const arg of ['-q', '--quiet']) {
    it(`${arg} exits without printing status`, (done) => {
      appveyorStatusMock.expects('getStatus')
        .once().withArgs(match.object, match.func).yields(null, 'failed');
      const allArgs = [...RUNTIME_ARGS, arg];
      appveyorStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 2);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
    });
  }

  // This tests exception handling in the parseYargs wrapper
  it('allows callback errors to propagate', () => {
    appveyorStatusMock.expects('getStatus').never();
    const errTest = new Error('test');
    let caughtError = false;
    let called = false;
    // Note:  Chai assert.throws does not accept comparison function like node
    try {
      const allArgs = [...RUNTIME_ARGS, 'foo'];
      appveyorStatusCmd(allArgs, options, () => {
        assert(!called, 'callback called exactly once');
        called = true;
        throw errTest;
      });
    } catch (err) {
      caughtError = true;
      assert.strictEqual(err, errTest);
    }
    assert(caughtError, 'Missing expected exception.');
  });

  it('throws for non-function callback', () => {
    appveyorStatusMock.expects('getStatus').never();
    assert.throws(
      () => { appveyorStatusCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
    );
  });

  it('can be called without arguments', () => {
    appveyorStatusMock.expects('getStatus')
      .once()
      .withArgs(
        match.object,
        match.func,
      );
    appveyorStatusCmd(null, sinon.mock().never());
    appveyorStatusMock.verify();
  });

  it('yields TypeError for non-Array-like args', (done) => {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd(true, options, (err) => {
      assert(err instanceof TypeError);
      assert.match(err.message, /\bArray\b/);
      done();
    });
  });

  it('yields RangeError for less than 2 args', (done) => {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd([], options, (err) => {
      assert(err instanceof RangeError);
      assert.match(err.message, /\bargs\b/);
      done();
    });
  });

  it('yields Error for non-object options', (done) => {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd(RUNTIME_ARGS, true, (err) => {
      assert(err instanceof TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('yields Error for non-Readable in', (done) => {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd(RUNTIME_ARGS, { in: true }, (err) => {
      assert(err instanceof TypeError);
      assert.match(err.message, /\boptions.in\b/);
      done();
    });
  });

  it('yields Error for non-Writable out', (done) => {
    appveyorStatusMock.expects('getStatus').never();
    const badOptions = { out: new stream.Readable() };
    appveyorStatusCmd(RUNTIME_ARGS, badOptions, (err) => {
      assert(err instanceof TypeError);
      assert.match(err.message, /\boptions.out\b/);
      done();
    });
  });

  it('yields Error for non-Writable err', (done) => {
    appveyorStatusMock.expects('getStatus').never();
    const badOptions = { err: new stream.Readable() };
    appveyorStatusCmd(RUNTIME_ARGS, badOptions, (err) => {
      assert(err instanceof TypeError);
      assert.match(err.message, /\boptions.err\b/);
      done();
    });
  });

  it('exit code 1 and prints message on Error', (done) => {
    const errMsg = 'super duper test error';
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(new Error(errMsg));
    appveyorStatusCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      assert.strictEqual(options.out.read(), null);
      const errString = String(options.err.read());
      assert.match(errString, toRegExp(errMsg));
      done();
    });
  });

  it('exit code 3 and prints message on CommitMismatchError', (done) => {
    const testCommit = '123';
    const errTest = new CommitMismatchError({
      actual: 'foo',
      expected: testCommit,
    });
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(errTest);
    const allArgs = [...RUNTIME_ARGS, '-c', testCommit];
    appveyorStatusCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 3);
      assert.strictEqual(options.out.read(), null);
      const errString = String(options.err.read());
      assert.match(errString, toRegExp(errTest.actual));
      assert.match(errString, toRegExp(errTest.expected));
      done();
    });
  });

  it('CommitMismatchError prints both given and resolved', (done) => {
    const testCommit = '123';
    const testTag = 'tagname';
    const errTest = new CommitMismatchError({
      actual: 'abc',
      expected: testCommit,
    });
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(errTest);
    const allArgs = [...RUNTIME_ARGS, '-c', testTag];
    appveyorStatusCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 3);
      assert.strictEqual(options.out.read(), null);
      const errString = String(options.err.read());
      assert.match(errString, toRegExp(errTest.actual));
      assert.match(errString, toRegExp(errTest.expected));
      assert.match(errString, toRegExp(testTag));
      done();
    });
  });

  it('returns a Promise when called without a function', () => {
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func);
    const result = appveyorStatusCmd(RUNTIME_ARGS);
    assert(result instanceof Promise);
  });

  it('returned Promise is resolved with exit code', () => {
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(null, 'success');
    const result = appveyorStatusCmd(RUNTIME_ARGS, options);
    return result.then((code) => {
      assert.strictEqual(code, 0);
    });
  });

  it('returned Promise is rejected with Error', () => {
    appveyorStatusMock.expects('getStatus').never();
    const result = appveyorStatusCmd(RUNTIME_ARGS, true);
    return result.then(
      sinon.mock().never(),
      (err) => { assert(err instanceof TypeError); },
    );
  });
});
