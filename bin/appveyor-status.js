#!/usr/bin/env node
/**
 * The appveyor-status command.
 *
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module appveyor-status/bin/appveyor-status
 */

'use strict';

const ansiStyles = require('ansi-styles');
const Yargs = require('yargs/yargs');
const fs = require('fs');
const readAllStream = require('read-all-stream');
const { supportsColor } = require('supports-color');

const appveyorStatus = require('..');

const packageJson = require('../package.json');

/** Exit codes returned by {@link module:appveyor-status/bin/appveyor-status}
 * (as a bi-directional map).
 * @const
 * @static
 * @enum {number}
 */
const ExitCode = {
  /** Success. */
  SUCCESS: 0,
  /** Failed for an unspecified reason. */
  FAIL_OTHER: 1,
  /** Failed due to build status. */
  FAIL_STATUS: 2,
  /** Failed due to commit mismatch. */
  FAIL_COMMIT: 3,
  /** Failed due to invalid arguments. */
  FAIL_ARGUMENTS: 4,
};

// Add mapping from code to name
Object.keys(ExitCode).forEach((codeName) => {
  const code = ExitCode[codeName];
  ExitCode[code] = codeName;
});

/** Maps AppVeyor build status to an ansi-styles color name.
 * @const
 * @type {Object<string, string>}
 * @private
 */
const statusColor = {
  failed: 'red',
  success: 'green',
};

function coerceWait(arg) {
  const val = arg === true ? Infinity : Number(arg);
  if (Number.isNaN(val)) {
    throw new TypeError(`Invalid number "${arg}"`);
  }
  return val;
}

/** Gets the AppVeyor build status, handles errors, and writes the result to
 * output or error streams.
 * @private
 */
function checkStatus(options, callback) {
  appveyorStatus.getStatus(options, (err, status) => {
    if (err) {
      if (err.name === 'CommitMismatchError') {
        let expected = options.commit;
        if (options.commit !== err.expected) {
          expected += ` (${err.expected})`;
        }
        options.err.write(`Error: Last build commit ${err.actual} `
                          + `did not match ${expected}\n`);
        callback(null, ExitCode.FAIL_COMMIT);
      } else {
        options.err.write(`${err}\n`);
        callback(null, ExitCode.FAIL_OTHER);
      }

      return;
    }

    if (options.verbosity >= 0) {
      let statusColored;
      if (options.color) {
        const colorName = statusColor[status] || 'gray';
        const ansiStyle = ansiStyles[colorName];
        statusColored = `${ansiStyle.open}status${ansiStyle.close}`;
      } else {
        statusColored = status;
      }

      options.out.write(`AppVeyor build status: ${statusColored}\n`);
    }
    callback(
      null,
      status === 'success' ? ExitCode.SUCCESS : ExitCode.FAIL_STATUS,
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
    return new Promise((resolve, reject) => {
      appveyorStatusCmd(args, options, (err, result) => {
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
    } else if (typeof args !== 'object'
               || Math.floor(args.length) !== args.length) {
      throw new TypeError('args must be Array-like');
    } else if (args.length < 2) {
      throw new RangeError('args must have at least 2 elements');
    } else {
      args = Array.prototype.slice.call(args, 2).map(String);
    }

    if (options !== undefined && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = {
      in: process.stdin,
      out: process.stdout,
      err: process.stderr,
      ...options,
    };

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
    process.nextTick(() => {
      callback(err);
    });
    return undefined;
  }

  // Workaround for https://github.com/yargs/yargs/issues/783
  // Necessary because mocha package.json overrides .parserConfiguration()
  require.main = module;
  const yargs = new Yargs(null, null, require)
    .parserConfiguration({
      'parse-numbers': false,
      'duplicate-arguments-array': false,
      'flatten-duplicate-arrays': false,
    })
    .usage('Usage: $0 [options]')
    .help()
    .alias('help', 'h')
    .alias('help', '?')
    .option('badge', {
      alias: 'B',
      describe:
        'Status Badge ID of project (from badge URL, exclusive with commit)',
      nargs: 1,
    })
    .option('branch', {
      alias: 'b',
      description: 'Query latest build for a branch',
      defaultDescription: '(current)',
    })
    .option('color', {
      description: 'Colorize the output',
      default: undefined,
      defaultDescription: '(to TTY)',
      type: 'boolean',
    })
    .option('commit', {
      alias: 'c',
      description:
        'Require build to be for named commit (requires project or token)',
      defaultDescription: 'HEAD',
    })
    .option('project', {
      alias: 'p',
      describe: 'AppVeyor project to query (as $user/$proj)',
      nargs: 1,
    })
    .option('quiet', {
      alias: 'q',
      describe: 'Print less output',
      count: true,
    })
    .option('repo', {
      alias: 'r',
      describe: 'Repository to query (URL or path)',
      defaultDescription: '.',
      nargs: 1,
    })
    .option('token', {
      alias: 't',
      describe: 'API access token',
      defaultDescription: '$APPVEYOR_API_TOKEN env var',
      nargs: 1,
    })
    .option('token-file', {
      alias: 'T',
      describe: 'file containing API access token',
      nargs: 1,
    })
    .conflicts('token-file', 'token')
    .option('verbose', {
      alias: 'v',
      describe: 'Print more output',
      count: true,
    })
    .option('wait', {
      alias: 'w',
      describe: 'Wait if build is pending (timeout in seconds)',
      defaultDescription: 'Infinity',
      coerce: coerceWait,
    })
    .option('webhook', {
      alias: 'W',
      /* Undocumented.  Deprecated in favor of --badge
       * 'Webhook ID of project (from badge URL, exclusive with commit)' */
      nargs: 1,
    })
    .version(`${packageJson.name} ${packageJson.version}`)
    .alias('version', 'V')
    .strict();
  yargs.parse(args, (err, argOpts, output) => {
    if (err) {
      options.err.write(output ? `${output}\n`
        : `${err.name}: ${err.message}\n`);
      callback(null, ExitCode.FAIL_ARGUMENTS);
      return;
    }

    if (output) {
      options.out.write(`${output}\n`);
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
      argOpts.color = supportsColor(options.out).hasBasic;
    }

    if (argOpts.commit === true) {
      argOpts.commit = 'HEAD';
    }

    if (argOpts.wait) {
      argOpts.wait *= 1000;
    }

    argOpts.statusBadgeId = argOpts.badge;
    delete argOpts.badge;

    argOpts.webhookId = argOpts.webhook;
    delete argOpts.webhook;

    const statusOpts = { ...options, ...argOpts };

    if (argOpts.tokenFile !== undefined) {
      const tokenFileStream = argOpts.tokenFile === '-' ? options.in
        : fs.createReadStream(argOpts.tokenFile);
      readAllStream(tokenFileStream, (errRead, token) => {
        if (errRead) {
          options.err.write('Error: Unable to read API token file: '
                            + `${errRead.message}\n`);
          callback(null, ExitCode.FAIL_ARGUMENTS);
          return;
        }

        statusOpts.token = token.trim();
        checkStatus(statusOpts, callback);
      });
    } else {
      statusOpts.token = statusOpts.token !== undefined ? statusOpts.token
        : process.env.APPVEYOR_API_TOKEN;
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
  const mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr,
  };
  module.exports(process.argv, mainOptions, (err, exitCode) => {
    if (err) {
      process.stderr.write(`${err.stack}\n`);
      exitCode = ExitCode.FAIL_OTHER;
    }

    process.exit(exitCode);
  });
}
