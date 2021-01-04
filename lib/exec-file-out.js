/**
 * @copyright Copyright 2017, 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { execFile } = require('child_process');

/** Promisified <code>execFile</code> wrapper which only provides access to
 * <code>stdout</code> and fails if <code>stderr</code> is non-empty.
 *
 * @param {string} file The name or path of the executable file to run
 * @param {Array<string>=} args List of string arguments
 * @param {module:child_process.ExecFileOptions=} options Options to pass to
 * {@link child_process.execFile}.
 * @returns {!Promise<string|!Buffer>} Promise of <code>stdout</code> or
 * Error if <code>execFile</code> fails or <code>stderr</code> contains
 * non-whitespace characters.
 * @private
 */
function execFileOut(file, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      // Note: stderr can be Buffer if options.encoding === 'buffer'
      } else if (stderr.length > 0) {
        let cmd = file;
        if (args) {
          cmd += ` ${args.join(' ')}`;
        }

        // Same Error properties as execFile for code !== 0
        const errStderr = new Error(`Command failed: ${cmd}\n${stderr}`);
        errStderr.cmd = cmd;
        errStderr.code = 0;
        errStderr.stderr = stderr;
        errStderr.stdout = stdout;
        reject(errStderr);
      } else {
        resolve(stdout);
      }
    });
    child.stdin.end();
  });
}

module.exports = execFileOut;
