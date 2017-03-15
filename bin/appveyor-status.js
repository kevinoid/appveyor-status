#!/usr/bin/env node
/**
 * The appveyor-status command.
 *
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module appveyor-status/bin/appveyor-status
 */

'use strict';

var Chalk = require('chalk').constructor;
var Yargs = require('yargs/yargs');
var appveyorStatus = require('..');
var assign = require('object-assign');
var fs = require('fs');
var packageJson = require('../package.json');
var readAllStream = require('read-all-stream');

/** Exit codes returned by {@link module:appveyor-status/bin/appveyor-status}
 * (as a bi-directional map).
 * @const
 * @static
 * @enum {number}
 */
var ExitCode = {
  /** Success. */
  SUCCESS: 0,
  /** Failed for an unspecified reason. */
  FAIL_OTHER: 1,
  /** Failed due to build status. */
  FAIL_STATUS: 2,
  /** Failed due to commit mismatch. */
  FAIL_COMMIT: 3,
  /** Failed due to invalid arguments. */
  FAIL_ARGUMENTS: 4
};

// Add mapping from code to name
Object.keys(ExitCode).forEach(function(codeName) {
  var code = ExitCode[codeName];
  ExitCode[code] = codeName;
});

/** Maps AppVeyor build status to a chalk color name.
 * @const
 * @type {Object<string, string>}
 * @private
 */
var statusColor = {
  failed: 'red',
  success: 'green'
};

function coerceWait(arg) {
  var val = arg === true ? Infinity : Number(arg);
  if (isNaN(val)) {
    throw new Error('Invalid number "' + arg + '"');
  }
  return val;
}

/** Calls <code>yargs.parse</code> and passes any thrown errors to the callback.
 * Workaround for https://github.com/yargs/yargs/issues/755
 * @private
 */
function parseYargs(yargs, args, callback) {
  // Since yargs doesn't nextTick its callback, this function must be careful
  // that exceptions thrown from callback (which propagate through yargs.parse)
  // are not caught and passed to a second invocation of callback.
  var called = false;
  try {
    yargs.parse(args, function() {
      called = true;
      return callback.apply(this, arguments);
    });
  } catch (err) {
    if (called) {
      // err was thrown after or by callback.  Let it propagate.
      throw err;
    } else {
      callback(err);
    }
  }
}

/** Gets the AppVeyor build status, handles errors, and writes the result to
 * output or error streams.
 * @private
 */
function checkStatus(options, callback) {
  appveyorStatus.getStatus(options, function(err, status) {
    if (err) {
      if (err.name === 'CommitMismatchError') {
        var expected = options.commit;
        if (options.commit !== err.expected) {
          expected += ' (' + err.expected + ')';
        }
        options.err.write('Error: Last build commit ' + err.actual +
                          ' did not match ' + expected + '\n');
        callback(null, ExitCode.FAIL_COMMIT);
      } else {
        options.err.write(err + '\n');
        callback(null, ExitCode.FAIL_OTHER);
      }

      return;
    }

    if (options.verbosity >= 0) {
      var chalk = new Chalk({enabled: options.color});
      var colorName = statusColor[status] || 'gray';
      var statusColored = chalk[colorName](status);
      options.out.write('AppVeyor build status: ' + statusColored + '\n');
    }
    callback(
      null,
      status === 'success' ? ExitCode.SUCCESS : ExitCode.FAIL_STATUS
    );
  });
}

/** Options for command entry points.
 *
 * @static
 * @typedef {{
 *   in: (stream.Readable|undefined),
 *   out: (stream.Writable|undefined),
 *   err: (stream.Writable|undefined)
 * }} CommandOptions
 * @property {stream.Readable=} in Stream from which input is read. (default:
 * <code>process.stdin</code>)
 * @property {stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 */
// var CommandOptions;

/** Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {module:appveyor-status/bin/appveyor-status.CommandOptions=} options
 * Options.
 * @param {?function(Error, number=)=}
 * callback Callback for the exit code or an <code>Error</code>.  Required if
 * <code>global.Promise</code> is not defined.
 * @return
 * {Promise<module:appveyor-status/bin/appveyor-status.ExitCode>|undefined}
 * If <code>callback</code> is not given and <code>global.Promise</code> is
 * defined, a <code>Promise</code> with the exit code or <code>Error</code>.
 */
module.exports = function appveyorStatusCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback && typeof Promise === 'function') {
    // eslint-disable-next-line no-undef
    return new Promise(function(resolve, reject) {
      appveyorStatusCmd(args, options, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (args === undefined || args === null) {
      args = [];
    } else if (typeof args !== 'object' ||
               Math.floor(args.length) !== args.length) {
      throw new TypeError('args must be Array-like');
    } else if (args.length < 2) {
      throw new RangeError('args must have at least 2 elements');
    } else {
      args = Array.prototype.slice.call(args, 2).map(String);
    }

    if (options !== undefined && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = assign(
      {
        in: process.stdin,
        out: process.stdout,
        err: process.stderr
      },
      options
    );

    if (!options.in || typeof options.in.on !== 'function') {
      throw new TypeError('options.in must be a stream.Readable');
    }
    if (!options.out || typeof options.out.write !== 'function') {
      throw new TypeError('options.out must be a stream.Writable');
    }
    if (!options.err || typeof options.err.write !== 'function') {
      throw new TypeError('options.err must be a stream.Writable');
    }
  } catch (err) {
    process.nextTick(function() {
      callback(err);
    });
    return undefined;
  }

  // Workaround for https://github.com/yargs/yargs/issues/783
  require.main = module;
  var yargs = new Yargs(null, null, require)
    .usage('Usage: $0 [options]')
    .help()
    .alias('help', 'h')
    .alias('help', '?')
    .option('branch', {
      alias: 'b',
      description: 'Query latest build for a branch',
      defaultDescription: '(current)'
    })
    .option('color', {
      description: 'Colorize the output',
      default: undefined,
      defaultDescription: '(to TTY)',
      type: 'boolean'
    })
    .option('commit', {
      alias: 'c',
      description: 'Require build to be for named commit (requires project or token)',
      defaultDescription: 'HEAD'
    })
    .option('project', {
      alias: 'p',
      describe: 'AppVeyor project to query (as $user/$proj)',
      nargs: 1
    })
    .option('quiet', {
      alias: 'q',
      describe: 'Print less output',
      count: true
    })
    .option('repo', {
      alias: 'r',
      describe: 'Repository to query (URL or path)',
      defaultDescription: '.',
      nargs: 1
    })
    .option('token', {
      alias: 't',
      describe: 'API access token',
      defaultDescription: '$APPVEYOR_API_TOKEN env var',
      nargs: 1
    })
    .option('token-file', {
      alias: 'T',
      describe: 'file containing API access token',
      nargs: 1
    })
    .conflicts('token-file', 'token')
    .option('verbose', {
      alias: 'v',
      describe: 'Print more output',
      count: true
    })
    .option('wait', {
      alias: 'w',
      describe: 'Wait if build is pending (timeout in seconds)',
      defaultDescription: 'Infinity',
      coerce: coerceWait
    })
    .option('webhook', {
      alias: 'W',
      describe: 'Webhook ID of project (from badge URL, exclusive with commit)',
      nargs: 1
    })
    .version(packageJson.name + ' ' + packageJson.version)
    .alias('version', 'V')
    .strict();
  parseYargs(yargs, args, function(err, argOpts, output) {
    if (err) {
      options.err.write(output ?
                          output + '\n' :
                          err.name + ': ' + err.message + '\n');
      callback(null, ExitCode.FAIL_ARGUMENTS);
      return;
    }

    if (output) {
      options.out.write(output + '\n');
    }

    if (argOpts.help || argOpts.version) {
      callback(null, ExitCode.SUCCESS);
      return;
    }

    if (argOpts._.length !== 0) {
      options.err.write('Error: Unexpected non-option arguments.\n');
      callback(null, ExitCode.FAIL_ARGUMENTS);
      return;
    }

    argOpts.verbosity = (argOpts.verbose || 0) - (argOpts.quiet || 0);
    delete argOpts.quiet;
    delete argOpts.verbose;

    if (argOpts.color === undefined) {
      // Need cast to Boolean so undefined becomes false to disable Chalk
      argOpts.color = Boolean(options.out.isTTY);
    }

    if (argOpts.commit === true) {
      argOpts.commit = 'HEAD';
    }

    if (argOpts.wait) {
      argOpts.wait *= 1000;
    }

    argOpts.webhookId = argOpts.webhook;
    delete argOpts.webhook;

    var statusOpts = assign({}, options, argOpts);

    if (argOpts.tokenFile !== undefined) {
      var tokenFileStream = argOpts.tokenFile === '-' ? options.in :
        fs.createReadStream(argOpts.tokenFile);
      readAllStream(tokenFileStream, function(errRead, token) {
        if (errRead) {
          options.err.write('Error: Unable to read API token file: ' +
                            errRead.message + '\n');
          callback(null, ExitCode.FAIL_ARGUMENTS);
          return;
        }

        statusOpts.token = token.trim();
        checkStatus(statusOpts, callback);
      });
    } else {
      statusOpts.token = statusOpts.token !== undefined ? statusOpts.token :
        process.env.APPVEYOR_API_TOKEN;
      checkStatus(statusOpts, callback);
    }
  });

  return undefined;
};

module.exports.default = module.exports;
module.exports.ExitCode = ExitCode;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  var mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr
  };
  module.exports(process.argv, mainOptions, function(err, exitCode) {
    if (err) {
      process.stderr.write(err.stack + '\n');
      exitCode = ExitCode.FAIL_OTHER;
    }

    process.exit(exitCode);
  });
}