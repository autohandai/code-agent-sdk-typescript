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
3. Resolves the previous stable tag, for example `v1.0.0` before `v1.0.1`.
4. Generates local release notes and prepends `CHANGELOG.md` from the previous-tag git diff.
5. Runs the package validation gate.
6. Builds the npm tarball and verifies that `README.md` and `CHANGELOG.md` are present.
7. Creates a detached release commit containing the generated version and changelog, tags it, and pushes only the tag to GitHub.
8. Creates or updates a draft GitHub release with the tarball, SHA-256 checksum, local notes, and GitHub-generated release notes pinned to the previous stable tag.
9. Publishes the same packed tarball to npm with provenance.
10. Publishes the GitHub release only after npm publishing succeeds.

Pushes to `main` automatically create bleeding-edge alpha releases from the latest stable base version, for example `v1.0.1-alpha.123.abcd123`, and publish them under the `alpha` npm dist-tag.

Manual runs create stable releases such as `v1.0.2` and publish them under the selected dist-tag, normally `latest`.

### Protected main branch

This repository has a protected `main` branch with pull-request and verified-signature requirements. The release workflow never pushes generated commits to that branch and therefore does not require a bypass-capable token. It creates the generated package-version and changelog commit in detached HEAD state, records that source and release metadata under an annotated tag, and pushes only the tag. The checked-out `main` commit remains unchanged.

The tag is pushed before the draft release and npm publication so repository permission failures cannot leave a public package without its source tag. If a later publishing step fails, rerun `Release SDK` with the explicit version and `publish_existing` enabled. Recovery accepts only an annotated, one-parent release commit whose parent is reachable from `origin/main` and whose diff is limited to `package.json`, `package-lock.json`, and `CHANGELOG.md`; it then validates the recorded version, rebuilds that tagged source, and skips duplicate npm publication when necessary.

npm provenance identifies the workflow trigger commit and ref. Because the generated release commit is created later inside that run, provenance does not claim that the detached tag itself triggered publication. The annotated tag records the generated package metadata and source, while the uploaded tarball checksum identifies the exact published artifact. A release policy requiring provenance to resolve directly to the tag must use a second publishing run triggered from that tag.

Curated GitHub release bodies live in `docs/releases/vX.Y.Z.md`. The `publish_existing` and `release_notes_only` modes prefer that versioned file when it exists; otherwise they generate notes from the exact preceding-stable-tag to requested-tag range.

## Workflow Modes

The `Package CI and npm release` workflow supports four manual modes:

- `validate`: audits production dependencies, typechecks, lints, builds, verifies Git LFS CLI assets, previews the npm package, and checks the package size budget.
- `test`: runs everything in `validate`, then runs unit tests, example validation, and example compilation.
- `canary`: runs `validate` and `test`, creates a temporary `X.Y.Z-canary.RUN.shaSHA` package version, and publishes it under the `canary` dist-tag.
- `release`: runs `validate` and `test`, verifies the package version is unpublished, and publishes the current package version to npm.

Pull requests and pushes to `main` automatically run validation and tests without publishing credentials.

Dependabot is configured for npm dependencies and GitHub Actions. Its pull requests run the same validation and test gates, and dependency-update PRs also build and upload a short-lived npm package artifact so the updated dependency set is inspectable before merge. Release runs build the packed npm tarball, upload it with a SHA-256 checksum, and publish that exact artifact to npm.

## Release Flow

For bleeding-edge alpha releases, merge or push to `main`. The release workflow leaves `main` unchanged and publishes the generated detached release commit under an alpha tag.

For a stable release:

1. Run `Release SDK` from the Actions tab.
2. Choose a stable bump type or provide an explicit version.
3. Select the npm dist-tag, normally `latest`.
4. Wait for it to create the detached version/changelog commit, annotated tag, draft GitHub release, npm tarball, checksum, npm publish, and final public GitHub release.
5. Verify that `main` was not mutated, the release tag contains the generated version, and npm/GitHub expose the same artifact version.

If a GitHub release already exists or a tagged release needs repair, rerun `Release SDK` with the explicit version and `publish_existing` enabled. The workflow checks out the existing tag and verifies its `package.json` version, skips the commit and tag steps, refreshes the GitHub release notes/assets from the previous stable tag, validates the package, publishes it only when npm does not already have it, and publishes the GitHub release.

To repair only the GitHub release notes for an older published tag, run `Release SDK` with `release_notes_only` enabled and provide the explicit version, for example `1.0.2`. That mode builds the commit range against the requested tag, refreshes the release body from its preceding stable tag, and does not change `package.json`, create a tag, build a package, or publish to npm.

Alpha releases publish under the `alpha` npm dist-tag. Manual stable releases normally publish under `latest`, or under the selected manual dist-tag.

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
