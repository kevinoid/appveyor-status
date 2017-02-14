/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var AmbiguousProjectError = require('../lib/ambiguous-project-error');
var SwaggerClient = require('swagger-client');
var apiResponses = require('../test-lib/api-responses');
var appveyorStatus = require('..');
var appveyorSwagger = require('appveyor-swagger');
var appveyorUtils = require('../lib/appveyor-utils');
var assert = require('chai').assert;
var gitUtils = require('../lib/git-utils');
var nock = require('nock');
var sinon = require('sinon');
var stream = require('stream');
var url = require('url');

require('sinon-as-promised');

var apiUrl = url.format({
  protocol: appveyorSwagger.schemes[0],
  host: appveyorSwagger.host
});
var badgeToStatus = appveyorUtils.badgeToStatus;
var match = sinon.match;
var projectBuildToStatus = appveyorUtils.projectBuildToStatus;

describe('appveyorStatus', function() {
  // Ensure that expectations are not carried over between tests
  var gitUtilsMock;
  beforeEach(function() {
    gitUtilsMock = sinon.mock(gitUtils);
  });
  afterEach(function() {
    gitUtilsMock.restore();
    gitUtilsMock = null;
  });

  // Ensure all requests are mocked and are not carried over between tests
  before(function() {
    nock.disableNetConnect();
  });
  after(function() {
    nock.enableNetConnect();
    nock.restore();
  });
  afterEach(function() {
    nock.cleanAll();
  });

  // Test options object with standard streams for convenience
  var options;
  beforeEach(function() {
    options = {
      err: new stream.PassThrough()
    };
  });

  var matchOptionsCwd = match({
    cwd: match.same(undefined).or(match.same(null)).or(match.same('.'))
  });

  describe('.getLastBuild', function() {
    it('queries last build for options.project', function() {
      var testProject = 'foo/bar';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('queries last build for project with named branch', function() {
      var testBranch = 'testb';
      var testProject = 'foo/bar';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject + '/branch/' + testBranch)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.branch = testBranch;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('queries last build for named branch by remote', function() {
      var testBranch = 'testb';
      var testRemote = 'testr';
      var testRemoteUrl = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            branch: testBranch,
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      options.branch = testBranch;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('queries non-last build for named branch by remote', function() {
      var testBranch = 'testb';
      var testProject = ['foo', 'bar'];
      var testRemote = 'testr';
      var testRemoteUrl = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            accountName: testProject[0],
            branch: testBranch + '5',
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            slug: testProject[1],
            status: testStatus
          })
        ])
        .get('/api/projects/' + testProject.join('/') + '/branch/' + testBranch)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          branch: testBranch,
          repositoryType: 'git',
          repositoryName: testRemoteUrl,
          status: testStatus
        }));
      options.branch = testBranch;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('uses commit hash without resolving', function() {
      var testCommit = 'adc83b19e793491b1c6ea0fd8b46cd9f32e592a1';
      var testProject = 'foo/bar';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          commitId: testCommit,
          status: testStatus
        }));
      options.commit = testCommit;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('rejects with CommitMismatchError if commit does not match', function() {
      var testCommit = 'testtag';
      var testProject = 'foo/bar';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit')
        .once().withArgs(testCommit, matchOptionsCwd).resolves('abcde');
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          commitId: '12345',
          status: testStatus
        }));
      options.commit = testCommit;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.strictEqual(err.name, 'CommitMismatchError');
          ne.done();
        });
    });

    it('returns queued status as-is without wait', function() {
      var testProject = 'foo/bar';
      var testStatus = 'queued';
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    describe('with wait', function() {
      var clock;
      beforeEach(function() {
        // No need to mock setImmediate, which is used in this file.
        clock = sinon.useFakeTimers(
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'Date'
        );
      });
      afterEach(function() {
        clock.restore();
      });

      /** Runs a function after the first mocked request has completed.
       *
       * Because of intermediate Promises, setTimeout will not have been
       * called when getLastBuild returns.  It is further complicated by
       * gratuitous use of setTimeout by SwaggerClient
       * https://github.com/swagger-api/swagger-js/blob/v2.1.32/lib/client.js#L264-L266
       * and by use of setImmediate in nock.  This function is a workaround.
       */
      function afterFirstRequest(cb) {
        // Wait for any Promises to resolve
        setImmediate(function() {
          // SwaggerClient constructor has been called.
          // Tick for SwaggerClient.buildFromSpec.
          clock.tick(10);
          // Wait for Promises to resolve
          setImmediate(function() {
            // First (mocked) request has been made.
            // Wait for response to propagate and callback to be called.
            setImmediate(function() {
              // Still propagating...
              setImmediate(cb);
            });
          });
        });
      }

      it('true retries queued status', function() {
        var testProject = 'foo/bar';
        var testStatus = 'success';
        var expectQueued = nock(apiUrl)
          .get('/api/projects/' + testProject)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));
        var expectSuccess = nock(apiUrl)
          .get('/api/projects/' + testProject)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: testStatus}));

        var retriesDone = false;
        afterFirstRequest(function() {
          assert(expectQueued.isDone(), 'First call is made immediately.');
          assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

          clock.tick(900);
          assert(!expectSuccess.isDone(), 'Retry is not done less than 1 sec.');

          clock.tick(60000);
          assert(expectSuccess.isDone(), 'Retry is done less than 1 minute.');
          retriesDone = true;
        });

        options.project = testProject;
        options.wait = true;
        return appveyorStatus.getLastBuild(options)
          .then(function(projectBuild) {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert(retriesDone, 'Retries completed');
          });
      });

      it('true retries queued status from project', function() {
        var testProjectParts = ['foo', 'bar'];
        var testRepoUrl = 'git://foo.bar/baz';
        var testStatus = 'success';
        var expectQueued = nock(apiUrl)
          .get('/api/projects')
          .query(true)
          .reply(200, [
            apiResponses.getProject({
              accountName: testProjectParts[0],
              repositoryType: 'git',
              repositoryName: testRepoUrl,
              slug: testProjectParts[1],
              status: 'queued'
            })
          ]);
        var expectSuccess = nock(apiUrl)
          .get('/api/projects/' + testProjectParts.join('/'))
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: testStatus}));

        var retriesDone = false;
        afterFirstRequest(function() {
          assert(expectQueued.isDone(), 'First call is made immediately.');
          assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

          clock.tick(900);
          assert(!expectSuccess.isDone(), 'Retry is not done less than 1 sec.');

          clock.tick(60000);
          assert(expectSuccess.isDone(), 'Retry is done less than 1 minute.');
          retriesDone = true;
        });

        options.repo = testRepoUrl;
        options.wait = true;
        return appveyorStatus.getLastBuild(options)
          .then(function(projectBuild) {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert(retriesDone, 'Retries completed');
          });
      });

      it('is stopped on error', function() {
        var testErrMsg = 'something bad';
        var testProject = 'foo/bar';
        var expectQueued = nock(apiUrl)
          .get('/api/projects/' + testProject)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));
        var expectSuccess = nock(apiUrl)
          .get('/api/projects/' + testProject)
          .query(true)
          .replyWithError(testErrMsg);

        var retriesDone = false;
        afterFirstRequest(function() {
          assert(expectQueued.isDone(), 'First call is made immediately.');
          assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

          clock.tick(900);
          assert(!expectSuccess.isDone(), 'Retry is not done less than 1 sec.');

          clock.tick(60000);
          assert(expectSuccess.isDone(), 'Retry is done less than 1 minute.');
          retriesDone = true;
        });

        options.project = testProject;
        options.wait = true;
        return appveyorStatus.getLastBuild(options).then(
          sinon.mock().never(),
          function(err) {
            assert.include(err.message, testErrMsg);
            assert(retriesDone, 'Retries completed');
          }
        );
      });
    });

    it('queries repo in cwd by default', function() {
      var testBranch = 'testb';
      var testRemote = 'testr';
      var testRemoteUrl = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      var ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('resolves branch, commit, and remote URL in local repo', function() {
      var testBranch = 'testb';
      var testCommit = 'testtag';
      var testCommitHash = '4b482f89ef23e06ad6a9c01adaece30943bf434c';
      var testRemote = 'testr';
      var testRemoteUrl = 'git://foo.bar/baz';
      var testRepo = 'foo/bar';
      var testStatus = 'success';
      var matchRepoCwd = match({cwd: testRepo});
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchRepoCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchRepoCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchRepoCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit')
        .once().withArgs(testCommit, matchRepoCwd).resolves(testCommitHash);
      var ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            branch: testBranch,
            commitId: testCommitHash,
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      options.branch = true;
      options.commit = testCommit;
      options.repo = testRepo;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('falls back to origin if not on a branch', function() {
      var testRemoteUrl = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).rejects(new Error());
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs('origin', matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(options.err.read(), null);
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('falls back to origin if branch has no remote', function() {
      var testBranch = 'testb';
      var testRemoteUrl = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).rejects(new Error());
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs('origin', matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      options.verbosity = 1;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          var errStr = String(options.err.read());
          assert.match(errStr, /\bremote\b/i);
          assert.match(errStr, /\borigin\b/i);
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('rejects with Error if no project matches repo', function() {
      var testRepo = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRepo + '/quux',
            status: testStatus
          })
        ]);
      options.repo = testRepo;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, Error);
          assert.include(err.message, testRepo);
          ne.done();
        }
      );
    });

    it('AmbiguousProjectError if multiple projects match repo', function() {
      var testProject1 = ['myacct', 'proj1'];
      var testProject2 = ['youracct', 'proj2'];
      var testRepo = 'git://foo.bar/baz';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            accountName: testProject1[0],
            repositoryType: 'git',
            repositoryName: testRepo,
            slug: testProject1[1],
            status: testStatus
          }),
          apiResponses.getProject({
            accountName: testProject2[0],
            repositoryType: 'git',
            repositoryName: testRepo,
            slug: testProject2[1],
            status: testStatus
          })
        ]);
      options.repo = testRepo;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, AmbiguousProjectError);
          assert.deepEqual(
            err.projects,
            [testProject1.join('/'), testProject2.join('/')]
          );
          ne.done();
        }
      );
    });

    it('rejects with Error for non-200 responses', function() {
      var testErrMsg = 'bad dead bodies';
      var testProject = 'foo/bar';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .reply(400, {message: testErrMsg});
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.include(err.message, '400');
          assert.include(err.message, testErrMsg);
          ne.done();
        }
      );
    });

    it('rejects with Error for non-JSON responses', function() {
      var testProject = 'foo/bar';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .reply(200, 'invalid', {'Content-Type': 'text/plain'});
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.include(err.message, 'JSON');
          ne.done();
        }
      );
    });

    it('rejects with Error for request error', function() {
      var testErrMsg = 'something bad happened';
      var testProject = 'foo/bar';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .query(true)
        .replyWithError(testErrMsg);
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.include(err.message, testErrMsg);
          ne.done();
        }
      );
    });

    it('passes options.token as bearer token', function() {
      var testRepo = 'git://foo.bar/baz';
      var testStatus = 'success';
      var testToken = 'testtoken';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .matchHeader('Authorization', 'Bearer ' + testToken)
        // IMPORTANT: Must be path which requires auth
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRepo,
            status: testStatus
          })
        ]);
      options.repo = testRepo;
      options.token = testToken;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('ignores options.token when appveyorClient is given', function() {
      var testRepo = 'git://foo.bar/baz';
      var testStatus = 'success';
      var testToken1 = 'testtoken1';
      var testToken2 = 'testtoken2';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .matchHeader('Authorization', 'Bearer ' + testToken2)
        // IMPORTANT: Must be path which requires auth
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRepo,
            status: testStatus
          })
        ]);
      options.appveyorClient = new SwaggerClient({
        authorizations: {
          apiToken: new SwaggerClient.ApiKeyAuthorization(
            'Authorization',
            'Bearer ' + testToken2,
            'header'
          )
        },
        spec: appveyorSwagger,
        usePromise: true
      });
      options.repo = testRepo;
      options.token = testToken1;
      return appveyorStatus.getLastBuild(options)
        .then(function(projectBuild) {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('rejects with Error for webhookId', function() {
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      options.webhookId = 'abcde';
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        function(err) {
          assert.match(err.message, /required|supported/i);
        }
      );
    });
  });

  describe('.getStatusBadge', function() {
    it('queries badge by repo URL', function() {
      var testBadgeUrlPath = 'gitHub/foo/bar';
      var testRepoUrl = 'git@github.com:foo/bar.git';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testBadgeUrlPath)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.repo = testRepoUrl;
      return appveyorStatus.getStatusBadge(options)
        .then(function(badge) {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by repo URL and branch', function() {
      var testBadgeUrlPath = 'gitHub/foo/bar';
      var testBranch = 'testb';
      var testRepoUrl = 'git@github.com:foo/bar.git';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testBadgeUrlPath)
        .query(function(query) {
          return query.branch === testBranch && query.svg === 'true';
        })
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.branch = testBranch;
      options.repo = testRepoUrl;
      return appveyorStatus.getStatusBadge(options)
        .then(function(badge) {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by webhookId', function() {
      var testWebhookId = 'abcde';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testWebhookId)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options)
        .then(function(badge) {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by webhookId and branch', function() {
      var testBranch = 'testb';
      var testWebhookId = 'abcde';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testWebhookId + '/branch/' + testBranch)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.branch = testBranch;
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options)
        .then(function(badge) {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('rejects with Error for non-200 response', function() {
      var testWebhookId = 'abcde';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testWebhookId)
        .query(true)
        .reply(
          400,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        function(err) {
          assert.include(err.message, '400');
          ne.done();
        }
      );
    });

    it('rejects with Error for non-SVG response', function() {
      var testWebhookId = 'abcde';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testWebhookId)
        .query(true)
        .reply(200, 'invalid', {'Content-Type': 'text/plain'});
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        function(err) {
          assert.match(err.message, /svg/i);
          ne.done();
        }
      );
    });

    it('rejects with Error for response without Content-Type', function() {
      var testWebhookId = 'abcde';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/' + testWebhookId)
        .query(true)
        .reply(200, 'invalid', {'Content-Type': undefined});
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        function(err) {
          assert.match(err.message, /svg/i);
          ne.done();
        }
      );
    });

    it('rejects with Error for options.project', function() {
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      options.project = 'foo/bar';
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        function(err) {
          assert.match(err.message, /required|supported/i);
        }
      );
    });
  });

  describe('.getStatus', function() {
    it('returns status from last build for project', function() {
      var testProject = 'foo/bar';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/' + testProject)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.project = testProject;
      return appveyorStatus.getStatus(options)
        .then(function(status) {
          assert.strictEqual(status, testStatus);
          ne.done();
        });
    });

    it('returns status from badge for GitHub repo', function() {
      var testProject = 'foo/bar';
      var testRepo = 'https://github.com/' + testProject + '.git';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/gitHub/' + testProject)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.repo = testRepo;
      return appveyorStatus.getStatus(options)
        .then(function(status) {
          assert.strictEqual(status, testStatus);
          ne.done();
        });
    });

    it('can be called with callback without options', function(done) {
      var testBranch = 'testb';
      var testProject = 'foo/bar';
      var testRemote = 'testr';
      var testRemoteUrl = 'https://github.com/' + testProject + '.git';
      var testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      var ne = nock(apiUrl)
        .get('/api/projects/status/gitHub/' + testProject)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      appveyorStatus.getStatus(function(err, status) {
        assert.ifError(err);
        assert.strictEqual(status, testStatus);
        ne.done();
        done();
      });
    });

    it('throws TypeError for non-function callback', function() {
      assert.throws(
        function() { appveyorStatus.getStatus(options, true); },
        TypeError
      );
    });

    it('rejects non-object options with TypeError', function() {
      return appveyorStatus.getStatus(true).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, TypeError);
          assert.match(err.message, /\boptions\b/);
        }
      );
    });

    it('rejects project and repo with Error', function() {
      options.project = 'foo/bar';
      options.repo = '.';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\brepo\b/);
        }
      );
    });

    it('rejects project and webhookId with Error', function() {
      options.project = 'foo/bar';
      options.webhookId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bwebhookId\b/);
        }
      );
    });

    it('rejects repo and webhookId with Error', function() {
      options.repo = '.';
      options.webhookId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\brepo\b/);
          assert.match(err.message, /\bwebhookId\b/);
        }
      );
    });

    it('rejects non-Writable err with TypeError', function() {
      return appveyorStatus.getStatus({err: new stream.Readable()}).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, TypeError);
          assert.match(err.message, /\berr\b/);
        }
      );
    });

    it('rejects non-numeric wait with TypeError', function() {
      options.wait = 'forever';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, TypeError);
          assert.match(err.message, /\bwait\b/);
        }
      );
    });

    it('rejects negative wait with RangeError', function() {
      options.wait = -1;
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, RangeError);
          assert.match(err.message, /\bwait\b/);
        }
      );
    });

    it('rejects project without accountName with Error', function() {
      options.project = {
        slug: 'foo'
      };
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\baccountName\b/);
        }
      );
    });

    it('rejects project without slug with Error', function() {
      options.project = {
        accountName: 'foo'
      };
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        function(err) {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bslug\b/);
        }
      );
    });
  });
});
