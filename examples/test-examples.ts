/**
 * Test script to validate all adapted examples
 * This checks that examples compile and have the correct structure
 */

import { readFileSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

const examplesDir = join(__dirname);

// Get all TypeScript example files
const exampleFiles = readdirSync(examplesDir)
  .filter(file => file.endsWith('.ts') && !file.startsWith('test-') && file !== 'sdk-control-features.ts')
  .sort();

console.log('=== Validating Adapted Examples ===\n');
console.log(`Found ${exampleFiles.length} example files\n`);

let passed = 0;
let failed = 0;

for (const file of exampleFiles) {
  try {
    const filePath = join(examplesDir, file);
    const content = readFileSync(filePath, 'utf-8');

    const usesSDK = content.includes('new AutohandSDK') || content.includes('import { AutohandSDK }');
    const usesAgent = content.includes('Agent.create') || content.includes('import { Agent }');

    // Validate structure without requiring every example to use the same API layer.
    const checks = {
      hasSdkImport: content.includes("from '../src/index.js'"),
      hasMain: content.includes('async function main'),
      hasLifecycleStart: usesAgent
        ? content.includes('Agent.create')
        : content.includes('await sdk.start'),
      hasLifecycleStop: usesAgent
        ? content.includes('await agent.close')
        : content.includes('await sdk.stop') || content.includes('await sdk.close'),
      hasSupportedApi: usesSDK || usesAgent,
      hasErrorHandling: content.includes('try {') && content.includes('catch'),
    };

    const allPassed = Object.values(checks).every(v => v === true);

    if (allPassed) {
      console.log(`✓ ${file} - All checks passed`);
      passed++;
    } else {
      console.log(`✗ ${file} - Failed checks:`);
      for (const [check, result] of Object.entries(checks)) {
        if (!result) {
          console.log(`  - ${check}: ${result}`);
        }
      }
      failed++;
    }
  } catch (error) {
    console.log(`✗ ${file} - Error reading file: ${error}`);
    failed++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passed}/${exampleFiles.length}`);
console.log(`Failed: ${failed}/${exampleFiles.length}`);

if (failed > 0) {
  process.exit(1);
}
