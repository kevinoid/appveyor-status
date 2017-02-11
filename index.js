/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var CommitMismatchError = require('./lib/commit-mismatch-error');
var SwaggerClient = require('swagger-client');
var appveyorSwagger = require('appveyor-swagger');
var appveyorUtils = require('./lib/appveyor-utils');
var assign = require('object-assign');
var backoff = require('backoff');
var gitUtils = require('./lib/git-utils');
var nodeify = require('promise-nodeify');

/** Shallow, strict equality of properties in common between two objects.
 * @param {!Object} obj1 Object to compare.
 * @param {!Object} obj2 Object to compare.
 * @return {boolean} <code>true</code> if the own-properties in common between
 * <code>obj1</code> and <code>obj2</code> are strictly equal.
 * @private
 */
function shallowStrictCommonEqual(obj1, obj2) {
  return Object.keys(obj1).every(function(key) {
    return !hasOwnProperty.call(obj2, key) || obj1[key] === obj2[key];
  });
}


/** Gets JSON body of a SwaggerClient response as an Object.
 * @param {!Object} response SwaggerClient response object.
 * @return {!Object} JSON-decoded body of response.
 * @throws {Error} If the response does not contain JSON or can not be decoded.
 * @private
 */
function getResponseJson(response) {
  if (response.obj === null || response.obj === undefined) {
    try {
      response.obj = JSON.parse(response.data);
    } catch (errJson) {
      var err = new Error('Unable to parse JSON from ' + response.method + ' ' +
                          response.url + ' with Content-Type ' +
                          response.headers['content-type'] + ': ' +
                          errJson.message);
      err.cause = errJson;
      throw err;
    }
  }

  return response.obj;
}

/** Gets SVG body of a SwaggerClient response as a string.
 * @param {!Object} response SwaggerClient response object.
 * @return {string} SVG body of response.
 * @throws {Error} If the response does not contain SVG.
 * @private
 */
function getResponseSvg(response) {
  var contentType =
    (response.headers['content-type'] || '(none)').toLowerCase();
  var svgType = 'image/svg+xml';
  if (contentType.lastIndexOf(svgType, 0) !== 0) {
    throw new Error('Expected ' + svgType + ' got ' + contentType);
  }

  return response.data.toString();
}

/** Makes a function to handle SwaggerClient error responses for an operation.
 * @param {string} opDesc Description of the operation which caused the error.
 * @return {function(Object): Promise} Function which creates an Error from the
 * SwaggerClient result object and returns a rejected Promise with the error.
 * @private
 */
function makeClientErrorHandler(opDesc) {
  return function responseToClientError(result) {
    var message = 'Unable to ' + opDesc;

    // SuperAgent Error object
    var errHttp =
      result.errObj && result.errObj.response && result.errObj.response.error;
    if (errHttp && errHttp.message) {
      message += ': ' + errHttp.message;
    } else if (result.errObj && result.errObj.message) {
      // Node http Error object
      message += ': ' + result.errObj.message;
    }

    // Parsed JSON response body
    if (result.obj && result.obj.message) {
      message += ': ' + result.obj.message;
    }

    var err = new Error(message);
    err.body = result.obj;
    assign(err, errHttp);
    return Promise.reject(err);
  };
}

/** Options for {@link appveyorStatus} functions.
 *
 * @typedef {{
 *   appveyorClient: SwaggerClient|Promise<SwaggerClient>|undefined,
 *   branch: string|boolean|undefined,
 *   commit: string|undefined,
 *   err: stream.Writable|undefined,
 *   out: stream.Writable|undefined,
 *   project: string|undefined,
 *   repo: string|undefined,
 *   requestOpts: Object|undefined,
 *   token: string|undefined,
 *   verbosity: number|undefined,
 *   wait: number|undefined,
 *   webhookId: string|undefined
 * }} AppveyorStatusOptions
 * @property {(SwaggerClient|Promise<SwaggerClient>)=} appveyorClient client
 * used to query the AppVeyor API.  Must be constructed with usePromise: true.
 * @property {(string|boolean)=} branch query latest build for named branch,
 * or the current branch
 * @property {string=} commit require build to be for a specific commit.
 * Named commits are resolved in <code>options.repo</code> or current dir.
 * (requires token)
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 * @property {(string|Project)=} project AppVeyor project to query (default:
 * auto-detect) (exclusive with repo and webhookId)
 * @property {string=} repo repository to query (as
 * {bitbucket,github}/$user/$proj) (default: auto-detect)
 * (exclusive with project and webhookId)
 * @property {Object=} requestOpts Options for AppVeyor API requests (suitable
 * for the {@link https://www.npmjs.com/package/request request module}).
 * Callers are encouraged to pass the <code>agent</code> or
 * <code>forever</code> options to leverage TCP keep-alive across requests.
 * @property {string=} token access token to use (ignored if appveyorClient is
 * set).
 * @property {number=} verbosity Amount of diagnostic information to print
 * (0 is default, larger yields more output).
 * @property {number=} wait poll build when status is queued up to wait time
 * (in milliseconds).  If wait time is reached, last queued status is returned.
 * (default: no polling)
 * @property {string=} webhookId webhook ID to query (default: auto-detect)
 * (exclusive with project and repo)
 */
// var AppveyorStatusOptions;

/** Checks and canonicalizes a caller-provided options object so that it
 * contains required information in the expected form.
 * @param {AppveyorStatusOptions=} options Caller-provided options.
 * @return {!AppveyorStatusOptions} <code>options</code> in canonical form with
 * default values applied.
 * @throws {Error} If <code>options</code> is invalid, inconsistent, or can not
 * be canonicalized.
 * @private
 */
function canonicalizeOptions(options) {
  if (options !== undefined && typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }

  if (options) {
    var projectOpts = ['project', 'repo', 'webhookId']
      .filter(function(propName) {
        return options[propName];
      });
    if (projectOpts.length > 1) {
      throw new Error(
        projectOpts.join(' and ') + ' can not be specified together'
      );
    }
  }

  options = assign({}, options);

  options.err = options.err || process.stderr;
  if (!options.err || typeof options.err.write !== 'function') {
    throw new TypeError('options.err must be a stream.Writable');
  }

  options.wait = Number(options.wait || 0);
  if (isNaN(options.wait)) {
    throw new TypeError('options.wait must be a number');
  }
  if (options.wait < 0) {
    throw new TypeError('options.wait must be non-negative');
  }

  if (typeof options.project === 'string') {
    options.project = appveyorUtils.projectFromString(options.project);
  } else if (options.project &&
             (!options.project.accountName || !options.project.slug)) {
    throw new Error('options.project must have accountName and slug');
  }

  var gitOptions = {};
  if (options.repo && gitUtils.gitUrlIsLocalNotSsh(options.repo)) {
    gitOptions.cwd = options.repo;
  }

  // If project, repo, and webhookId are unspecified, use repo in current dir
  if (!options.project && !options.repo && !options.webhookId) {
    options.repo = '.';
  }

  var branchP = options.branch === true ? gitUtils.getBranch(gitOptions) :
    options.branch ? Promise.resolve(options.branch) :
    null;

  var remoteUrlP;
  if (options.repo && gitUtils.gitUrlIsLocalNotSsh(options.repo)) {
    // Use user-requested branch with default of current branch
    var branchForRemoteP = branchP || gitUtils.getBranch(gitOptions);
    remoteUrlP = branchForRemoteP
      .then(function(branch) {
        return gitUtils.getRemote(branch, gitOptions);
      })
      .catch(function(err) {
        if (options.verbosity > 0) {
          options.err.write('DEBUG: Unable to get remote: ' + err + '\n' +
                            'DEBUG: Will try to use origin remote.\n');
        }
        return 'origin';
      })
      .then(function(remote) {
        return gitUtils.getRemoteUrl(remote, gitOptions);
      });
  }

  var appveyorClientP = options.appveyorClient;
  if (!appveyorClientP) {
    var appveyorClientOptions = {
      spec: appveyorSwagger,
      usePromise: true
    };
    if (options.token) {
      appveyorClientOptions.authorizations = {
        apiToken: new SwaggerClient.ApiKeyAuthorization(
          'Authorization',
          'Bearer ' + options.token,
          'header'
        )
      };
    }
    // Note: With usePromise: true the constructor returns a Promise for the
    // SwaggerClient rather than the SwaggerClient instance.
    appveyorClientP = new SwaggerClient(appveyorClientOptions);
  }

  var commitP;
  if (options.commit) {
    commitP = /^[0-9a-f]{40}$/i.test(options.commit) ?
      Promise.resolve(options.commit.toLowerCase()) :
      gitUtils.resolveCommit(options.commit, gitOptions);
  }

  return Promise.all([
    appveyorClientP,
    branchP,
    commitP,
    remoteUrlP || options.repo
  ])
    .then(function(results) {
      options.appveyorClient = results[0];
      options.branch = results[1];
      options.commit = results[2];
      options.repo = results[3];
      return options;
    });
}

/** Wraps a function exposed as part of the module API with argument checking,
 * option canonicalization, and callback support.
 * @ template T
 * @param {function(AppveyorStatusOptions=, function(Error, T=)): Promise<T>}
 * apiFunc API function to wrap.
 * @return {function(AppveyorStatusOptions=, function(Error, T=)): Promise<T>}
 * Function which calls {@link canonicalizeOptions} on its argument and passes
 * the result to <code>apiFunc</code>.
 * @throws {TypeError} If callback argument passed to wrapped function is not
 * a function.
 * @private
 */
function wrapApiFunc(apiFunc) {
  return function apiFunctionWrapper(options, callback) {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = null;
    }

    if (callback && typeof callback !== 'function') {
      throw new TypeError('callback must be a function');
    }

    var resultP = canonicalizeOptions(options).then(apiFunc);
    return nodeify(resultP, callback);
  };
}

/** Gets the last build and checks that the commit matches
 * <code>options.commit</code>, ignores <code>options.wait</code>.
 * @param {!AppveyorStatusOptions} options Options.
 * @return {Promise<!ProjectBuild>} The AppVeyor last build or an error if the
 * build can not be fetched or does not match <code>options.commit</code>.
 * @private
 */
function getLastBuildNoWait(options) {
  var lastBuildP;
  if (options.useProjectBuilds && options.project.builds) {
    lastBuildP = Promise.resolve({
      project: options.project,
      build: options.project.builds[0]
    });
  } else {
    var params = {
      accountName: options.project.accountName,
      projectSlug: options.project.slug
    };

    var client = options.appveyorClient;
    var responseP;
    if (options.branch) {
      params.buildBranch = options.branch;
      responseP = client.Project.getProjectLastBuildBranch(params);
    } else {
      responseP = client.Project.getProjectLastBuild(params);
    }

    lastBuildP = responseP
      .then(getResponseJson, makeClientErrorHandler('get last project build'));
  }

  var checkedLastBuildP;
  if (options.commit) {
    checkedLastBuildP = lastBuildP.then(function(projectBuild) {
      if (projectBuild.build.commitId !== options.commit) {
        var err = new CommitMismatchError({
          actual: projectBuild.build.commitId,
          expected: options.commit
        });
        err.build = projectBuild.build;
        err.project = projectBuild.project;
        throw err;
      }
      return projectBuild;
    });
  } else {
    checkedLastBuildP = lastBuildP;
  }

  return checkedLastBuildP;
}

/** Error returned by getLastBuildNoQueued if the last build has status
 * 'queued'.
 * @const
 * @private
 */
var errIsQueued = new Error('queued');

/** Gets the last build and checks that the commit matches
 * <code>options.commit</code>, ignores <code>options.wait</code>, returns
 * {@link errIsQueued} if queued.
 * @param {!AppveyorStatusOptions} options Options.
 * @param {function(Error, ProjectBuild=)} callback Callback for the AppVeyor
 * last build or an Error if the build can not be fetched or does not match
 * <code>options.commit</code> or status is 'queued'.
 * @private
 */
function getLastBuildNoQueued(options, callback) {
  getLastBuildNoWait(options)
    .then(
      function checkIsQueued(projectBuild) {
        // Clear useProjectBuilds so any retry will get fresh data
        delete options.useProjectBuilds;

        callback(
          appveyorUtils.projectBuildToStatus(projectBuild) === 'queued' ?
            errIsQueued :
            null,
          projectBuild
        );
      },
      callback
    );
}

/** Implements {@link getLastBuild} for options with non-null .project.
 * @param {!AppveyorStatusOptions} options Options object with non-null
 * .project.
 * @return {!Promise<!ProjectBuild>} Last AppVeyor build for project.
 * @private
 */
function getLastBuildForProject(options) {
  if (!options.wait) {
    return getLastBuildNoWait(options);
  }

  return new Promise(function(resolve, reject) {
    var call = backoff.call(
      getLastBuildNoQueued,
      options,
      function(err, lastBuild) {
        if (err && err !== errIsQueued) {
          reject(err);
        } else {
          resolve(lastBuild);
        }
      }
    );
    call.setStrategy(new backoff.ExponentialStrategy({
      initialDelay: 4000,
      maxDelay: 60000
    }));
    call.retryIf(function(err) { return err === errIsQueued; });
    call.failAfterTime(options.wait);
    call.start();
  });
}

/** Gets the AppVeyor project which matches the given options.
 * @param {!Object} options Options, which must include .repo or .webhookId.
 * @return {!Promise<!Project>} AppVeyor project with the same repository
 * or webhookId as <code>options</code> or an Error if there is no single
 * project which matches or another error occurs.
 * @private
 */
function getMatchingProject(options) {
  return options.appveyorClient.Project.getProjects()
    .then(getResponseJson, makeClientErrorHandler('get projects'))
    .then(function(projects) {
      if (options.repo) {
        var avRepo = appveyorUtils.parseAppveyorRepoUrl('git', options.repo);

        var repoProjects = projects.filter(function(project) {
          return shallowStrictCommonEqual(avRepo, project);
        });

        if (repoProjects.length === 0) {
          throw new Error('No AppVeyor projects matching ' +
                          JSON.stringify(avRepo));
        } else if (repoProjects.length > 1) {
          throw new Error('Multiple AppVeyor projects matching ' +
                          JSON.stringify(avRepo) + ': ' +
                          repoProjects
                            .map(appveyorUtils.projectToString)
                            .join(', '));
        }

        return repoProjects[0];
      }

      if (options.webhookId) {
        var webhookProjects = projects.filter(function(project) {
          return project.webhookId === options.webhookId;
        });

        if (webhookProjects.length === 0) {
          throw new Error('No AppVeyor projects with webhookId ' +
                          options.webhookId);
        } else if (webhookProjects.length > 1) {
          throw new Error('Multiple AppVeyor projects with webhookId ' +
                          options.webhookId + ': ' +
                          webhookProjects
                            .map(appveyorUtils.projectToString)
                            .join(', '));
        }

        return webhookProjects[0];
      }

      throw new Error('Internal Error: No repo or webhookId to match!?');
    });
}

/** Implements {@link getLastBuild}.
 * @param {!AppveyorStatusOptions} options Options.
 * @private
 */
function getLastBuildInternal(options) {
  if (options.project) {
    return getLastBuildForProject(options);
  }

  return getMatchingProject(options)
    .then(function(project) {
      var optionsWithProject = assign({}, options);
      optionsWithProject.project = project;
      optionsWithProject.useProjectBuilds = true;
      return getLastBuildForProject(optionsWithProject);
    });
}

/** Gets the last AppVeyor build for a repo/branch.
 *
 * @param {?AppveyorStatusOptions=} options Options.
 * @param {?function(Error, Object=)=} callback Callback function called
 * with the last build from the AppVeyor API, or an <code>Error</code> if it
 * could not be retrieved.
 * @return {!Promise<!Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the current build information from the AppVeyor
 * API, or <code>Error</code> if it could not be retrieved.
 * Otherwise <code>undefined</code>.
 */
exports.getLastBuild = wrapApiFunc(getLastBuildInternal);

/** Implements {@link getStatusBadge}.
 * @param {!AppveyorStatusOptions} options Options.
 * @private
 */
function getStatusBadgeInternal(options) {
  if (!options.repo && !options.webhookId) {
    // Note:  Could resolve project to either using getLastBuild(), but the
    // overhead is enough that it's better for the caller to do that if it is
    // what they really want to do.
    throw new Error('options.repo or options.webhookId is required');
  }

  var params = {
    // Match badge labels to API Status enumeration
    failingText: 'failed',
    passingText: 'success',
    pendingText: 'queued',
    svg: true
  };

  var client = options.appveyorClient;
  var responseP;
  if (options.webhookId) {
    params.webhookId = options.webhookId;

    if (options.branch) {
      params.buildBranch = options.branch;
      responseP = client.Project.getProjectBranchStatusBadge(params);
    } else {
      responseP = client.Project.getProjectStatusBadge(params);
    }
  } else {
    assign(params, appveyorUtils.repoUrlToBadgeParams('git', options.repo));
    if (options.branch) {
      params.branch = options.branch;
    }
    responseP = client.Project.getPublicProjectStatusBadge(params);
  }

  return responseP.then(
    getResponseSvg,
    makeClientErrorHandler('get project status badge')
  );
}

/** Gets the AppVeyor status badge for a repo/branch.
 *
 * @param {?AppveyorStatusOptions=} options Options.  Note that
 * {@link AppveyorStatusOptions.project} is not supported by this function.  To
 * get the status badge for a project, call this function using the
 * <code>webhookId</code> from the result of {@link getLastBuild}.
 * @param {?function(Error, Object=)=} callback Callback function called
 * with the last build from the AppVeyor API, or an <code>Error</code> if it
 * could not be retrieved.
 * @return {!Promise<!Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the current build information from the AppVeyor
 * API, or <code>Error</code> if it could not be retrieved.
 * Otherwise <code>undefined</code>.
 */
exports.getStatusBadge = wrapApiFunc(getStatusBadgeInternal);

/** Implements {@link getStatus}.
 * @param {!AppveyorStatusOptions} options Options.
 * @private
 */
function getStatusInternal(options) {
  if (options.commit || options.project) {
    // If AppVeyor project is known or commit checking is required, get build
    return getLastBuildInternal(options)
      .then(appveyorUtils.projectBuildToStatus);
  }

  // Otherwise get the status badge (which can resolve repo and webhookId in
  // single request without authentication)
  return getStatusBadgeInternal(options)
    .then(appveyorUtils.badgeToStatus);
}

/** Gets the current AppVeyor status of a repo/branch.
 *
 * @param {?AppveyorStatusOptions=} options Options.
 * @param {?function(Error, Object=)=} callback Callback function called
 * with the current build information from the AppVeyor API, or an
 * <code>Error</code> if it could not be retrieved.
 * @return {!Promise<!Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the current build information from the AppVeyor
 * API, or <code>Error</code> if it could not be retrieved.
 * Otherwise <code>undefined</code>.
 */
exports.getStatus = wrapApiFunc(getStatusInternal);
