# npm Publishing

The TypeScript SDK validates, tests, canary-publishes, and releases the public npm package `@autohandai/agent-sdk` from GitHub Actions.

## Publishing Authentication

The release workflows use the `NPM_TOKEN` repository secret when it is configured. The token must be a current npm token for a user with write/publish access to `@autohandai/agent-sdk`; for npm accounts with two-factor authentication enabled, use a granular access token with publish access and 2FA bypass for automation.

The workflows run `npm whoami` and a package access preflight before publishing. If npm returns `E404 Not Found` during publish for an existing scoped package, the token is authenticated but does not have write access to that package/scope.

The workflows also keep GitHub OIDC enabled so npm Trusted Publishing can be used instead of a token.

Configure a trusted publisher for `@autohandai/agent-sdk` in npm package settings:

- Publisher: GitHub Actions
- Organization or user: `autohandai`
- Repository: `code-agent-sdk-typescript`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

The manual `Package CI and npm release` publish modes also use OIDC. If those recovery paths need to publish directly, add `publish-npm.yml` as a trusted publisher too.

## Release Creation

The `Release SDK` workflow is the canonical release path.

The workflow:

1. Restores the bundled CLI binaries from Git LFS.
2. Resolves the next version.
3. Prepends `CHANGELOG.md` with generated release notes from git commits.
4. Runs the package validation gate.
5. Builds the npm tarball, verifies that `README.md` and `CHANGELOG.md` are present, and uploads the tarball plus SHA-256 checksum to the GitHub release.
6. Commits the version/changelog update and tags the release locally.
7. Publishes the same packed tarball to npm with provenance, then pushes the release commit/tag and creates the GitHub release.

Pushes to `main` automatically create bleeding-edge alpha releases from the latest stable base version, for example `v1.0.1-alpha.123.abcd123`, and publish them under the `alpha` npm dist-tag.

Manual runs create stable releases such as `v1.0.2` and publish them under the selected dist-tag, normally `latest`.

## Workflow Modes

The `Package CI and npm release` workflow supports four manual modes:

- `validate`: audits production dependencies, typechecks, lints, builds, verifies Git LFS CLI assets, previews the npm package, and checks the package size budget.
- `test`: runs everything in `validate`, then runs unit tests, example validation, and example compilation.
- `canary`: runs `validate` and `test`, creates a temporary `X.Y.Z-canary.RUN.shaSHA` package version, and publishes it under the `canary` dist-tag.
- `release`: runs `validate` and `test`, verifies the package version is unpublished, and publishes the current package version to npm.

Pull requests and pushes to `main` automatically run validation and tests without publishing credentials.

Dependabot is configured for npm dependencies and GitHub Actions. Its pull requests run the same validation and test gates, and dependency-update PRs also build and upload a short-lived npm package artifact so the updated dependency set is inspectable before merge. Release runs build the packed npm tarball, upload it with a SHA-256 checksum, and publish that exact artifact to npm.

## Release Flow

For bleeding-edge alpha releases, merge or push to `main`. The release workflow skips its own `chore(release): ...` commits to avoid a release loop.

For a stable release:

1. Run `Release SDK` from the Actions tab.
2. Choose a stable bump type or provide an explicit version.
3. Select the npm dist-tag, normally `latest`.
4. Wait for it to create the version commit, changelog entry, tag, GitHub release, npm tarball, checksum, and npm publish.

If a GitHub release already exists but npm publishing was blocked before upload, rerun `Release SDK` with `publish_existing` enabled. The version must match `package.json`, and the workflow will skip the commit, tag, and GitHub release creation steps while still validating and publishing the current package.

Prerelease GitHub releases publish under the `next` npm dist-tag. Normal GitHub releases publish under `latest`.

The workflow also restores Git LFS assets and fails before publishing if any bundled CLI file is still a Git LFS pointer instead of a real binary. The packed npm tarball must stay under the 250 MiB release budget.

## Manual Publishing

The workflow can also be run manually from the Actions tab. Manual `release` mode uses the current `package.json` version and the selected npm dist-tag. Manual `canary` mode does not change git history; it creates a temporary prerelease package version inside the workflow run.

Publishing modes require either a valid `NPM_TOKEN` secret or npm Trusted Publishing to be configured for the workflow that performs the publish. `validate` and `test` modes do not require npm publishing credentials.

## Validation Gate

Publishing runs the package's existing production gate:

```bash
bun run prepublishOnly
```

That command currently performs type checking, unit tests, build, and lint before npm publish can proceed.
