import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function readRepositoryFile(path: string): string {
  return readFileSync(join(repositoryRoot, path), 'utf8');
}

describe('SDK release workflow', () => {
  it('builds historical notes from the requested tag and publishes GitHub only after npm', () => {
    const workflow = readRepositoryFile('.github/workflows/release.yml');

    expect(workflow).toContain('notes_target="HEAD"');
    expect(workflow).toContain('notes_target="$tag"');
    expect(workflow).toContain('range="${release_notes_previous_tag}..${notes_target}"');
    expect(workflow).toContain('curated_release_notes="docs/releases/${tag}.md"');
    expect(workflow).toContain("generate_release_notes: ${{ steps.release-notes.outputs.curated != 'true' }}");

    const prepareDraftIndex = workflow.indexOf('- name: Prepare draft GitHub release');
    const publishNpmIndex = workflow.indexOf('- name: Publish to npm');
    const publishGitHubIndex = workflow.indexOf('- name: Publish GitHub release');

    expect(prepareDraftIndex >= 0).toBe(true);
    expect(publishNpmIndex > prepareDraftIndex).toBe(true);
    expect(publishGitHubIndex > publishNpmIndex).toBe(true);
  });

  it('keeps notes-only and already-published recovery paths free of duplicate npm publishes', () => {
    const workflow = readRepositoryFile('.github/workflows/release.yml');

    expect(workflow).toContain('release_notes_only requires an explicit version');
    expect(workflow).toContain('skip_npm_publish=true');
    expect(workflow).toContain("steps.version.outputs.release_notes_only != 'true' && steps.publish-state.outputs.skip_npm_publish != 'true'");
  });

  it('documents the protected-main stable release path', () => {
    const publishingGuide = readRepositoryFile('docs/npm-publishing.md');

    expect(publishingGuide).toContain('protected `main`');
    expect(publishingGuide).toContain('publish_existing');
    expect(publishingGuide).toContain('release_notes_only');
  });

  it('stores curated notes for v1.0.2 and v1.0.3', () => {
    const version102 = readRepositoryFile('docs/releases/v1.0.2.md');
    const version103 = readRepositoryFile('docs/releases/v1.0.3.md');

    expect(version102).toContain('# Autohand Agent SDK v1.0.2');
    expect(version102).toContain('Replayable autoresearch');
    expect(version103).toContain('# Autohand Agent SDK v1.0.3');
    expect(version103).toContain('autoresearch ledger');
  });
});
