/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { pathToFileURL } = require('url');
const execFileOut = require('./exec-file-out');

/** Is this process running on Windows?
 *
 * @constant
 * @type {boolean}
 * @private
 */
const isWindows = /^win/i.test(process.platform);

function trim(str) {
  return String.prototype.trim.call(str);
}

/** Gets the name of the current branch.
 *
 * @param {module:child_process.ExecFileOptions=} options Options to pass to
 * {@link child_process.execFile}.
 * @returns {!Promise<string>} Name of current branch or Error if not on a
 * branch, not in a git repository, or another error occurs.
 * @private
 */
exports.getBranch = function getBranch(options) {
  return execFileOut('git', ['symbolic-ref', '-q', '--short', 'HEAD'], options)
    .then(trim)
    .catch((err) => {
      throw new Error(`Unable to determine current branch: ${err.message}`);
    });
};

/** Gets the upstream remote name for a branch.
 *
 * @param {string} branchName Name of branch for which to get remote ref.
 * @param {module:child_process.ExecFileOptions=} options Options to pass to
 * {@link child_process.execFile}.
 * @returns {!Promise<string>} Name of upstream remote for
 * <code>branchName</code>, or Error if
 * branch has no upstream configured, branch does not exist, not in a git
 * repository, or another error occurs.
 * @private
 */
exports.getRemote = function getRemote(branchName, options) {
  const gitArgs = ['config', '--get', `branch.${branchName}.remote`];
  return execFileOut('git', gitArgs, options)
    .then(trim);
};

/** Gets the URL for a named remote.
 *
 * Note:  ls-remote defaulted to origin since 2010 (git/git@cefb2a5e)
 * then the remote for the current branch since 2015 (git/git@da66b274) (v2.5.0)
 * The man page was fixed to note defaulting in 2016 (git/git@80b17e58)
 *
 * @param {?string=} remoteName Name of remote for which to get URL.
 * Default matches <code>git ls-remote --get-url</code>.
 * @param {module:child_process.ExecFileOptions=} options Options to pass to
 * {@link child_process.execFile}.
 * @returns {!Promise<string>} URL for <code>remoteName</code>, or Error if
 * remote has no URL configured, remote does not exist, not in a git repository,
 * or another error occurs.
 * @private
 */
exports.getRemoteUrl = function getRemoteUrl(remoteName, options) {
  const gitArgs = ['ls-remote', '--get-url'];
  if (remoteName !== undefined && remoteName !== null) {
    gitArgs.push(String(remoteName));
  }
  return execFileOut('git', gitArgs, options)
    .then((stdout) => {
      const remoteUrl = stdout.trim();
      // ls-remote prints its argument when it doesn't have a URL
      if (remoteUrl === remoteName) {
        return Promise.reject(new Error(`No URL for ${remoteName} remote`));
      }
      return remoteUrl;
    });
};

/** Is git URL a local path?
 * From url_is_local_not_ssh in connect.c
 *
 * @param {string} gitUrl Git URL to check.
 * @returns {boolean} <code>true</code> if <code>gitUrl</code> represents a
 * local path.
 * @private
 */
exports.gitUrlIsLocalNotSsh = function gitUrlIsLocalNotSsh(gitUrl) {
  return !/^[^/]*:/.test(gitUrl)
    || (isWindows && /^[A-Za-z]:/.test(gitUrl));
};

/** Parses a git URL string into a URL object like {@link url.parse} with
 * support for git helpers, git's SCP-like URL syntax, and local file paths.
 *
 * @param {string} gitUrl Git URL to check.
 * @returns {URL} URL object with a <code>.helper</code> property if the URL
 * included a remote helper.
 * @throws {TypeError} If gitUrl can not be parsed as a URL.
 * @private
 */
exports.parseGitUrl = function parseGitUrl(gitUrl) {
  if (exports.gitUrlIsLocalNotSsh(gitUrl)) {
    const fileUrlObj = pathToFileURL(gitUrl);
    fileUrlObj.helper = undefined;
    return fileUrlObj;
  }

  // Foreign URL for remote helper
  // See transport_get in transport.c and git-remote-helpers(1)
  const helperParts = /^([A-Za-z0-9][A-Za-z0-9+.-]*)::(.*)$/.exec(gitUrl);
  let helper;
  if (helperParts) {
    [, helper, gitUrl] = helperParts;
  }

  // SCP-like syntax.  Host can be wrapped in [] to disambiguate path.
  // See parse_connect_url and host_end in connect.c
  const scpParts = /^([^@/]+@(?:\[[^]\/]+\]|[^:/]+)):(.*)$/.exec(gitUrl);
  if (scpParts) {
    gitUrl = `ssh://${scpParts[1]}/${scpParts[2]}`;
  }

  const gitUrlObj = new URL(gitUrl);
  gitUrlObj.helper = helper;
  return gitUrlObj;
};

/** Resolve a named commit to its hash.
 *
 * @param {string} commitName Name of commit to resolve.
 * @param {module:child_process.ExecFileOptions=} options Options to pass to
 * {@link child_process.execFile}.
 * @returns {!Promise<string>} Commit hash for <code>commitName</code> or Error
 * if <code>commitName</code> can not be resolved.
 * @private
 */
exports.resolveCommit = function resolveCommit(commitName, options) {
  return execFileOut('git', ['rev-parse', '--verify', commitName], options)
    .then(trim);
};
