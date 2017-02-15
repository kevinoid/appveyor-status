/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var Chalk = require('chalk').constructor;
var CommitMismatchError = require('../lib/commit-mismatch-error');
var appveyorStatusCmd = require('../bin/appveyor-status');
var appveyorStatus = require('..');
var appveyorSwagger = require('appveyor-swagger');
var assert = require('chai').assert;
var escapeStringRegexp = require('escape-string-regexp');
var packageJson = require('../package.json');
var path = require('path');
var sinon = require('sinon');
var stream = require('stream');

var chalk = new Chalk({enabled: true});
var match = sinon.match;
var statusValues = appveyorSwagger.definitions.Status.enum;

// Simulate arguments passed by the node runtime
var RUNTIME_ARGS = ['node', 'appveyor-status'];
var TEST_TOKEN_PATH = path.join(__dirname, '..', 'test-data', 'token.txt');

process.env.APPVEYOR_API_TOKEN = 'env-token';

describe('appveyor-status command', function() {
  // Ensure that expectations are not carried over between tests
  var appveyorStatusMock;
  beforeEach(function() {
    appveyorStatusMock = sinon.mock(appveyorStatus);
  });
  afterEach(function() {
    appveyorStatusMock.restore();
    appveyorStatusMock = null;
  });

  // Test options object with standard streams for convenience
  var options;
  beforeEach(function() {
    options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
  });

  it('accepts empty arguments', function() {
    appveyorStatusMock.expects('getStatus')
      .once()
      .withArgs(
        match.object,
        match.func
      );
    appveyorStatusCmd([], sinon.mock().never());
    appveyorStatusMock.verify();
  });

  it('returns undefined when called with a function', function() {
    appveyorStatusMock.expects('getStatus')
      .once()
      .withArgs(
        match.object,
        match.func
      );
    var result = appveyorStatusCmd(RUNTIME_ARGS, sinon.mock().never());
    appveyorStatusMock.verify();
    assert.strictEqual(result, undefined);
  });

  function expectArgsAs(args, expectObj) {
    it('interprets ' + args.join(' ') + ' as ' + expectObj, function(done) {
      appveyorStatusMock.expects('getStatus').once()
        .withArgs(
          expectObj,
          match.func
        )
        .yields(null, 'success');
      var allArgs = RUNTIME_ARGS.concat(args);
      appveyorStatusCmd(allArgs, options, function(err) {
        assert.ifError(err);
        appveyorStatusMock.verify();
        done();
      });
    });
  }

  function expectArgsResult(args, expectCode, expectOutMsg, expectErrMsg) {
    it('prints error and exits for ' + args.join(' '), function(done) {
      appveyorStatusMock.expects('getStatus').never();
      var allArgs = RUNTIME_ARGS.concat(args);
      appveyorStatusCmd(allArgs, options, function(err, code) {
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
  expectArgsAs(['--branch'], match({branch: true}));
  expectArgsAs(['-b'], match({branch: true}));
  expectArgsAs(['--branch', 'foo'], match({branch: 'foo'}));
  expectArgsAs(['-b', 'foo'], match({branch: 'foo'}));
  // TODO: color default should be options.err.isTTY.  Test both states.
  expectArgsAs([], match({color: false}));
  expectArgsAs(['--color'], match({color: true}));
  expectArgsAs(['--no-color'], match({color: false}));
  expectArgsAs(['--commit'], match({commit: 'HEAD'}));
  expectArgsAs(['-c'], match({commit: 'HEAD'}));
  expectArgsAs(['--commit', 'foo'], match({commit: 'foo'}));
  expectArgsAs(['--commit', '123'], match({commit: '123'}));
  expectArgsAs(['-c', 'foo'], match({commit: 'foo'}));
  expectArgsResult(['--help'], 0, /usage/i, null);
  expectArgsResult(['-h'], 0, /usage/i, null);
  expectArgsResult(['-?'], 0, /usage/i, null);
  expectArgsResult(['--project'], 4, null, /missing|not enough/i);
  expectArgsResult(['-p'], 4, null, /missing|not enough/i);
  // Note: Format is checked inside appveyor-status module, not this one
  expectArgsAs(['--project', 'foo'], match({project: 'foo'}));
  expectArgsAs(['-p', 'foo'], match({project: 'foo'}));
  expectArgsAs(['--quiet'], match({verbosity: -1}));
  expectArgsAs(['-q'], match({verbosity: -1}));
  expectArgsAs(['-qq'], match({verbosity: -2}));
  expectArgsAs(['--quiet', '-q'], match({verbosity: -2}));
  expectArgsResult(['--repo'], 4, null, /missing|not enough/i);
  expectArgsResult(['-r'], 4, null, /missing|not enough/i);
  expectArgsAs(['--repo', 'foo'], match({repo: 'foo'}));
  expectArgsAs(['-r', 'foo'], match({repo: 'foo'}));
  expectArgsResult(['--token'], 4, null, /missing|not enough/i);
  expectArgsResult(['-t'], 4, null, /missing|not enough/i);
  // Default token from $APPVEYOR_API_TOKEN
  expectArgsAs([], match({token: 'env-token'}));
  expectArgsAs(['--token', 'foo'], match({token: 'foo'}));
  expectArgsAs(['-t', 'foo'], match({token: 'foo'}));
  expectArgsResult(['--token-file'], 4, null, /missing|not enough/i);
  expectArgsResult(['-T'], 4, null, /missing|not enough/i);
  expectArgsAs(['--token-file', TEST_TOKEN_PATH], match({token: 'file-token'}));
  expectArgsAs(['-T', TEST_TOKEN_PATH], match({token: 'file-token'}));
  expectArgsResult(['--token-file', 'badfile'], 4, null, /token.*badfile/i);
  expectArgsResult(['-T', 'badfile'], 4, null, /token.*badfile/i);
  expectArgsAs(['--verbose'], match({verbosity: 1}));
  expectArgsAs(['-v'], match({verbosity: 1}));
  expectArgsAs(['-vv'], match({verbosity: 2}));
  expectArgsAs(['--verbose', '-v'], match({verbosity: 2}));
  expectArgsAs(['--wait'], match({wait: Infinity}));
  expectArgsAs(['-w'], match({wait: Infinity}));
  expectArgsAs(['--wait', '10'], match({wait: 10000}));
  expectArgsAs(['-w', '10'], match({wait: 10000}));
  expectArgsResult(['--wait', 'foo'], 4, null, /number/i);
  expectArgsResult(['-w', 'foo'], 4, null, /number/i);
  expectArgsResult(['--webhook'], 4, null, /missing|not enough/i);
  expectArgsResult(['-W'], 4, null, /missing|not enough/i);
  expectArgsAs(['--webhook', 'foo'], match({webhookId: 'foo'}));
  expectArgsAs(['-W', 'foo'], match({webhookId: 'foo'}));

  expectArgsResult(['-t', 'foo', '-T', 'bar'], 4, null,
                   /conflict|exclusive|together/i);

  expectArgsAs(['-q', '-v'], match({verbosity: 0}));
  expectArgsAs(['-v', '-q'], match({verbosity: 0}));
  expectArgsAs(['-v', '-q', '-v'], match({verbosity: 1}));

  // Satisfy GNU Coding Standards --version convention:
  // https://www.gnu.org/prep/standards/html_node/_002d_002dversion.html
  var versionRE = new RegExp(
    '^' + escapeStringRegexp(packageJson.name + ' ' + packageJson.version) +
      '\n'
  );
  expectArgsResult(['--version'], 0, versionRE, null);
  expectArgsResult(['-V'], 0, versionRE, null);

  // Unexpected arguments
  expectArgsResult(['foo'], 4, null, /\barguments?\b/i);

  function expectCodeForStatusCode(expectCode, status) {
    var desc = 'exits with code ' + expectCode + ' for build ' + status;
    it(desc, function(done) {
      appveyorStatusMock.expects('getStatus')
        .once().withArgs(match.object, match.func).yields(null, status);
      appveyorStatusCmd(RUNTIME_ARGS, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, expectCode);
        done();
      });
    });
  }
  statusValues.forEach(function(status) {
    expectCodeForStatusCode(status === 'success' ? 0 : 2, status);
  });
  expectCodeForStatusCode(2, 'unrecognized');

  it('prints status to stdout by default', function(done) {
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(null, 'success');
    appveyorStatusCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(
        String(options.out.read()),
        // Be strict about this format since other programs may use it
        'AppVeyor build status: success\n'
      );
      assert.strictEqual(options.err.read(), null);
      done();
    });
  });

  statusValues.forEach(function(status) {
    var colorName = status === 'success' ? 'green' :
      status === 'failed' ? 'red' :
      'gray';
    it('prints ' + status + ' in ' + colorName + ' to TTY', function(done) {
      appveyorStatusMock.expects('getStatus')
        .once().withArgs(match.object, match.func).yields(null, status);
      options.out.isTTY = true;
      appveyorStatusCmd(RUNTIME_ARGS, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, status === 'success' ? 0 : 2);
        var outString = String(options.out.read());
        assert.include(
          outString,
          chalk[colorName](status)
        );
        assert.strictEqual(options.err.read(), null);
        done();
      });
    });
  });

  ['-q', '--quiet'].forEach(function(arg) {
    it(arg + ' exits without printing status', function(done) {
      appveyorStatusMock.expects('getStatus')
        .once().withArgs(match.object, match.func).yields(null, 'failed');
      var allArgs = RUNTIME_ARGS.concat(arg);
      appveyorStatusCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 2);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
    });
  });

  it('throws for non-function callback', function() {
    appveyorStatusMock.expects('getStatus').never();
    assert.throws(
      function() { appveyorStatusCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('returns Error for non-object options', function(done) {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd([], true, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('returns Error for non-Readable in', function(done) {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd([], {in: true}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.in\b/);
      done();
    });
  });

  it('returns Error for non-Writable out', function(done) {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd([], {out: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.out\b/);
      done();
    });
  });

  it('returns Error for non-Writable err', function(done) {
    appveyorStatusMock.expects('getStatus').never();
    appveyorStatusCmd([], {err: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.err\b/);
      done();
    });
  });

  it('exit code 1 and prints message on Error', function(done) {
    var errMsg = 'super duper test error';
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(new Error(errMsg));
    appveyorStatusCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      assert.strictEqual(options.out.read(), null);
      var errString = String(options.err.read());
      assert.include(errString, errMsg);
      done();
    });
  });

  it('exit code 3 and prints message on CommitMismatchError', function(done) {
    var errTest = new CommitMismatchError({
      actual: 'foo',
      expected: 'bar'
    });
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(errTest);
    appveyorStatusCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 3);
      assert.strictEqual(options.out.read(), null);
      var errString = String(options.err.read());
      assert.include(errString, errTest.actual);
      assert.include(errString, errTest.expected);
      done();
    });
  });

  it('returns a Promise when called without a function', function() {
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func);
    var result = appveyorStatusCmd(RUNTIME_ARGS);
    assert(result instanceof Promise);
  });

  it('returned Promise is resolved with exit code', function() {
    appveyorStatusMock.expects('getStatus')
      .once().withArgs(match.object, match.func).yields(null, 'success');
    var result = appveyorStatusCmd(RUNTIME_ARGS, options);
    return result.then(function(code) {
      assert.strictEqual(code, 0);
    });
  });

  it('returned Promise is rejected with Error', function() {
    appveyorStatusMock.expects('getStatus').never();
    var result = appveyorStatusCmd(RUNTIME_ARGS, true);
    return result.then(
      sinon.mock().never(),
      function(err) { assert.instanceOf(err, TypeError); }
    );
  });
});
