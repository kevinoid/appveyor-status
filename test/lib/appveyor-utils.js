/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');

const apiResponses = require('../../test-lib/api-responses');
const appveyorUtils = require('../../lib/appveyor-utils');

describe('appveyorUtils', () => {
  describe('.badgeToStatus', () => {
    ['success', 'failed'].forEach((status) => {
      it(`extracts ${status} status`, () => {
        const badge = apiResponses.getStatusBadge(status);
        const result = appveyorUtils.badgeToStatus(badge);
        assert.strictEqual(result, status);
      });
    });

    it('throws for unrecognized status', () => {
      const badge = apiResponses.getStatusBadge('whatever');
      assert.throws(
        () => { appveyorUtils.badgeToStatus(badge); },
        Error,
      );
    });

    it('throws for ambiguous status', () => {
      const badge = apiResponses.getStatusBadge('success failed');
      assert.throws(
        () => { appveyorUtils.badgeToStatus(badge); },
        Error,
      );
    });

    it('throws for non-string', () => {
      assert.throws(
        () => { appveyorUtils.badgeToStatus(null); },
        Error,
      );
    });
  });

  describe('.projectBuildToStatus', () => {
    it('returns any status of ProjectBuild', () => {
      const testStatus = 'foo';
      const projectBuild = apiResponses.getProjectBuild({ status: testStatus });
      const result = appveyorUtils.projectBuildToStatus(projectBuild);
      assert.strictEqual(result, testStatus);
    });
  });

  describe('.parseAppveyorRepoUrl', () => {
    it('parses bitBucket HTTPS URL', () => {
      const testProject = 'foo/bar';
      const testUrl = `https://bitbucket.org/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'bitBucket',
          repositoryName: testProject,
        },
      );
    });

    it('parses bitBucket SSH URL', () => {
      const testProject = 'foo/bar';
      const testUrl = `git@bitbucket.org:${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'bitBucket',
          repositoryName: testProject,
        },
      );
    });

    it('parses gitHub HTTPS URL', () => {
      const testProject = 'foo/bar';
      const testUrl = `https://github.com/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'gitHub',
          repositoryName: testProject,
        },
      );
    });

    it('parses gitHub SSH URL', () => {
      const testProject = 'foo/bar';
      const testUrl = `git@github.com:${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'gitHub',
          repositoryName: testProject,
        },
      );
    });

    it('parses gitLab HTTPS URL', () => {
      const testProject = 'foo/bar';
      const testUrl = `https://gitlab.com/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'gitLab',
          repositoryName: testProject,
        },
      );
    });

    it('parses gitLab SSH URL', () => {
      const testProject = 'foo/bar';
      const testUrl = `git@gitlab.com:${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'gitLab',
          repositoryName: testProject,
        },
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso project git HTTPS URL', () => {
      const testUrl = 'https://kevinoid.visualstudio.com/_git/TestProj';
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/TestProj',
        },
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso project git SSH URL', () => {
      const testUrl =
        'ssh://kevinoid@kevinoid.visualstudio.com:22/_git/TestProj';
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/TestProj',
        },
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso sub-project git HTTPS URL', () => {
      const testUrl = 'https://kevinoid.visualstudio.com/TestProj/_git/repo2';
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/repo2',
        },
      );
    });

    // FIXME:  Can't be sure this works without paid AppVeyor account
    it('parses vso sub-project git SSH URL', () => {
      const testUrl =
        'ssh://kevinoid@kevinoid.visualstudio.com:22/TestProj/_git/repo2';
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        {
          repositoryType: 'vso',
          repositoryName: 'git/kevinoid/TestProj/repo2',
        },
      );
    });

    it('returns unknown HTTPS URL', () => {
      const testUrl = 'https://example.com/foo.git';
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        { repositoryName: testUrl },
      );
    });

    it('returns unknown SCP-like URL', () => {
      const testUrl = 'user@example.com:foo.git';
      assert.deepStrictEqual(
        appveyorUtils.parseAppveyorRepoUrl(testUrl),
        { repositoryName: testUrl },
      );
    });
  });

  describe('.repoUrlToBadgeParams', () => {
    it('parses bitBucket HTTPS URL', () => {
      const testAccount = 'foo';
      const testProject = 'bar';
      const testUrl =
        `https://bitbucket.org/${testAccount}/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams(testUrl),
        {
          badgeRepoProvider: 'bitBucket',
          repoAccountName: testAccount,
          repoSlug: testProject,
        },
      );
    });

    it('parses bitBucket SSH URL', () => {
      const testAccount = 'foo';
      const testProject = 'bar';
      const testUrl =
        `git@bitbucket.org:${testAccount}/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams(testUrl),
        {
          badgeRepoProvider: 'bitBucket',
          repoAccountName: testAccount,
          repoSlug: testProject,
        },
      );
    });

    // As far as I know this can not happen.  If it can, figure out how to
    // support this.
    it('throws for bitBucket URL with 3 path parts', () => {
      const testUrl = 'https://bitbucket.org/foo/bar/baz.git';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });

    it('parses gitHub HTTPS URL', () => {
      const testAccount = 'foo';
      const testProject = 'bar';
      const testUrl =
        `https://github.com/${testAccount}/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams(testUrl),
        {
          badgeRepoProvider: 'gitHub',
          repoAccountName: testAccount,
          repoSlug: testProject,
        },
      );
    });

    it('parses gitHub SSH URL', () => {
      const testAccount = 'foo';
      const testProject = 'bar';
      const testUrl =
        `git@github.com:${testAccount}/${testProject}.git`;
      assert.deepStrictEqual(
        appveyorUtils.repoUrlToBadgeParams(testUrl),
        {
          badgeRepoProvider: 'gitHub',
          repoAccountName: testAccount,
          repoSlug: testProject,
        },
      );
    });

    // Not supported by AppVeyor
    it('throws for gitLab HTTPS URL', () => {
      const testUrl = 'https://gitlab.com/foo/bar.git';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });

    // Not supported by AppVeyor
    it('throws for gitLab HTTPS URL', () => {
      const testUrl = 'git@gitlab.com:foo/bar.git';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });

    // Not supported by AppVeyor
    it('throws for vso HTTPS URL', () => {
      const testUrl = 'https://kevinoid.visualstudio.com/_git/TestProj';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });

    // Not supported by AppVeyor
    it('throws for vso SSH URL', () => {
      const testUrl =
        'ssh://kevinoid@kevinoid.visualstudio.com:22/_git/TestProj';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });

    it('throws for other git HTTPS URLs', () => {
      const testUrl = 'https://example.com/foo.git';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });

    it('returns unknown git SSH URL', () => {
      const testUrl = 'user@example.com:foo.git';
      assert.throws(
        () => { appveyorUtils.repoUrlToBadgeParams(testUrl); },
        Error,
      );
    });
  });

  describe('.projectFromString', () => {
    it('splits account name and slug to object', () => {
      const accountName = 'foo';
      const slug = 'bar';
      assert.deepStrictEqual(
        appveyorUtils.projectFromString(`${accountName}/${slug}`),
        {
          accountName,
          slug,
        },
      );
    });

    it('throws for string with 1 path part', () => {
      assert.throws(
        () => { appveyorUtils.projectFromString('foo'); },
        Error,
      );
    });

    it('throws for string with 3 path part', () => {
      assert.throws(
        () => { appveyorUtils.projectFromString('foo/bar/baz'); },
        Error,
      );
    });

    it('throws for non-string', () => {
      assert.throws(
        () => { appveyorUtils.projectFromString(null); },
        Error,
      );
    });
  });

  describe('.projectToString', () => {
    it('joins account name and slug', () => {
      const testProj = {
        accountName: 'foo',
        slug: 'bar',
      };
      assert.deepStrictEqual(
        appveyorUtils.projectToString(testProj),
        'foo/bar',
      );
    });
  });
});
