/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const fileUrl = require('file-url');
const { assert } = require('chai');
const path = require('path');
const rimraf = require('rimraf');
const url = require('url');
const util = require('util');

const gitUtils = require('../../lib/git-utils');
const execFileOut = require('../../lib/exec-file-out');

const isWindows = /^win/i.test(process.platform);
const rimrafP = util.promisify(rimraf);

const BRANCH_REMOTES = {
  // Note:  must be origin so ls-remote default is origin for all git versions
  master: 'origin/master',
  branch1: 'remote1/rbranch5',
  branch2: 'remote2/rbranch6',
  branchnoremote: false,
  branchnourl: 'nourl/rbranch2',
  branchnotslug: 'notslug/rbranch3',
};
const REMOTES = {
  notslug: 'foo',
  origin: 'https://github.com/owner/repo',
  remote1: 'git@github.com:owner1/repo1.git',
  remote2: 'https://github.com/owner2/repo2.git',
};
const TAGS = ['tag1'];
/** Path to repository in which tests are run. */
const TEST_REPO_PATH = path.join(__dirname, '..', '..', 'test-repo');

const options = Object.freeze({ cwd: TEST_REPO_PATH });

function neverCalled() {
  throw new Error('should not be called');
}

before('setup test repository', function() {
  // Some git versions can run quite slowly on Windows
  this.timeout(isWindows ? 8000 : 4000);

  return rimrafP(TEST_REPO_PATH)
    .then(() => execFileOut('git', ['init', '-q', TEST_REPO_PATH]))
    // The user name and email must be configured for the later git commands
    // to work.  On Travis CI (and probably others) there is no global config
    .then(() => execFileOut(
      'git',
      ['-C', TEST_REPO_PATH, 'config', 'user.name', 'Test User'],
    ))
    .then(() => execFileOut(
      'git',
      ['-C', TEST_REPO_PATH, 'config', 'user.email', 'test@example.com'],
    ))
    .then(() => execFileOut(
      'git',
      ['-C', TEST_REPO_PATH, 'commit', '-q', '-m', 'Initial Commit',
        '--allow-empty'],
    ))
    .then(() => execFileOut('git', ['-C', TEST_REPO_PATH, 'tag', TAGS[0]]))
    .then(() => execFileOut(
      'git',
      ['-C', TEST_REPO_PATH, 'commit', '-q', '-m', 'Second Commit',
        '--allow-empty'],
    ))
    .then(() => Object.keys(REMOTES).reduce((p, remoteName) => p.then(() => {
      const remoteUrl = REMOTES[remoteName];
      return execFileOut(
        'git',
        ['-C', TEST_REPO_PATH, 'remote', 'add', remoteName, remoteUrl],
      );
    }), Promise.resolve()))
    .then(() => Object.keys(BRANCH_REMOTES)
      .filter((branchName) => branchName !== 'master')
      .reduce((p, branchName) => p.then(() => execFileOut(
        'git',
        ['-C', TEST_REPO_PATH, 'branch', branchName],
      )), Promise.resolve()))
    .then(() => Object.keys(BRANCH_REMOTES)
      .reduce((p, branchName) => p.then(() => {
        const upstream = BRANCH_REMOTES[branchName];
        if (!upstream) {
          return p;
        }
        // Note:  Can't use 'git branch -u' without fetching remote
        const upstreamParts = upstream.split('/');
        assert.strictEqual(upstreamParts.length, 2);
        const remoteName = upstreamParts[0];
        const remoteBranch = upstreamParts[1];
        const remoteRef = `refs/heads/${remoteBranch}`;
        const configBranch = `branch.${branchName}`;
        const configMerge = `${configBranch}.merge`;
        const configRemote = `${configBranch}.remote`;
        return execFileOut(
          'git',
          ['-C', TEST_REPO_PATH, 'config', '--add', configRemote, remoteName],
        )
          .then(() => execFileOut(
            'git',
            ['-C', TEST_REPO_PATH,
              'config', '--add', configMerge, remoteRef],
          ));
      }), Promise.resolve()));
});

after('remove test repository', () => rimrafP(TEST_REPO_PATH));

function checkoutMaster() {
  return execFileOut('git', ['checkout', '-q', 'master'], options);
}

describe('gitUtils', () => {
  describe('.getBranch', () => {
    after(checkoutMaster);

    it('resolves master on master', () => gitUtils.getBranch(options)
      .then((branch) => {
        assert.strictEqual(branch, 'master');
      }));

    it('resolves branch1 on branch1',
      () => execFileOut('git', ['checkout', '-q', 'branch1'], options)
        .then(() => gitUtils.getBranch(options))
        .then((branch) => {
          assert.strictEqual(branch, 'branch1');
        }));

    it('rejects with Error not on branch',
      () => execFileOut('git', ['checkout', '-q', 'HEAD^'], options)
        .then(() => gitUtils.getBranch(options))
        .then(
          neverCalled,
          (err) => {
            assert.instanceOf(err, Error);
            assert.match(err.message, /branch/i);
          },
        ));
  });

  describe('.getRemote', () => {
    after(checkoutMaster);

    Object.keys(BRANCH_REMOTES).forEach((branch) => {
      const remoteRef = BRANCH_REMOTES[branch];
      if (!remoteRef) {
        return;
      }
      const remote = remoteRef.split('/')[0];
      it(`resolves ${branch} to ${remote}`,
        () => gitUtils.getRemote(branch, options).then((result) => {
          assert.strictEqual(result, remote);
        }));
    });

    it('rejects branch without remote with Error',
      () => gitUtils.getRemote('branchnoremote', options).then(
        neverCalled,
        (err) => {
          assert.instanceOf(err, Error);
        },
      ));
  });

  describe('.getRemoteUrl', () => {
    Object.keys(REMOTES).forEach((remoteName) => {
      const remoteUrl = REMOTES[remoteName];
      it(`resolves ${remoteName} to ${remoteUrl}`,
        () => gitUtils.getRemoteUrl(remoteName, options)
          .then((resultUrl) => {
            assert.strictEqual(resultUrl, remoteUrl);
          }));
    });

    it('rejects invalid remote with Error',
      () => gitUtils.getRemoteUrl('invalidremote', options).then(
        neverCalled,
        (err) => {
          assert.instanceOf(err, Error);
        },
      ));

    it('uses ls-remote default for unspecified remote',
      () => gitUtils.getRemoteUrl(null, options)
        .then((resultUrl) => {
          assert.strictEqual(resultUrl, REMOTES.origin);
        }));
  });

  describe('.gitUrlIsLocalNotSsh', () => {
    [
      { url: '.', result: true },
      { url: '/foo/bar', result: true },
      { url: 'http://example.com', result: false },
      { url: 'git://example.com', result: false },
      { url: 'git@example.com:foo', result: false },
      { url: 'file:///foo/bar', result: false },
      { url: '/foo:bar', result: true },
      { url: 'foo:bar', result: false },
    ].forEach((testCase) => {
      it(`${testCase.url} is ${testCase.result}`, () => {
        assert.strictEqual(
          gitUtils.gitUrlIsLocalNotSsh(testCase.url),
          testCase.result,
        );
      });
    });

    const drivePath = 'C:/foo';
    if (isWindows) {
      it(`${drivePath} is true on Windows`, () => {
        assert.strictEqual(
          gitUtils.gitUrlIsLocalNotSsh(drivePath),
          true,
        );
      });
    } else {
      it(`${drivePath} is false on non-Windows`, () => {
        assert.strictEqual(
          gitUtils.gitUrlIsLocalNotSsh(drivePath),
          false,
        );
      });
    }
  });

  describe('.parseGitUrl', () => {
    it('parses http: like url module', () => {
      const testUrl = 'http://user@example.com/foo/bar';
      assert.deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        Object.assign(url.parse(testUrl), { helper: undefined }),
      );
    });

    it('parses git: like url module', () => {
      const testUrl = 'git://user@example.com/foo/bar';
      assert.deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        Object.assign(url.parse(testUrl), { helper: undefined }),
      );
    });

    it('parses SCP-like URL like ssh: URL', () => {
      const testUrl = 'user@example.com:foo/bar.git';
      assert.deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        Object.assign(
          url.parse('ssh://user@example.com/foo/bar.git'),
          { helper: undefined },
        ),
      );
    });

    it('parses absolute path like file:// URL', () => {
      const testPath = path.resolve(path.join('foo', 'bar'));
      assert.deepStrictEqual(
        gitUtils.parseGitUrl(testPath),
        Object.assign(url.parse(fileUrl(testPath)), { helper: undefined }),
      );
    });

    it('parses relative path like file:// URL', () => {
      const testPath = path.join('foo', 'bar');
      assert.deepStrictEqual(
        gitUtils.parseGitUrl(testPath),
        Object.assign(url.parse(fileUrl(testPath)), { helper: undefined }),
      );
    });

    if (isWindows) {
      it('parses Windows path like file:// URL on Windows', () => {
        assert.deepStrictEqual(
          gitUtils.parseGitUrl('C:\\foo\\bar'),
          Object.assign(url.parse('file:///C:/foo/bar'), { helper: undefined }),
        );
      });
    } else {
      it('parses Windows path like URL on non-Windows', () => {
        const testPath = 'C:\\foo\\bar';
        assert.deepStrictEqual(
          gitUtils.parseGitUrl(testPath),
          Object.assign(url.parse(testPath), { helper: undefined }),
        );
      });
    }

    it('adds helper property for transport helper', () => {
      const testUrl = 'myhelper::user@example.com:foo/bar.git';
      assert.deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        Object.assign(
          url.parse('ssh://user@example.com/foo/bar.git'),
          { helper: 'myhelper' },
        ),
      );
    });
  });

  describe('.resolveCommit', () => {
    let headHash;
    it('can resolve the hash of HEAD',
      () => gitUtils.resolveCommit('HEAD', options).then((hash) => {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
        headHash = hash;
      }));

    it('can resolve a hash to itself',
      () => gitUtils.resolveCommit(headHash, options).then((hash) => {
        assert.strictEqual(hash, headHash);
      }));

    it('can resolve branch name to commit hash', () => {
      const branchName = Object.keys(BRANCH_REMOTES)[0];
      return gitUtils.resolveCommit(branchName, options).then((hash) => {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
      });
    });

    it('can resolve tag name to commit hash',
      () => gitUtils.resolveCommit(TAGS[0], options).then((hash) => {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
      }));

    it('rejects with Error for unresolvable name',
      () => gitUtils.resolveCommit('notabranch', options).then(
        neverCalled,
        (err) => {
          assert(err instanceof Error);
        },
      ));
  });
});
