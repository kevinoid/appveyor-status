/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const appveyorSwagger = require('appveyor-swagger');
const arrayUniq = require('array-uniq');
const escapeStringRegexp = require('escape-string-regexp');
const gitUtils = require('./git-utils');

const badgeRepoProviderValues =
  appveyorSwagger.parameters.badgeRepoProvider.enum;
const statusValues = appveyorSwagger.definitions.Status.enum;
const statusRE = new RegExp(
  `\\b(${
    statusValues.map(escapeStringRegexp).join('|')
  })(?!\\w)`,
  'gi'
);

/** Extracts the status from an SVG AppVeyor status badge.
 * @param {string} badge SVG AppVeyor status badge.
 * @return {string} AppVeyor build status.
 * @throws {Error} if the status can not be extracted.
 * @private
 */
exports.badgeToStatus = function badgeToStatus(badge) {
  const statuses = arrayUniq(badge.match(statusRE));

  if (statuses.length !== 1) {
    const err = new Error(
      statuses.length === 0 ? 'Status not found in badge' :
        `Badge contained multiple statuses: ${statuses.join(', ')}`
    );
    err.badge = badge;
    throw err;
  }

  return statuses[0];
};

/** Extracts the status from an AppVeyor ProjectBuild object.
 * @param {!ProjectBuild} projectBuild AppVeyor ProjectBuild (e.g. from
 * getProjectLastBuild).
 * @return {string} AppVeyor build status.
 * @private
 */
exports.projectBuildToStatus = function projectBuildToStatus(projectBuild) {
  return projectBuild.build.status;
};

/** Parses a repository URL of a given type into the repository properties
 * present on an AppVeyor Project.
 * @param {string} repoUrl Repository URL or path.
 * @return {!{
 *  repositoryType: string,
 *  repositoryName: string
 * }} Repository properties extracted from the arguments.
 * @private
 */
exports.parseAppveyorRepoUrl = function parseAppveyorRepoUrl(repoUrl) {
  const repoUrlObj = gitUtils.parseGitUrl(repoUrl);
  const hostnameLower = repoUrlObj.hostname.toLowerCase();
  const pathnameNoExt = repoUrlObj.pathname.replace(/\.git$/, '');
  if (hostnameLower === 'bitbucket.org') {
    return {
      repositoryType: 'bitBucket',
      repositoryName: pathnameNoExt.slice(1)
    };
  }

  if (hostnameLower === 'github.com') {
    return {
      repositoryType: 'gitHub',
      repositoryName: pathnameNoExt.slice(1)
    };
  }

  if (hostnameLower === 'gitlab.com') {
    return {
      repositoryType: 'gitLab',
      repositoryName: pathnameNoExt.slice(1)
    };
  }

  // FIXME:  I can't test this without a paid AppVeyor account since all VSO
  // projects are private.
  const vsoHostParts = /^([^.]+)\.visualstudio.com$/i.exec(repoUrlObj.hostname);
  const vsoPathParts = /^(?:\/([^/]+))?\/_git\/([^/]+)$/.exec(pathnameNoExt);
  if (vsoHostParts && vsoPathParts) {
    const username = vsoHostParts[1];
    const vsoProject = vsoPathParts[1] || vsoPathParts[2];
    const vsoRepo = vsoPathParts[2];
    return {
      repositoryType: 'vso',
      repositoryName: `git/${username}/${vsoProject}/${vsoRepo}`
    };
  }

  return {
    repositoryName: repoUrl
  };
};

/** Builds AppVeyor status badge query parameters for for a repository URL of a
 * given type.
 * @param {string} repoUrl Repository URL.
 * @return {!{
 *  badgeRepoProvider: string,
 *  repoAccountName: string,
 *  repoSlug: string
 * }} AppVeyor status badge query parameters for the arguments.
 * @throws {Error} If the URL is not supported for status badge queries.
 * @private
 */
exports.repoUrlToBadgeParams = function repoUrlToBadgeParams(repoUrl) {
  const avRepo = exports.parseAppveyorRepoUrl(repoUrl);
  if (badgeRepoProviderValues.indexOf(avRepo.repositoryType) < 0) {
    throw new Error(
      `Repo status badges only supported for ${
        badgeRepoProviderValues.join(', ')} not ${avRepo.repositoryType}`
    );
  }

  const pathParts = avRepo.repositoryName.split('/');
  if (pathParts.length !== 2) {
    throw new Error(
      `Badge requires repo with 2 path parts.  Found ${pathParts.length}: ${
        avRepo.repositoryName}`
    );
  }

  return {
    badgeRepoProvider: avRepo.repositoryType,
    repoAccountName: pathParts[0],
    repoSlug: pathParts[1]
  };
};

/** Parses a project string (as it appears in AppVeyor URLs) into its
 * components, as they appear in an AppVeyor Project.
 * @param {string} projectStr Project string in the format {accountName}/{slug}.
 * @return {!{
 *  accountName: string,
 *  slug: string
 * }} AppVeyor project properties for <code>projectStr</code>.
 * @throws {Error} If <code>projectStr</code> does not match the required
 * format.
 * @private
 */
exports.projectFromString = function projectFromString(projectStr) {
  const projectParts = projectStr.split('/');
  if (projectParts.length !== 2) {
    throw new Error(`Invalid project "${projectStr}": Must have one "/"`);
  }
  return {
    accountName: projectParts[0],
    slug: projectParts[1]
  };
};

/** Stringifies an AppVeyor Project into a project string (as it appears in
 * AppVeyor URLs).
 * @param {!{
 *  accountName: string,
 *  slug: string
 * }} project AppVeyor project to stringify.
 * @return {string} Project string in the format {accountName}/{slug}.
 * @private
 */
exports.projectToString = function projectToString(project) {
  return `${project.accountName}/${project.slug}`;
};
