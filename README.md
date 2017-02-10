AppVeyor Status
===============

[![Build Status: Linux](https://img.shields.io/travis/kevinoid/appveyor-status.svg?style=flat&label=build+on+linux)](https://travis-ci.org/kevinoid/appveyor-status)
[![Build Status: Windows](https://img.shields.io/appveyor/ci/kevinoid/appveyor-status.svg?style=flat&label=build+on+windows)](https://ci.appveyor.com/project/kevinoid/appveyor-status)
[![Coverage](https://img.shields.io/codecov/c/github/kevinoid/appveyor-status.svg?style=flat)](https://codecov.io/github/kevinoid/appveyor-status?branch=master)
[![Dependency Status](https://img.shields.io/david/kevinoid/appveyor-status.svg?style=flat)](https://david-dm.org/kevinoid/appveyor-status)
[![Supported Node Version](https://img.shields.io/node/v/appveyor-status.svg?style=flat)](https://www.npmjs.com/package/appveyor-status)
[![Version on NPM](https://img.shields.io/npm/v/appveyor-status.svg?style=flat)](https://www.npmjs.com/package/appveyor-status)

A command-line tool and library for querying the
[AppVeyor](https://www.appveyor.com/) build status of a project using the
AppVeyor REST API.  It does for AppVeyor what
[travis-status](https://github.com/kevinoid/travis-status) does for [Travis
CI](https://travis-ci.org/).

## Introductory Example

    $ npm install -g appveyor-status
    $ appveyor-status
    AppVeyor build status: success

## Features

* Can query by AppVeyor project name, webhook ID, or repository URL or path.
* Can detect the AppVeyor project from the repository in which it is run when
  project is not specified.
* Can query using status badge API or project build API, minimizing latency and
  avoiding authentication in most cases.
* Can query most recent build for project or specific branch.
* Can compare build commit against a named or current commit.
* Can wait for queued build to finish, with configurable timeout, before
  reporting status.

## Installation

[This package](https://www.npmjs.com/package/appveyor-status) can be
installed using [npm](https://www.npmjs.com/), either globally or locally, by
running:

```sh
npm install appveyor-status
```

## Recipes

### Check status before release

To check that the build for the current commit is successful before releasing
it as a new version, add the following to `package.json`:

```json
{
  "scripts": {
    "preversion": "appveyor-status -c -w"
  }
}
```

This will check that the AppVeyor status for the current repository is "success"
(and will wait if queued) and that it matches the current commit.  It will
print the build status (which can be suppressed with `-q`) and exit with code
0 if "success" and a non-zero code otherwise, which will stop the version task.

API examples can be found in the [test
specifications](https://kevinoid.github.io/appveyor-status/spec).

## API Docs

To use this module as a library, see the [API
Documentation](https://kevinoid.github.io/appveyor-status/api).

Command-line usage information is available via `--help`:

```sh
appveyor-status --help
```

## Contributing

Contributions are welcome and very much appreciated!  Please add tests to
cover any changes and ensure `npm test` passes.

If the desired change is large, complex, backwards-incompatible, can have
significantly differing implementations, or may not be in scope for this
project, opening an issue before writing the code can avoid frustration and
save a lot of time and effort.

## License

This package is available under the terms of the
[MIT License](https://opensource.org/licenses/MIT).
