/**
 * Unit tests for AGENTS.md helpers
 * Tests for loadAgentsMd and createDefaultAgentsMd functions
 */

import { describe, it, expect } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadAgentsMd, createDefaultAgentsMd } from '../types/index.js';

describe('AGENTS.md Helpers', () => {
  it('createDefaultAgentsMd returns default AGENTS.md content', () => {
    const defaultContent = createDefaultAgentsMd();
    
    expect(defaultContent).toBeDefined();
    expect(typeof defaultContent).toBe('string');
    expect(defaultContent).toContain('# Project Autopilot');
    expect(defaultContent).toContain('This file helps AI assistants');
  });

  it('createDefaultAgentsMd contains required sections', () => {
    const defaultContent = createDefaultAgentsMd();
    
    expect(defaultContent).toContain('## Tech Stack');
    expect(defaultContent).toContain('## Commands');
    expect(defaultContent).toContain('## Conventions');
    expect(defaultContent).toContain('## Skills');
  });

  it('loadAgentsMd loads AGENTS.md content from file path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'autohand-agents-md-'));
    const filePath = join(dir, 'AGENTS.md');
    await writeFile(filePath, '# Test Agents\n\nUse strict TypeScript.\n', 'utf-8');

    await expect(loadAgentsMd(filePath)).resolves.toBe('# Test Agents\n\nUse strict TypeScript.\n');
  });

  it('loadAgentsMd handles missing file gracefully', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'autohand-agents-md-'));
    await mkdir(join(dir, 'nested'));

    await expect(loadAgentsMd(join(dir, 'missing.md'))).rejects.toThrow('AGENTS.md not found');
  });
});
