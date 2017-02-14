/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var getExecFile = require('get-exec-file');

/** Promisified <code>execFile</code> wrapper which only provides access to
 * <code>stdout</code> and fails if <code>stderr</code> is non-empty.
 * @param {string} file The name or path of the executable file to run
 * @param {Array<string>=} args List of string arguments
 * @param {Object=} options Options.
 * @return {Promise<string>} Promise of <code>stdout</code> or Error if
 * <code>execFile</code> fails or <code>stderr</code> contains non-whitespace
 * characters.
 * @private
 */
function execFileOut(file, args, options) {
  var child = getExecFile(file, args, options);
  child.stdin.end();
  return child.then(function(result) {
    // Note: stderr can be Buffer if options.encoding === 'buffer'
    var stderr = result.stderr.toString();
    if (stderr.trim()) {
      // Same Error as execFile for code !== 0
      var cmd = file;
      if (args) {
        cmd += ' ' + args.join(' ');
      }
      var err = new Error('Command failed: ' + cmd + '\n' + stderr);
      err.cmd = cmd;
      err.code = 0;
      err.stderr = result.stderr;
      err.stdout = result.stdout;
      return Promise.reject(err);
    }

    return result.stdout;
  });
}

module.exports = execFileOut;
