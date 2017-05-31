/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const AmbiguousProjectError = require('../lib/ambiguous-project-error');
const SwaggerClient = require('swagger-client');
const apiResponses = require('../test-lib/api-responses');
const appveyorStatus = require('..');
const appveyorSwagger = require('appveyor-swagger');
const appveyorUtils = require('../lib/appveyor-utils');
const assert = require('chai').assert;
const gitUtils = require('../lib/git-utils');
const nock = require('nock');
const sinon = require('sinon');
const stream = require('stream');
const url = require('url');

const apiUrl = url.format({
  protocol: appveyorSwagger.schemes[0],
  host: appveyorSwagger.host
});
const badgeToStatus = appveyorUtils.badgeToStatus;
const match = sinon.match;
const projectBuildToStatus = appveyorUtils.projectBuildToStatus;

// nock doesn't support Node v8 yet:
// https://github.com/node-nock/nock/issues/922
// https://github.com/node-nock/nock/issues/925
const describeThis =
  Number(process.version.slice(1).split('.', 1)[0]) >= 8 ? xdescribe : describe;
describeThis('appveyorStatus', () => {
  // Ensure that expectations are not carried over between tests
  let gitUtilsMock;
  beforeEach(() => {
    gitUtilsMock = sinon.mock(gitUtils);
  });
  afterEach(() => {
    gitUtilsMock.restore();
    gitUtilsMock = null;
  });

  // Ensure all requests are mocked and are not carried over between tests
  before(() => {
    nock.disableNetConnect();
  });
  after(() => {
    nock.enableNetConnect();
    nock.restore();
  });
  afterEach(() => {
    nock.cleanAll();
  });

  // Test options object with standard streams for convenience
  let options;
  beforeEach(() => {
    options = {
      err: new stream.PassThrough()
    };
  });

  const matchOptionsCwd = match({
    cwd: match.same(undefined).or(match.same(null)).or(match.same('.'))
  });

  describe('.getLastBuild', () => {
    it('queries last build for options.project', () => {
      const testProject = 'foo/bar';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('queries last build for project with named branch', () => {
      const testBranch = 'testb';
      const testProject = 'foo/bar';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}/branch/${testBranch}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.branch = testBranch;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('queries last build for named branch by remote', () => {
      const testBranch = 'testb';
      const testRemote = 'testr';
      const testRemoteUrl = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
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
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('queries non-last build for named branch by remote', () => {
      const testBranch = 'testb';
      const testProject = ['foo', 'bar'];
      const testRemote = 'testr';
      const testRemoteUrl = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            accountName: testProject[0],
            branch: `${testBranch}5`,
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            slug: testProject[1],
            status: testStatus
          })
        ])
        .get(`/api/projects/${testProject.join('/')}/branch/${testBranch}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          branch: testBranch,
          repositoryType: 'git',
          repositoryName: testRemoteUrl,
          status: testStatus
        }));
      options.branch = testBranch;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('uses commit hash without resolving', () => {
      const testCommit = 'adc83b19e793491b1c6ea0fd8b46cd9f32e592a1';
      const testProject = 'foo/bar';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          commitId: testCommit,
          status: testStatus
        }));
      options.commit = testCommit;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('rejects with CommitMismatchError if commit does not match', () => {
      const testCommit = 'testtag';
      const testProject = 'foo/bar';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit')
        .once().withArgs(testCommit, matchOptionsCwd).resolves('abcde');
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          commitId: '12345',
          status: testStatus
        }));
      options.commit = testCommit;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.strictEqual(err.name, 'CommitMismatchError');
          ne.done();
        });
    });

    it('returns queued status as-is without wait', () => {
      const testProject = 'foo/bar';
      const testStatus = 'queued';
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    describe('with wait', () => {
      let clock;
      beforeEach(() => {
        // No need to mock setImmediate, which is used in this file.
        clock = sinon.useFakeTimers(
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'Date'
        );
      });
      afterEach(() => {
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
        setImmediate(() => {
          // SwaggerClient constructor has been called.
          // Tick for SwaggerClient.buildFromSpec.
          clock.tick(10);
          // Wait for Promises to resolve
          setImmediate(() => {
            // First (mocked) request has been made.
            // Wait for response to propagate and callback to be called.
            setImmediate(() => {
              // Still propagating...
              setImmediate(cb);
            });
          });
        });
      }

      it('true retries queued status', () => {
        const testProject = 'foo/bar';
        const testStatus = 'success';
        const expectQueued = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: testStatus}));

        let retriesDone = false;
        afterFirstRequest(() => {
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
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert(retriesDone, 'Retries completed');
            assert.strictEqual(
              options.err.read(),
              null,
              'does not print wait messages by default'
            );
          });
      });

      it('true retries running status from project', () => {
        const testProjectParts = ['foo', 'bar'];
        const testRepoUrl = 'git://foo.bar/baz';
        const testStatus = 'success';
        const expectQueued = nock(apiUrl)
          .get('/api/projects')
          .query(true)
          .reply(200, [
            apiResponses.getProject({
              accountName: testProjectParts[0],
              repositoryType: 'git',
              repositoryName: testRepoUrl,
              slug: testProjectParts[1],
              status: 'running'
            })
          ]);
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProjectParts.join('/')}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: testStatus}));

        let retriesDone = false;
        afterFirstRequest(() => {
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
        options.verbosity = 1;
        return appveyorStatus.getLastBuild(options)
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert(retriesDone, 'Retries completed');
            assert.match(
              String(options.err.read()),
              /\bwait/i,
              'prints wait message when verbose'
            );
          });
      });

      it('is stopped on error', () => {
        const testErrMsg = 'something bad';
        const testProject = 'foo/bar';
        const expectQueued = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .replyWithError(testErrMsg);

        let retriesDone = false;
        afterFirstRequest(() => {
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
          (err) => {
            assert.include(err.message, testErrMsg);
            assert(retriesDone, 'Retries completed');
          }
        );
      });

      it('returns queued status if wait elapses', () => {
        const testProject = 'foo/bar';
        const expectQueued1 = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));
        const expectQueued2 = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));
        // This test does not specify specifics of exponential backoff
        nock(apiUrl)
          .persist()
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({status: 'queued'}));

        let retriesDone = false;
        afterFirstRequest(() => {
          assert(expectQueued1.isDone(), 'First call is made immediately.');
          assert(!expectQueued2.isDone(), 'Retry is not done immediately.');

          clock.tick(900);
          assert(!expectQueued2.isDone(), 'Retry is not done less than 1 sec.');

          clock.tick(60000);
          assert(expectQueued2.isDone(), 'Retry is done less than 1 minute.');
          retriesDone = true;
        });

        options.project = testProject;
        options.wait = 8000;
        return appveyorStatus.getLastBuild(options)
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), 'queued');
            assert(retriesDone, 'Retries completed');
          });
      });
    });

    it('queries repo in cwd by default', () => {
      const testBranch = 'testb';
      const testRemote = 'testr';
      const testRemoteUrl = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      const ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('resolves branch, commit, and remote URL in local repo', () => {
      const testBranch = 'testb';
      const testCommit = 'testtag';
      const testCommitHash = '4b482f89ef23e06ad6a9c01adaece30943bf434c';
      const testRemote = 'testr';
      const testRemoteUrl = 'git://foo.bar/baz';
      const testRepo = 'foo/bar';
      const testStatus = 'success';
      const matchRepoCwd = match({cwd: testRepo});
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchRepoCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchRepoCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchRepoCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit')
        .once().withArgs(testCommit, matchRepoCwd).resolves(testCommitHash);
      const ne = nock(apiUrl)
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
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('falls back to origin if not on a branch', () => {
      const testRemoteUrl = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).rejects(new Error());
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs('origin', matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus
          })
        ]);
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(options.err.read(), null);
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('falls back to origin if branch has no remote', () => {
      const testBranch = 'testb';
      const testRemoteUrl = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).rejects(new Error());
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs('origin', matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
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
        .then((projectBuild) => {
          const errStr = String(options.err.read());
          assert.match(errStr, /\bremote\b/i);
          assert.match(errStr, /\borigin\b/i);
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('rejects with Error if no project matches repo', () => {
      const testRepo = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get('/api/projects')
        .query(true)
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: `${testRepo}/quux`,
            status: testStatus
          })
        ]);
      options.repo = testRepo;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.include(err.message, testRepo);
          ne.done();
        }
      );
    });

    it('AmbiguousProjectError if multiple projects match repo', () => {
      const testProject1 = ['myacct', 'proj1'];
      const testProject2 = ['youracct', 'proj2'];
      const testRepo = 'git://foo.bar/baz';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
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
        (err) => {
          assert.instanceOf(err, AmbiguousProjectError);
          assert.deepEqual(
            err.projects,
            [testProject1.join('/'), testProject2.join('/')]
          );
          ne.done();
        }
      );
    });

    it('rejects with Error for non-200 responses', () => {
      const testErrMsg = 'bad dead bodies';
      const testProject = 'foo/bar';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(400, {message: testErrMsg});
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /400|Bad Request/i);
          assert.include(err.message, testErrMsg);
          assert.strictEqual(err.status, 400);
          ne.done();
        }
      );
    });

    it('rejects with Error for non-JSON responses', () => {
      const testProject = 'foo/bar';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(200, 'invalid', {'Content-Type': 'text/plain'});
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.include(err.message, 'JSON');
          ne.done();
        }
      );
    });

    it('rejects with Error for request error', () => {
      const testErrMsg = 'something bad happened';
      const testProject = 'foo/bar';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .replyWithError(testErrMsg);
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.include(err.message, testErrMsg);
          ne.done();
        }
      );
    });

    it('passes options.token as bearer token', () => {
      const testRepo = 'git://foo.bar/baz';
      const testStatus = 'success';
      const testToken = 'testtoken';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        // IMPORTANT: Must be path which requires auth
        .get('/api/projects')
        .query(true)
        .reply(200, function(uri, requestBody) {
          assert.deepEqual(
            this.req.headers.authorization,
            [`Bearer ${testToken}`]
          );
          return [
            apiResponses.getProject({
              repositoryType: 'git',
              repositoryName: testRepo,
              status: testStatus
            })
          ];
        });
      options.repo = testRepo;
      options.token = testToken;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('ignores options.token when appveyorClient is given', () => {
      const testRepo = 'git://foo.bar/baz';
      const testStatus = 'success';
      const testToken1 = 'testtoken1';
      const testToken2 = 'testtoken2';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        // IMPORTANT: Must be path which requires auth
        .get('/api/projects')
        .query(true)
        .reply(200, function(uri, requestBody) {
          assert.deepEqual(
            this.req.headers.authorization,
            [`Bearer ${testToken2}`]
          );
          return [
            apiResponses.getProject({
              repositoryType: 'git',
              repositoryName: testRepo,
              status: testStatus
            })
          ];
        });
      options.appveyorClient = new SwaggerClient({
        authorizations: {
          apiToken: `Bearer ${testToken2}`
        },
        spec: appveyorSwagger
      });
      options.repo = testRepo;
      options.token = testToken1;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    it('rejects with Error for statusBadgeId', () => {
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      options.statusBadgeId = 'abcde';
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /required|supported/i);
        }
      );
    });

    it('rejects with Error for webhookId', () => {
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      options.webhookId = 'abcde';
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /required|supported/i);
        }
      );
    });
  });

  describe('.getStatusBadge', () => {
    it('queries badge by repo URL', () => {
      const testBadgeUrlPath = 'gitHub/foo/bar';
      const testRepoUrl = 'git@github.com:foo/bar.git';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testBadgeUrlPath}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.repo = testRepoUrl;
      return appveyorStatus.getStatusBadge(options)
        .then((badge) => {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by repo URL and branch', () => {
      const testBadgeUrlPath = 'gitHub/foo/bar';
      const testBranch = 'testb';
      const testRepoUrl = 'git@github.com:foo/bar.git';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testBadgeUrlPath}`)
        .query((query) => query.branch === testBranch && query.svg === 'true')
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.branch = testBranch;
      options.repo = testRepoUrl;
      return appveyorStatus.getStatusBadge(options)
        .then((badge) => {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by statusBadgeId', () => {
      const testStatusBadgeId = 'abcde';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testStatusBadgeId}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.statusBadgeId = testStatusBadgeId;
      return appveyorStatus.getStatusBadge(options)
        .then((badge) => {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by webhookId', () => {
      const testWebhookId = 'abcde';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testWebhookId}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options)
        .then((badge) => {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by statusBadgeId and branch', () => {
      const testBranch = 'testb';
      const testStatusBadgeId = 'abcde';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testStatusBadgeId}/branch/${testBranch}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.branch = testBranch;
      options.statusBadgeId = testStatusBadgeId;
      return appveyorStatus.getStatusBadge(options)
        .then((badge) => {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('queries badge by webhookId and branch', () => {
      const testBranch = 'testb';
      const testWebhookId = 'abcde';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testWebhookId}/branch/${testBranch}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.branch = testBranch;
      options.webhookId = testWebhookId;
      return appveyorStatus.getStatusBadge(options)
        .then((badge) => {
          assert.strictEqual(badgeToStatus(badge), testStatus);
          ne.done();
        });
    });

    it('rejects with Error for non-200 response', () => {
      const testWebhookId = 'abcde';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testWebhookId}`)
        .query(true)
        .reply(
          400,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.statusBadgeId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /400|Bad Request/i);
          assert.strictEqual(err.status, 400);
          ne.done();
        }
      );
    });

    it('rejects with Error for non-SVG response', () => {
      const testWebhookId = 'abcde';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testWebhookId}`)
        .query(true)
        .reply(200, 'invalid', {'Content-Type': 'text/plain'});
      options.statusBadgeId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /svg/i);
          ne.done();
        }
      );
    });

    it('rejects with Error for response without Content-Type', () => {
      const testStatusBadgeId = 'abcde';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/${testStatusBadgeId}`)
        .query(true)
        .reply(200, 'invalid', {'Content-Type': undefined});
      options.statusBadgeId = testStatusBadgeId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /svg/i);
          ne.done();
        }
      );
    });

    it('rejects with Error for options.project', () => {
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      options.project = 'foo/bar';
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /required|supported/i);
        }
      );
    });
  });

  describe('.getStatus', () => {
    it('returns status from last build for project', () => {
      const testProject = 'foo/bar';
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .reply(200, apiResponses.getProjectBuild({status: testStatus}));
      options.project = testProject;
      return appveyorStatus.getStatus(options)
        .then((status) => {
          assert.strictEqual(status, testStatus);
          ne.done();
        });
    });

    it('returns status from badge for GitHub repo', () => {
      const testProject = 'foo/bar';
      const testRepo = `https://github.com/${testProject}.git`;
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch').never();
      gitUtilsMock.expects('getRemote').never();
      gitUtilsMock.expects('getRemoteUrl').never();
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/gitHub/${testProject}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      options.repo = testRepo;
      return appveyorStatus.getStatus(options)
        .then((status) => {
          assert.strictEqual(status, testStatus);
          ne.done();
        });
    });

    it('can be called with callback without options', (done) => {
      const testBranch = 'testb';
      const testProject = 'foo/bar';
      const testRemote = 'testr';
      const testRemoteUrl = `https://github.com/${testProject}.git`;
      const testStatus = 'success';
      gitUtilsMock.expects('getBranch')
        .once().withArgs(matchOptionsCwd).resolves(testBranch);
      gitUtilsMock.expects('getRemote')
        .once().withArgs(testBranch, matchOptionsCwd).resolves(testRemote);
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs(testRemote, matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get(`/api/projects/status/gitHub/${testProject}`)
        .query(true)
        .reply(
          200,
          apiResponses.getStatusBadge(testStatus),
          {'Content-Type': 'image/svg+xml'}
        );
      appveyorStatus.getStatus((err, status) => {
        assert.ifError(err);
        assert.strictEqual(status, testStatus);
        ne.done();
        done();
      });
    });

    it('throws TypeError for non-function callback', () => {
      assert.throws(
        () => { appveyorStatus.getStatus(options, true); },
        TypeError
      );
    });

    it('rejects non-object options with TypeError', () => appveyorStatus.getStatus(true).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, TypeError);
          assert.match(err.message, /\boptions\b/);
        }
      ));

    it('rejects project and repo with Error', () => {
      options.project = 'foo/bar';
      options.repo = '.';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\brepo\b/);
        }
      );
    });

    it('rejects project and statusBadgeId with Error', () => {
      options.project = 'foo/bar';
      options.statusBadgeId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bstatusBadgeId\b/);
        }
      );
    });

    it('rejects repo and statusBadgeId with Error', () => {
      options.repo = '.';
      options.statusBadgeId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\brepo\b/);
          assert.match(err.message, /\bstatusBadgeId\b/);
        }
      );
    });

    it('rejects project and webhookId with Error', () => {
      options.project = 'foo/bar';
      options.webhookId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bwebhookId\b/);
        }
      );
    });

    it('rejects repo and webhookId with Error', () => {
      options.repo = '.';
      options.webhookId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\brepo\b/);
          assert.match(err.message, /\bwebhookId\b/);
        }
      );
    });

    it('rejects non-Writable err with TypeError', () => appveyorStatus.getStatus({err: new stream.Readable()}).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, TypeError);
          assert.match(err.message, /\berr\b/);
        }
      ));

    it('rejects non-numeric wait with TypeError', () => {
      options.wait = 'forever';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, TypeError);
          assert.match(err.message, /\bwait\b/);
        }
      );
    });

    it('rejects negative wait with RangeError', () => {
      options.wait = -1;
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, RangeError);
          assert.match(err.message, /\bwait\b/);
        }
      );
    });

    it('rejects project without accountName with Error', () => {
      options.project = {
        slug: 'foo'
      };
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\baccountName\b/);
        }
      );
    });

    it('rejects project without slug with Error', () => {
      options.project = {
        accountName: 'foo'
      };
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert.instanceOf(err, Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bslug\b/);
        }
      );
    });
  });
});
