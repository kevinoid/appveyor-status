/**
 * @copyright Copyright 2017-2020 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const FakeTimers = require('@sinonjs/fake-timers');
const SwaggerClient = require('swagger-client');
const appveyorSwagger = require('appveyor-swagger');
const assert = require('assert');
const escapeStringRegexp = require('escape-string-regexp');
const nock = require('nock');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const stream = require('stream');
const url = require('url');

const gitUtils = require('../lib/git-utils.js');
const appveyorUtils = require('../lib/appveyor-utils.js');
const apiResponses = require('../test-lib/api-responses.js');
const promisifyTimers = require('../test-lib/promisify-timers.js');
const AmbiguousProjectError = require('../lib/ambiguous-project-error.js');

const clock = FakeTimers.createClock();
// Skip tests which use global fetch (unsupported by nock)
// eslint-disable-next-line no-undef
const nofetchIt = typeof fetch === 'undefined' ? it : xit;

const appveyorStatus = proxyquire(
  '..',
  {
    timers: clock,
    'timers/promises': promisifyTimers(clock),
  },
);

const apiUrl = url.format({
  protocol: appveyorSwagger.schemes[0],
  host: appveyorSwagger.host,
});
const { badgeToStatus } = appveyorUtils;
const { match } = sinon;
const { projectBuildToStatus } = appveyorUtils;

function toRegExp(str) {
  return new RegExp(escapeStringRegexp(str));
}

/** Waits for a timer to be registered with sinon.
 *
 * For most connections, nock calls setImmediate and setTimeout x2:
 * https://github.com/nock/nock/blob/v13.0.2/lib/playback_interceptor.js#L313
 * https://github.com/nock/nock/blob/v13.0.2/lib/playback_interceptor.js#L306
 * https://github.com/nock/nock/blob/v13.0.2/lib/playback_interceptor.js#L302
 * so the timer queue (whether real or mocked) must be pumped until nock
 * finishes the request.
 *
 * @private
 */
function waitForTimer(maxRetries) {
  return new Promise((resolve, reject) => {
    function check(retries) {
      if (clock.countTimers() > 0) {
        resolve();
      } else if (retries > 0) {
        setTimeout(check, 0, retries - 1);
      } else {
        reject(new Error(`No timers after ${maxRetries} retries`));
      }
    }

    check(maxRetries);
  });
}

function assertAuthorization(req, authorization) {
  try {
    assert.strictEqual(
      req.headers.authorization,
      authorization,
    );
  } catch {
    // Single-element Array in node-fetch < v3.0.0
    // https://github.com/node-fetch/node-fetch/pull/834
    assert.deepEqual(
      req.headers.authorization,
      authorization,
    );
  }
}

describe('appveyorStatus', function() {
  // Increase timeout to cover slower CI environments.
  this.timeout(4000);

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

  let nodeFetch;
  before(async () => {
    const nodeFetchMod = await import('node-fetch');
    nodeFetch = nodeFetchMod.default;
  });

  // Test options object with standard streams for convenience
  let options;
  beforeEach(() => {
    options = {
      err: new stream.PassThrough(),
      // Use nodeFetch instead of global fetch, which is not supported by nock
      userFetch: nodeFetch,
    };
  });

  const matchOptionsCwd = match({
    cwd: match.same(undefined).or(match.same(null)).or(match.same('.')),
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
        .reply(200, apiResponses.getProjectBuild({ status: testStatus }));
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
        .reply(200, apiResponses.getProjectBuild({ status: testStatus }));
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
            status: testStatus,
          }),
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
            status: testStatus,
          }),
        ])
        .get(`/api/projects/${testProject.join('/')}/branch/${testBranch}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({
          branch: testBranch,
          repositoryType: 'git',
          repositoryName: testRemoteUrl,
          status: testStatus,
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
          status: testStatus,
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
          status: testStatus,
        }));
      options.commit = testCommit;
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.strictEqual(err.name, 'CommitMismatchError');
          ne.done();
        },
      );
    });

    it('returns queued status as-is without wait', () => {
      const testProject = 'foo/bar';
      const testStatus = 'queued';
      const ne = nock(apiUrl)
        .get(`/api/projects/${testProject}`)
        .query(true)
        .reply(200, apiResponses.getProjectBuild({ status: testStatus }));
      options.project = testProject;
      return appveyorStatus.getLastBuild(options)
        .then((projectBuild) => {
          assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
          ne.done();
        });
    });

    describe('with wait', () => {
      it('true retries queued status', () => {
        const testProject = 'foo/bar';
        const testStatus = 'success';
        const expectQueued = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: 'queued' }));
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: testStatus }));

        options.project = testProject;
        options.wait = true;
        const projectBuildP = appveyorStatus.getLastBuild(options);
        return waitForTimer(10)
          .then(() => {
            assert(expectQueued.isDone(), 'First call is made immediately.');
            assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

            clock.tick(900);
            assert(
              clock.countTimers() > 0 && !expectSuccess.isDone(),
              'Retry not started after 900ms',
            );

            clock.tick(59100);
            assert.strictEqual(
              clock.countTimers(),
              0,
              'Retry started before 60,000ms',
            );

            return projectBuildP;
          })
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert.strictEqual(clock.countTimers(), 0, 'Retries completed');
            assert.strictEqual(
              options.err.read(),
              null,
              'does not print wait messages by default',
            );
          });
      });

      it('true retries queued status verbosely', () => {
        const testProject = 'foo/bar';
        const testStatus = 'success';
        const expectQueued = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: 'queued' }));
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: testStatus }));

        options.project = testProject;
        options.verbosity = 1;
        options.wait = true;
        const projectBuildP = appveyorStatus.getLastBuild(options);
        return waitForTimer(10)
          .then(() => {
            assert(expectQueued.isDone(), 'First call is made immediately.');
            assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

            clock.tick(900);
            assert(
              clock.countTimers() > 0 && !expectSuccess.isDone(),
              'Retry not started after 900ms',
            );

            clock.tick(59100);
            assert.strictEqual(
              clock.countTimers(),
              0,
              'Retry started before 60,000ms',
            );

            return projectBuildP;
          })
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert.strictEqual(clock.countTimers(), 0, 'Retries completed');
            assert.match(
              String(options.err.read()),
              /\bwait/i,
              'prints wait message when verbose',
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
              status: 'running',
            }),
          ]);
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProjectParts.join('/')}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: testStatus }));

        options.repo = testRepoUrl;
        options.wait = true;
        options.verbosity = 1;
        const projectBuildP = appveyorStatus.getLastBuild(options);
        return waitForTimer(10)
          .then(() => {
            assert(expectQueued.isDone(), 'First call is made immediately.');
            assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

            clock.tick(900);
            assert(
              clock.countTimers() > 0 && !expectSuccess.isDone(),
              'Retry not started after 900ms',
            );

            clock.tick(59100);
            assert.strictEqual(
              clock.countTimers(),
              0,
              'Retry started before 60,000ms',
            );

            return projectBuildP;
          })
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), testStatus);
            assert.strictEqual(clock.countTimers(), 0, 'Retries completed');
            assert.match(
              String(options.err.read()),
              /\bwait/i,
              'prints wait message when verbose',
            );
          });
      });

      it('is stopped on error', () => {
        const testErrMsg = 'something bad';
        const testProject = 'foo/bar';
        const expectQueued = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: 'queued' }));
        const expectSuccess = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .replyWithError(testErrMsg);

        options.project = testProject;
        options.wait = true;
        const projectBuildP = appveyorStatus.getLastBuild(options);
        return waitForTimer(10)
          .then(() => {
            assert(expectQueued.isDone(), 'First call is made immediately.');
            assert(!expectSuccess.isDone(), 'Retry is not done immediately.');

            clock.tick(900);
            assert(
              clock.countTimers() > 0 && !expectSuccess.isDone(),
              'Retry not started after 900ms',
            );

            clock.tick(59100);
            assert.strictEqual(
              clock.countTimers(),
              0,
              'Retry started before 60,000ms',
            );

            return projectBuildP;
          })
          .then(
            sinon.mock().never(),
            (err) => {
              assert.match(err.message, toRegExp(testErrMsg));
              assert.strictEqual(clock.countTimers(), 0, 'Retries completed');
            },
          );
      });

      it('returns queued status if wait elapses', () => {
        const testProject = 'foo/bar';
        const expectQueued1 = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: 'queued' }));
        const expectQueued2 = nock(apiUrl)
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: 'queued' }));
        // This test does not specify specifics of exponential backoff
        nock(apiUrl)
          .persist()
          .get(`/api/projects/${testProject}`)
          .query(true)
          .reply(200, apiResponses.getProjectBuild({ status: 'queued' }));

        options.project = testProject;
        options.wait = 8000;
        const projectBuildP = appveyorStatus.getLastBuild(options);
        return waitForTimer(10)
          .then(() => {
            assert(expectQueued1.isDone(), 'First call is made immediately.');
            assert(!expectQueued2.isDone(), 'Retry is not done immediately.');

            clock.tick(900);
            assert(
              clock.countTimers() > 0 && !expectQueued2.isDone(),
              'Retry not started after 900ms',
            );

            clock.tick(7100);
            assert.strictEqual(
              clock.countTimers(),
              0,
              'Retry started before 8,000ms',
            );

            return projectBuildP;
          })
          .then((projectBuild) => {
            assert.strictEqual(projectBuildToStatus(projectBuild), 'queued');
            assert.strictEqual(clock.countTimers(), 0, 'Retries completed');
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
            status: testStatus,
          }),
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
      const matchRepoCwd = match({ cwd: testRepo });
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
            status: testStatus,
          }),
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
        .once().withArgs(matchOptionsCwd).rejects(new Error('test'));
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
            status: testStatus,
          }),
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
        .once().withArgs(testBranch, matchOptionsCwd)
        .rejects(new Error('test'));
      gitUtilsMock.expects('getRemoteUrl')
        .once().withArgs('origin', matchOptionsCwd).resolves(testRemoteUrl);
      gitUtilsMock.expects('resolveCommit').never();
      const ne = nock(apiUrl)
        .get('/api/projects')
        .reply(200, [
          apiResponses.getProject({
            repositoryType: 'git',
            repositoryName: testRemoteUrl,
            status: testStatus,
          }),
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
            status: testStatus,
          }),
        ]);
      options.repo = testRepo;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, toRegExp(testRepo));
          ne.done();
        },
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
            status: testStatus,
          }),
          apiResponses.getProject({
            accountName: testProject2[0],
            repositoryType: 'git',
            repositoryName: testRepo,
            slug: testProject2[1],
            status: testStatus,
          }),
        ]);
      options.repo = testRepo;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof AmbiguousProjectError);
          assert.deepEqual(
            err.projects,
            [testProject1.join('/'), testProject2.join('/')],
          );
          ne.done();
        },
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
        .reply(400, { message: testErrMsg });
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /400|Bad Request/i);
          assert.match(err.message, toRegExp(testErrMsg));
          assert.strictEqual(err.status, 400);
          ne.done();
        },
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
        .reply(200, 'invalid', { 'Content-Type': 'text/plain' });
      options.project = testProject;
      return appveyorStatus.getLastBuild(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /\bJSON\b/);
          ne.done();
        },
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
          assert.match(err.message, toRegExp(testErrMsg));
          ne.done();
        },
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
          assertAuthorization(this.req, `Bearer ${testToken}`);
          return [
            apiResponses.getProject({
              repositoryType: 'git',
              repositoryName: testRepo,
              status: testStatus,
            }),
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
          assertAuthorization(this.req, `Bearer ${testToken2}`);
          return [
            apiResponses.getProject({
              repositoryType: 'git',
              repositoryName: testRepo,
              status: testStatus,
            }),
          ];
        });
      options.appveyorClient = new SwaggerClient({
        authorizations: {
          apiToken: `Bearer ${testToken2}`,
        },
        spec: appveyorSwagger,
        userFetch: nodeFetch,
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
        },
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
        },
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
          { 'Content-Type': 'image/svg+xml' },
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
          { 'Content-Type': 'image/svg+xml' },
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
          { 'Content-Type': 'image/svg+xml' },
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
          { 'Content-Type': 'image/svg+xml' },
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
          { 'Content-Type': 'image/svg+xml' },
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
          { 'Content-Type': 'image/svg+xml' },
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
          { 'Content-Type': 'image/svg+xml' },
        );
      options.statusBadgeId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /400|Bad Request/i);
          assert.strictEqual(err.status, 400);
          ne.done();
        },
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
        .reply(200, 'invalid', { 'Content-Type': 'text/plain' });
      options.statusBadgeId = testWebhookId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /svg/i);
          ne.done();
        },
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
        .reply(200, 'invalid', { 'Content-Type': undefined });
      options.statusBadgeId = testStatusBadgeId;
      return appveyorStatus.getStatusBadge(options).then(
        sinon.mock().never(),
        (err) => {
          assert.match(err.message, /svg/i);
          ne.done();
        },
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
        },
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
        .reply(200, apiResponses.getProjectBuild({ status: testStatus }));
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
          { 'Content-Type': 'image/svg+xml' },
        );
      options.repo = testRepo;
      return appveyorStatus.getStatus(options)
        .then((status) => {
          assert.strictEqual(status, testStatus);
          ne.done();
        });
    });

    nofetchIt('can be called with callback without options', (done) => {
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
          { 'Content-Type': 'image/svg+xml' },
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
        TypeError,
      );
    });

    it(
      'rejects non-object options with TypeError',
      () => appveyorStatus.getStatus(true).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /\boptions\b/);
        },
      ),
    );

    it('rejects project and repo with Error', () => {
      options.project = 'foo/bar';
      options.repo = '.';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\brepo\b/);
        },
      );
    });

    it('rejects project and statusBadgeId with Error', () => {
      options.project = 'foo/bar';
      options.statusBadgeId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bstatusBadgeId\b/);
        },
      );
    });

    it('rejects repo and statusBadgeId with Error', () => {
      options.repo = '.';
      options.statusBadgeId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\brepo\b/);
          assert.match(err.message, /\bstatusBadgeId\b/);
        },
      );
    });

    it('rejects project and webhookId with Error', () => {
      options.project = 'foo/bar';
      options.webhookId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bwebhookId\b/);
        },
      );
    });

    it('rejects repo and webhookId with Error', () => {
      options.repo = '.';
      options.webhookId = 'abcde';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\brepo\b/);
          assert.match(err.message, /\bwebhookId\b/);
        },
      );
    });

    it(
      'rejects non-Writable err with TypeError',
      () => appveyorStatus.getStatus({ err: new stream.Readable() }).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /\berr\b/);
        },
      ),
    );

    it('rejects non-numeric wait with TypeError', () => {
      options.wait = 'forever';
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /\bwait\b/);
        },
      );
    });

    it('rejects negative wait with RangeError', () => {
      options.wait = -1;
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof RangeError);
          assert.match(err.message, /\bwait\b/);
        },
      );
    });

    it('rejects project without accountName with Error', () => {
      options.project = {
        slug: 'foo',
      };
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\baccountName\b/);
        },
      );
    });

    it('rejects project without slug with Error', () => {
      options.project = {
        accountName: 'foo',
      };
      return appveyorStatus.getStatus(options).then(
        sinon.mock().never(),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /\bproject\b/);
          assert.match(err.message, /\bslug\b/);
        },
      );
    });
  });
});
