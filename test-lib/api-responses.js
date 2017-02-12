/**
 * @copyright Copyright 2017 Test Author <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var fs = require('fs');
var path = require('path');

var badgeData;

/** Copy the values of all enumerable own properties which exist on the target
 * object from one or more source objects. (Like Object.assign except no new
 * properties are created on target.)
 *
 * Implementation based on
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
 *
 * @param {!Object} target Object to be updated.
 * @param {Object} varArgs Object from which to copy updated properties.
 * @private
 */
function assignUpdate(target, varArgs) { // .length of function is 2
  if (target === undefined || target === null) {
    throw new TypeError('Cannot convert undefined or null to object');
  }

  var to = Object(target);

  for (var index = 1; index < arguments.length; index += 1) {
    var nextSource = arguments[index];

    if (nextSource) {
      // eslint-disable-next-line no-restricted-syntax
      for (var nextKey in nextSource) {
        if (hasOwnProperty.call(nextSource, nextKey) &&
            hasOwnProperty.call(to, nextKey)) {
          to[nextKey] = nextSource[nextKey];
        }
      }
    }
  }

  return to;
}

/** Gets a Project API response.
 */
exports.getProject = function getProject(options) {
  var project = {
    projectId: 12345,
    accountId: 6789,
    accountName: 'test-account-name',
    builds: [
      {
        buildId: 9876543,
        jobs: [],
        buildNumber: 63,
        version: '0.0.63',
        message: 'test commit messages',
        messageExtended: 'test commit extended message',
        branch: 'master',
        isTag: false,
        commitId: '123098123a941928301820ef938ab2c123572909',
        authorName: 'Test Author',
        authorUsername: 'test-author-user',
        committerName: 'Test Committer',
        committerUsername: 'test-committer-user',
        committed: '2016-11-16T20:38:38+00:00',
        messages: [],
        status: 'success',
        started: '2016-11-16T20:42:09.2109847+00:00',
        finished: '2016-11-16T20:42:59.486954+00:00',
        created: '2016-11-16T20:41:59.1683638+00:00',
        updated: '2016-11-16T20:42:59.486954+00:00'
      }
    ],
    name: 'Test Project',
    slug: 'test-proj',
    repositoryType: 'gitHub',
    repositoryScm: 'git',
    repositoryName: 'test-account-name/test-proj',
    repositoryBranch: 'master',
    isPrivate: false,
    skipBranchesWithoutAppveyorYml: false,
    enableSecureVariablesInPullRequests: false,
    enableSecureVariablesInPullRequestsFromSameRepo: false,
    enableDeploymentInPullRequests: false,
    rollingBuilds: false,
    alwaysBuildClosedPullRequests: false,
    tags: '',
    nuGetFeed: {
      id: 'test-proj-ikb41f0xwpjv',
      name: 'Project test-proj',
      accountId: 6789,
      projectId: 12345,
      publishingEnabled: false,
      created: '2016-09-21T00:08:26.9522633+00:00'
    },
    securityDescriptor: {
      accessRightDefinitions: [
        {
          name: 'View',
          description: 'View'
        },
        {
          name: 'RunBuild',
          description: 'Run build'
        },
        {
          name: 'Update',
          description: 'Update settings'
        },
        {
          name: 'Delete',
          description: 'Delete project'
        }
      ],
      roleAces: [
        {
          roleId: 11111,
          name: 'Administrator',
          isAdmin: true,
          accessRights: [
            {
              name: 'View',
              allowed: true
            },
            {
              name: 'RunBuild',
              allowed: true
            },
            {
              name: 'Update',
              allowed: true
            },
            {
              name: 'Delete',
              allowed: true
            }
          ]
        },
        {
          roleId: 22222,
          name: 'User',
          isAdmin: false,
          accessRights: [
            {
              name: 'View'
            },
            {
              name: 'RunBuild'
            },
            {
              name: 'Update'
            },
            {
              name: 'Delete'
            }
          ]
        }
      ]
    },
    created: '2016-09-21T00:08:25.2289648+00:00',
    updated: '2016-09-21T00:29:31.1506705+00:00'
  };
  assignUpdate(project, options);
  project.builds.forEach(function(build) {
    assignUpdate(build, options);
  });
  return project;
};

/** Gets a ProjectBuild API response with a given status.
 */
exports.getProjectBuild = function getLastBuild(options) {
  var projectBuild = {
    project: {
      projectId: 12345,
      accountId: 6789,
      accountName: 'test-account-name',
      builds: [],
      name: 'Test Project',
      slug: 'test-proj',
      repositoryType: 'gitHub',
      repositoryScm: 'git',
      repositoryName: 'test-account-name/test-proj',
      repositoryBranch: 'master',
      isPrivate: false,
      skipBranchesWithoutAppveyorYml: false,
      enableSecureVariablesInPullRequests: false,
      enableSecureVariablesInPullRequestsFromSameRepo: false,
      enableDeploymentInPullRequests: false,
      rollingBuilds: false,
      alwaysBuildClosedPullRequests: false,
      tags: '',
      nuGetFeed: {
        id: 'test-proj-ikb41f0xwpjv',
        name: 'Project test-proj',
        accountId: 6789,
        projectId: 12345,
        publishingEnabled: false,
        created: '2016-09-21T00:08:26.9522633+00:00'
      },
      securityDescriptor: {
        accessRightDefinitions: [
          {
            name: 'View',
            description: 'View'
          },
          {
            name: 'RunBuild',
            description: 'Run build'
          },
          {
            name: 'Update',
            description: 'Update settings'
          },
          {
            name: 'Delete',
            description: 'Delete project'
          }
        ],
        roleAces: [
          {
            roleId: 11111,
            name: 'Administrator',
            isAdmin: true,
            accessRights: [
              {
                name: 'View',
                allowed: true
              },
              {
                name: 'RunBuild',
                allowed: true
              },
              {
                name: 'Update',
                allowed: true
              },
              {
                name: 'Delete',
                allowed: true
              }
            ]
          },
          {
            roleId: 22222,
            name: 'User',
            isAdmin: false,
            accessRights: [
              {
                name: 'View'
              },
              {
                name: 'RunBuild'
              },
              {
                name: 'Update'
              },
              {
                name: 'Delete'
              }
            ]
          }
        ]
      },
      created: '2016-09-21T00:08:25.2289648+00:00',
      updated: '2016-09-21T00:29:31.1506705+00:00'
    },
    build: {
      buildId: 9876543,
      jobs: [
        {
          jobId: 'xu2z04xk4xjdtm3i',
          name: 'Platform: x86',
          allowFailure: false,
          messagesCount: 0,
          compilationMessagesCount: 0,
          compilationErrorsCount: 0,
          compilationWarningsCount: 0,
          testsCount: 0,
          passedTestsCount: 0,
          failedTestsCount: 0,
          artifactsCount: 0,
          status: 'success',
          started: '2016-11-16T20:42:09.1953605+00:00',
          finished: '2016-11-16T20:42:32.2101666+00:00',
          created: '2016-11-16T20:42:01.183924+00:00',
          updated: '2016-11-16T20:42:32.2257992+00:00'
        },
        {
          jobId: 'u4c732mxowrfkwaq',
          name: 'Platform: amd64',
          allowFailure: false,
          messagesCount: 0,
          compilationMessagesCount: 0,
          compilationErrorsCount: 0,
          compilationWarningsCount: 0,
          testsCount: 0,
          passedTestsCount: 0,
          failedTestsCount: 0,
          artifactsCount: 0,
          status: 'success',
          started: '2016-11-16T20:42:38.1432759+00:00',
          finished: '2016-11-16T20:42:59.2526017+00:00',
          created: '2016-11-16T20:42:01.5433296+00:00',
          updated: '2016-11-16T20:42:59.2682185+00:00'
        }
      ],
      buildNumber: 63,
      version: '0.0.63',
      message: 'test commit messages',
      messageExtended: 'test commit extended message',
      branch: 'master',
      isTag: false,
      commitId: '123098123a941928301820ef938ab2c123572909',
      authorName: 'Test Author',
      authorUsername: 'test-author-user',
      committerName: 'Test Committer',
      committerUsername: 'test-committer-user',
      committed: '2016-11-16T20:38:38+00:00',
      messages: [],
      status: 'success',
      started: '2016-11-16T20:42:09.2109847+00:00',
      finished: '2016-11-16T20:42:59.486954+00:00',
      created: '2016-11-16T20:41:59.1683638+00:00',
      updated: '2016-11-16T20:42:59.486954+00:00'
    }
  };
  assignUpdate(projectBuild.project, options);
  assignUpdate(projectBuild.build, options);
  projectBuild.build.jobs.forEach(function(job) {
    assignUpdate(job, options);
  });
  return projectBuild;
};

exports.getStatusBadge = function getStatusBadge(status) {
  if (!badgeData) {
    var badgeDataPath = path.join(__dirname, '..', 'test-data', 'badge.svg');
    badgeData =
      fs.readFileSync(badgeDataPath, {encoding: 'utf-8'});
  }

  return badgeData.replace(/\bpassing\b/g, status);
};
