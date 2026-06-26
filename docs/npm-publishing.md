# npm Publishing

The TypeScript SDK validates, tests, canary-publishes, and releases the public npm package `@autohandai/agent-sdk` from GitHub Actions.

## Publishing Authentication

The release workflows use npm Trusted Publishing through GitHub OIDC instead of a long-lived npm token.

Configure a trusted publisher for `@autohandai/agent-sdk` in npm package settings:

- Publisher: GitHub Actions
- Organization or user: `autohandai`
- Repository: `code-agent-sdk-typescript`
- Workflow file: `.github/workflows/release.yml`
- Allowed action: `npm publish`

The manual `Package CI and npm release` publish modes also use OIDC. If those recovery paths need to publish directly, add `.github/workflows/publish-npm.yml` as a trusted publisher too.

## Release Creation

Use the `Release SDK` workflow to ship a new public version.

The workflow:

1. Restores the bundled CLI binaries from Git LFS.
2. Bumps `package.json` and `package-lock.json` using either an explicit version or a patch, minor, major, or prerelease bump.
3. Runs the package validation gate.
4. Builds the npm tarball, verifies that `README.md` is present, and uploads the tarball plus SHA-256 checksum to the GitHub release.
5. Commits the version bump, tags `vX.Y.Z`, pushes both to `main`, and creates the GitHub release.
6. Publishes the same packed tarball to npm with provenance.

## Workflow Modes

The `Package CI and npm release` workflow supports four manual modes:

- `validate`: audits production dependencies, typechecks, lints, builds, verifies Git LFS CLI assets, previews the npm package, and checks the package size budget.
- `test`: runs everything in `validate`, then runs unit tests, example validation, and example compilation.
- `canary`: runs `validate` and `test`, creates a temporary `X.Y.Z-canary.RUN.shaSHA` package version, and publishes it under the `canary` dist-tag.
- `release`: runs `validate` and `test`, verifies the package version is unpublished, and publishes the current package version to npm.

Pull requests and pushes to `main` automatically run validation and tests without publishing credentials.

Dependabot is configured for npm dependencies and GitHub Actions. Its pull requests run the same validation and test gates, and dependency-update PRs also build and upload a short-lived npm package artifact so the updated dependency set is inspectable before merge. Release runs build the packed npm tarball, upload it with a SHA-256 checksum, and publish that exact artifact to npm.

## Release Flow

1. Run `Release SDK` from the Actions tab.
2. Choose a bump type or provide an explicit version.
3. Select the npm dist-tag. Prerelease runs automatically switch `latest` to `next`.
4. Wait for it to create the version commit, tag, GitHub release, npm tarball, checksum, and npm publish.

Prerelease GitHub releases publish under the `next` npm dist-tag. Normal GitHub releases publish under `latest`.

The workflow also restores Git LFS assets and fails before publishing if any bundled CLI file is still a Git LFS pointer instead of a real binary. The packed npm tarball must stay under the 250 MiB release budget.

## Manual Publishing

The workflow can also be run manually from the Actions tab. Manual `release` mode uses the current `package.json` version and the selected npm dist-tag. Manual `canary` mode does not change git history; it creates a temporary prerelease package version inside the workflow run.

Publishing modes require npm Trusted Publishing to be configured for the workflow that performs the publish. `validate` and `test` modes do not require npm publishing credentials.

## Validation Gate

Publishing runs the package's existing production gate:

```bash
bun run prepublishOnly
```

That command currently performs type checking, unit tests, build, and lint before npm publish can proceed.
