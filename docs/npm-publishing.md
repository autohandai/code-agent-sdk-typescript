# npm Publishing

The TypeScript SDK validates, tests, canary-publishes, and releases the public npm package `@autohandai/agent-sdk` from GitHub Actions.

## Required Secret

Add an npm automation token as a repository secret named `NPM_TOKEN`.

Use a token that can publish `@autohandai/agent-sdk`. For npm accounts with two-factor authentication enabled, use an automation token or a granular access token that supports automated package publishing.

Repository path:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Secret name:

`NPM_TOKEN`

## Workflow Modes

The `Package CI and npm release` workflow supports four manual modes:

- `validate`: audits production dependencies, typechecks, lints, builds, verifies Git LFS CLI assets, previews the npm package, and checks the package size budget.
- `test`: runs everything in `validate`, then runs unit tests, example validation, and example compilation.
- `canary`: runs `validate` and `test`, creates a temporary `X.Y.Z-canary.RUN.shaSHA` package version, and publishes it under the `canary` dist-tag.
- `release`: runs `validate` and `test`, verifies the package version is unpublished, and publishes the current package version to npm.

Pull requests and pushes to `main` automatically run validation and tests without requiring `NPM_TOKEN`.

## Release Flow

1. Update `package.json` and `package-lock.json` to the new version.
2. Commit and push the version change to `main`.
3. Create and publish a GitHub release tagged as either `vX.Y.Z` or `X.Y.Z`, matching the package version exactly.
4. The `Package CI and npm release` workflow validates the package, checks that the npm version is not already published, previews the packed files, and publishes with npm provenance.

Prerelease GitHub releases publish under the `next` npm dist-tag. Normal GitHub releases publish under `latest`.

The workflow also restores Git LFS assets and fails before publishing if any bundled CLI file is still a Git LFS pointer instead of a real binary. The packed npm tarball must stay under the 250 MiB release budget.

## Manual Publishing

The workflow can also be run manually from the Actions tab. Manual `release` mode uses the current `package.json` version and the selected npm dist-tag. Manual `canary` mode does not change git history; it creates a temporary prerelease package version inside the workflow run.

Publishing modes require the `NPM_TOKEN` secret. `validate` and `test` modes do not.

## Validation Gate

Publishing runs the package's existing production gate:

```bash
bun run prepublishOnly
```

That command currently performs type checking, unit tests, build, and lint before npm publish can proceed.
