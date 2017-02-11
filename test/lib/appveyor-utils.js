/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var apiResponses = require('../../test-lib/api-responses');
var appveyorUtils = require('../../lib/appveyor-utils');
var assert = require('assert');

var deepStrictEqual = assert.deepStrictEqual || assert.deepEqual;

describe('appveyorUtils', function() {
  describe('.badgeToStatus', function() {
    ['success', 'failed'].forEach(function(status) {
      it('extracts ' + status + ' status', function() {
        var badge = apiResponses.getStatusBadge(status);
        var result = appveyorUtils.badgeToStatus(badge);
        assert.strictEqual(result, status);
      });
    });

    it('throws for unrecognized status', function() {
      var badge = apiResponses.getStatusBadge('whatever');
      assert.throws(
        function() { appveyorUtils.badgeToStatus(badge); },
        Error
      );
    });

    it('throws for ambiguous status', function() {
      var badge = apiResponses.getStatusBadge('success failed');
      assert.throws(
        function() { appveyorUtils.badgeToStatus(badge); },
        Error
      );
    });

    it('throws for non-string', function() {
      assert.throws(
        function() { appveyorUtils.badgeToStatus(null); },
        Error
      );
    });
  });

  describe('.projectBuildToStatus', function() {
    it('returns any status of ProjectBuild', function() {
      var testStatus = 'foo';
      var projectBuild = apiResponses.getProjectBuild({status: testStatus});
      var result = appveyorUtils.projectBuildToStatus(projectBuild);
      assert.strictEqual(result, testStatus);
    });
  });

  describe('.parseAppveyorRepoUrl', function() {
    ['mercurial', 'subversion'].forEach(function(testScm) {
      it('returns ' + testScm + ' URL as-is', function() {
        var testUrl = 'foo';
        deepStrictEqual(
          appveyorUtils.parseAppveyorRepoUrl(testScm, testUrl),
          {
            repositoryScm: testScm,
            repositoryType: testScm,
            repositoryName: testUrl
          }
        );
      });
    });

    it('parses bitBucket HTTPS URL', function() {
      var testProject = 'foo/bar';
      var testUrl = 'https://bitbucket.org/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'bitBucket',
          repositoryName: testProject
        }
      );
    });

    it('parses bitBucket SSH URL', function() {
      var testProject = 'foo/bar';
      var testUrl = 'git@bitbucket.org:' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'bitBucket',
          repositoryName: testProject
        }
      );
    });

    it('parses gitHub HTTPS URL', function() {
      var testProject = 'foo/bar';
      var testUrl = 'https://github.com/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'gitHub',
          repositoryName: testProject
        }
      );
    });

    it('parses gitHub SSH URL', function() {
      var testProject = 'foo/bar';
      var testUrl = 'git@github.com:' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'gitHub',
          repositoryName: testProject
        }
      );
    });

    it('parses gitLab HTTPS URL', function() {
      var testProject = 'foo/bar';
      var testUrl = 'https://gitlab.com/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'gitLab',
          repositoryName: testProject
        }
      );
    });

    it('parses gitLab SSH URL', function() {
      var testProject = 'foo/bar';
      var testUrl = 'git@gitlab.com:' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'gitLab',
          repositoryName: testProject
        }
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso project git HTTPS URL', function() {
      var testUrl = 'https://kevinoid.visualstudio.com/_git/TestProj';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/TestProj'
        }
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso project git SSH URL', function() {
      var testUrl = 'ssh://kevinoid@kevinoid.visualstudio.com:22/_git/TestProj';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/TestProj'
        }
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso sub-project git HTTPS URL', function() {
      var testUrl = 'https://kevinoid.visualstudio.com/TestProj/_git/repo2';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/repo2'
        }
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso sub-project git SSH URL', function() {
      var testUrl =
        'ssh://kevinoid@kevinoid.visualstudio.com:22/TestProj/_git/repo2';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/repo2'
        }
      );
    });

    it('returns unknown git HTTPS URL', function() {
      var testUrl = 'https://example.com/foo.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'git',
          repositoryName: testUrl
        }
      );
    });

    it('returns unknown git SSH URL', function() {
      var testUrl = 'user@example.com:foo.git';
      deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl('git', testUrl),
        {
          repositoryScm: 'git',
          repositoryType: 'git',
          repositoryName: testUrl
        }
      );
    });
  });

  describe('.repoUrlToBadgeParams', function() {
    ['mercurial', 'subversion'].forEach(function(testScm) {
      it('throws Error for ' + testScm + ' scm', function() {
        var testUrl = 'foo';
        assert.throws(
          function() { appveyorUtils.repoUrlToBadgeParams(testScm, testUrl); },
          Error
        );
      });
    });

    it('parses bitBucket HTTPS URL', function() {
      var testAccount = 'foo';
      var testProject = 'bar';
      var testUrl =
        'https://bitbucket.org/' + testAccount + '/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams('git', testUrl),
        {
          badgeRepoProvider: 'bitBucket',
          repoAccountName: testAccount,
          repoSlug: testProject
        }
      );
    });

    it('parses bitBucket SSH URL', function() {
      var testAccount = 'foo';
      var testProject = 'bar';
      var testUrl =
        'git@bitbucket.org:' + testAccount + '/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams('git', testUrl),
        {
          badgeRepoProvider: 'bitBucket',
          repoAccountName: testAccount,
          repoSlug: testProject
        }
      );
    });

    // As far as I know this can not happen.  If it can, figure out how to
    // support this.
    it('throws for bitBucket URL with 3 path parts', function() {
      var testUrl = 'https://bitbucket.org/foo/bar/baz.git';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });

    it('parses gitHub HTTPS URL', function() {
      var testAccount = 'foo';
      var testProject = 'bar';
      var testUrl =
        'https://github.com/' + testAccount + '/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams('git', testUrl),
        {
          badgeRepoProvider: 'gitHub',
          repoAccountName: testAccount,
          repoSlug: testProject
        }
      );
    });

    it('parses gitHub SSH URL', function() {
      var testAccount = 'foo';
      var testProject = 'bar';
      var testUrl =
        'git@github.com:' + testAccount + '/' + testProject + '.git';
      deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams('git', testUrl),
        {
          badgeRepoProvider: 'gitHub',
          repoAccountName: testAccount,
          repoSlug: testProject
        }
      );
    });

    // Not supported by AppVeyor
    it('throws for gitLab HTTPS URL', function() {
      var testUrl = 'https://gitlab.com/foo/bar.git';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });

    // Not supported by AppVeyor
    it('throws for gitLab HTTPS URL', function() {
      var testUrl = 'git@gitlab.com:foo/bar.git';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });

    // Not supported by AppVeyor
    it('throws for vso HTTPS URL', function() {
      var testUrl = 'https://kevinoid.visualstudio.com/_git/TestProj';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });

    // Not supported by AppVeyor
    it('throws for vso SSH URL', function() {
      var testUrl = 'ssh://kevinoid@kevinoid.visualstudio.com:22/_git/TestProj';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });

    it('throws for other git HTTPS URLs', function() {
      var testUrl = 'https://example.com/foo.git';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });

    it('returns unknown git SSH URL', function() {
      var testUrl = 'user@example.com:foo.git';
      assert.throws(
        function() { appveyorUtils.repoUrlToBadgeParams('git', testUrl); },
        Error
      );
    });
  });

  describe('.projectFromString', function() {
    it('splits account name and slug to object', function() {
      var accountName = 'foo';
      var slug = 'bar';
      deepStrictEqual(
        appveyorUtils.projectFromString(accountName + '/' + slug),
        {
          accountName: accountName,
          slug: slug
        }
      );
    });

    it('throws for string with 1 path part', function() {
      assert.throws(
        function() { appveyorUtils.projectFromString('foo'); },
        Error
      );
    });

    it('throws for string with 3 path part', function() {
      assert.throws(
        function() { appveyorUtils.projectFromString('foo/bar/baz'); },
        Error
      );
    });

    it('throws for non-string', function() {
      assert.throws(
        function() { appveyorUtils.projectFromString(null); },
        Error
      );
    });
  });

  describe('.projectToString', function() {
    it('joins account name and slug', function() {
      var testProj = {
        accountName: 'foo',
        slug: 'bar'
      };
      deepStrictEqual(
        appveyorUtils.projectToString(testProj),
        'foo/bar'
      );
    });
  });
});
