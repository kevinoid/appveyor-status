/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var execFileOut = require('../../lib/exec-file-out');
var fileUrl = require('file-url');
var gitUtils = require('../../lib/git-utils');
var assert = require('chai').assert;
var assign = require('object-assign');
var path = require('path');
var pify = require('pify');
var rimraf = require('rimraf');
var url = require('url');

var deepStrictEqual = assert.deepStrictEqual || assert.deepEqual;
var isWindows = /^win/i.test(process.platform);
var rimrafP = pify(rimraf);

var BRANCH_REMOTES = {
  // Note:  must be origin so ls-remote default is origin for all git versions
  master: 'origin/master',
  branch1: 'remote1/rbranch5',
  branch2: 'remote2/rbranch6',
  branchnoremote: false,
  branchnourl: 'nourl/rbranch2',
  branchnotslug: 'notslug/rbranch3'
};
var REMOTES = {
  notslug: 'foo',
  origin: 'https://github.com/owner/repo',
  remote1: 'git@github.com:owner1/repo1.git',
  remote2: 'https://github.com/owner2/repo2.git'
};
var TAGS = ['tag1'];
/** Path to repository in which tests are run. */
var TEST_REPO_PATH = path.join(__dirname, '..', '..', 'test-repo');

var options = Object.freeze({cwd: TEST_REPO_PATH});

function neverCalled() {
  throw new Error('should not be called');
}

before('setup test repository', function() {
  return rimrafP(TEST_REPO_PATH)
    .then(function createTestRepo() {
      return execFileOut('git', ['init', '-q', TEST_REPO_PATH]);
    })
    // The user name and email must be configured for the later git commands
    // to work.  On Travis CI (and probably others) there is no global config
    .then(function getConfigName() {
      return execFileOut(
        'git',
        ['-C', TEST_REPO_PATH, 'config', 'user.name', 'Test User']
      );
    })
    .then(function getConfigEmail() {
      return execFileOut(
        'git',
        ['-C', TEST_REPO_PATH, 'config', 'user.email', 'test@example.com']
      );
    })
    .then(function createCommit1() {
      return execFileOut(
        'git',
        ['-C', TEST_REPO_PATH, 'commit', '-q', '-m', 'Initial Commit',
          '--allow-empty']
      );
    })
    .then(function makeTag() {
      return execFileOut('git', ['-C', TEST_REPO_PATH, 'tag', TAGS[0]]);
    })
    .then(function createCommit2() {
      return execFileOut(
        'git',
        ['-C', TEST_REPO_PATH, 'commit', '-q', '-m', 'Second Commit',
          '--allow-empty']
      );
    })
    .then(function makeRemotes() {
      return Object.keys(REMOTES).reduce(function(p, remoteName) {
        return p.then(function() {
          var remoteUrl = REMOTES[remoteName];
          return execFileOut(
            'git',
            ['-C', TEST_REPO_PATH, 'remote', 'add', remoteName, remoteUrl]
          );
        });
      }, Promise.resolve());
    })
    .then(function makeBranches() {
      return Object.keys(BRANCH_REMOTES)
        .filter(function(branchName) { return branchName !== 'master'; })
        .reduce(function(p, branchName) {
          return p.then(function() {
            return execFileOut(
              'git',
              ['-C', TEST_REPO_PATH, 'branch', branchName]
            );
          });
        }, Promise.resolve());
    })
    .then(function setBranchRemotes() {
      return Object.keys(BRANCH_REMOTES).reduce(function(p, branchName) {
        return p.then(function() {
          var upstream = BRANCH_REMOTES[branchName];
          if (!upstream) {
            return p;
          }
          // Note:  Can't use 'git branch -u' without fetching remote
          var upstreamParts = upstream.split('/');
          assert.strictEqual(upstreamParts.length, 2);
          var remoteName = upstreamParts[0];
          var remoteBranch = upstreamParts[1];
          var remoteRef = 'refs/heads/' + remoteBranch;
          var configBranch = 'branch.' + branchName;
          var configMerge = configBranch + '.merge';
          var configRemote = configBranch + '.remote';
          return execFileOut(
            'git',
            ['-C', TEST_REPO_PATH, 'config', '--add', configRemote, remoteName]
          )
            .then(function() {
              return execFileOut(
                'git',
                ['-C', TEST_REPO_PATH,
                  'config', '--add', configMerge, remoteRef]
              );
            });
        });
      }, Promise.resolve());
    });
});

after('remove test repository', function() {
  return rimrafP(TEST_REPO_PATH);
});

function checkoutMaster() {
  return execFileOut('git', ['checkout', '-q', 'master'], options);
}

describe('gitUtils', function() {
  describe('.getBranch', function() {
    after(checkoutMaster);

    it('resolves master on master', function() {
      return gitUtils.getBranch(options).then(function(branch) {
        assert.strictEqual(branch, 'master');
      });
    });

    it('resolves branch1 on branch1', function() {
      return execFileOut('git', ['checkout', '-q', 'branch1'], options)
        .then(function() {
          return gitUtils.getBranch(options);
        })
        .then(function(branch) {
          assert.strictEqual(branch, 'branch1');
        });
    });

    it('rejects with Error not on branch', function() {
      return execFileOut('git', ['checkout', '-q', 'HEAD^'], options)
        .then(function runDetect() {
          return gitUtils.getBranch(options);
        })
        .then(
          neverCalled,
          function checkErr(err) {
            assert.instanceOf(err, Error);
            assert.match(err.message, /branch/i);
          }
        );
    });
  });

  describe('.getRemote', function() {
    after(checkoutMaster);

    Object.keys(BRANCH_REMOTES).forEach(function(branch) {
      var remoteRef = BRANCH_REMOTES[branch];
      if (!remoteRef) {
        return;
      }
      var remote = remoteRef.split('/')[0];
      it('resolves ' + branch + ' to ' + remote, function() {
        return gitUtils.getRemote(branch, options).then(function(result) {
          assert.strictEqual(result, remote);
        });
      });
    });

    it('rejects branch without remote with Error', function() {
      return gitUtils.getRemote('branchnoremote', options).then(
        neverCalled,
        function(err) {
          assert.instanceOf(err, Error);
        }
      );
    });
  });

  describe('.getRemoteUrl', function() {
    Object.keys(REMOTES).forEach(function(remoteName) {
      var remoteUrl = REMOTES[remoteName];
      it('resolves ' + remoteName + ' to ' + remoteUrl, function() {
        return gitUtils.getRemoteUrl(remoteName, options)
          .then(function(resultUrl) {
            assert.strictEqual(resultUrl, remoteUrl);
          });
      });
    });

    it('rejects invalid remote with Error', function() {
      return gitUtils.getRemoteUrl('invalidremote', options).then(
        neverCalled,
        function(err) {
          assert.instanceOf(err, Error);
        }
      );
    });

    it('uses ls-remote default for unspecified remote', function() {
      return gitUtils.getRemoteUrl(null, options)
        .then(function(resultUrl) {
          assert.strictEqual(resultUrl, REMOTES.origin);
        });
    });
  });

  describe('.gitUrlIsLocalNotSsh', function() {
    [
      {url: '.', result: true},
      {url: '/foo/bar', result: true},
      {url: 'http://example.com', result: false},
      {url: 'git://example.com', result: false},
      {url: 'git@example.com:foo', result: false},
      {url: 'file:///foo/bar', result: false},
      {url: '/foo:bar', result: true},
      {url: 'foo:bar', result: false}
    ].forEach(function(testCase) {
      it(testCase.url + ' is ' + testCase.result, function() {
        assert.strictEqual(
          gitUtils.gitUrlIsLocalNotSsh(testCase.url),
          testCase.result
        );
      });
    });

    var drivePath = 'C:/foo';
    if (isWindows) {
      it(drivePath + ' is true on Windows', function() {
        assert.strictEqual(
          gitUtils.gitUrlIsLocalNotSsh(drivePath),
          true
        );
      });
    } else {
      it(drivePath + ' is false on non-Windows', function() {
        assert.strictEqual(
          gitUtils.gitUrlIsLocalNotSsh(drivePath),
          false
        );
      });
    }
  });

  describe('.parseGitUrl', function() {
    it('parses http: like url module', function() {
      var testUrl = 'http://user@example.com/foo/bar';
      deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        assign(url.parse(testUrl), {helper: undefined})
      );
    });

    it('parses git: like url module', function() {
      var testUrl = 'git://user@example.com/foo/bar';
      deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        assign(url.parse(testUrl), {helper: undefined})
      );
    });

    it('parses SCP-like URL like ssh: URL', function() {
      var testUrl = 'user@example.com:foo/bar.git';
      deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        assign(
          url.parse('ssh://user@example.com/foo/bar.git'),
          {helper: undefined}
        )
      );
    });

    it('parses absolute path like file:// URL', function() {
      var testPath = path.resolve(path.join('foo', 'bar'));
      deepStrictEqual(
        gitUtils.parseGitUrl(testPath),
        assign(url.parse(fileUrl(testPath)), {helper: undefined})
      );
    });

    it('parses relative path like file:// URL', function() {
      var testPath = path.join('foo', 'bar');
      deepStrictEqual(
        gitUtils.parseGitUrl(testPath),
        assign(url.parse(fileUrl(testPath)), {helper: undefined})
      );
    });

    if (isWindows) {
      it('parses Windows path like file:// URL on Windows', function() {
        deepStrictEqual(
          gitUtils.parseGitUrl('C:\\foo\\bar'),
          assign(url.parse('file:///C:/foo/bar'), {helper: undefined})
        );
      });
    } else {
      it('parses Windows path like URL on non-Windows', function() {
        var testPath = 'C:\\foo\\bar';
        deepStrictEqual(
          gitUtils.parseGitUrl(testPath),
          assign(url.parse(testPath), {helper: undefined})
        );
      });
    }

    it('adds helper property for transport helper', function() {
      var testUrl = 'myhelper::user@example.com:foo/bar.git';
      deepStrictEqual(
        gitUtils.parseGitUrl(testUrl),
        assign(
          url.parse('ssh://user@example.com/foo/bar.git'),
          {helper: 'myhelper'}
        )
      );
    });
  });

  describe('.resolveCommit', function() {
    var headHash;
    it('can resolve the hash of HEAD', function() {
      return gitUtils.resolveCommit('HEAD', options).then(function(hash) {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
        headHash = hash;
      });
    });

    it('can resolve a hash to itself', function() {
      return gitUtils.resolveCommit(headHash, options).then(function(hash) {
        assert.strictEqual(hash, headHash);
      });
    });

    it('can resolve branch name to commit hash', function() {
      var branchName = Object.keys(BRANCH_REMOTES)[0];
      return gitUtils.resolveCommit(branchName, options).then(function(hash) {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
      });
    });

    it('can resolve tag name to commit hash', function() {
      return gitUtils.resolveCommit(TAGS[0], options).then(function(hash) {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
      });
    });

    it('rejects with Error for unresolvable name', function() {
      return gitUtils.resolveCommit('notabranch', options).then(
        neverCalled,
        function(err) {
          assert(err instanceof Error);
        }
      );
    });
  });
});
