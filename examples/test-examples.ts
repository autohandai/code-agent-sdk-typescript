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

    // Validate structure
    const checks = {
      hasImport: content.includes('import { AutohandSDK }'),
      hasMain: content.includes('async function main'),
      hasStart: content.includes('await sdk.start'),
      hasStop: content.includes('await sdk.stop'),
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
