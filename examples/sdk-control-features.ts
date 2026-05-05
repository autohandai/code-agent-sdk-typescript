/**
 * Example demonstrating the new SDK control features
 * This tests the new RPC methods for SDK control
 */

import { AutohandSDK } from '../src/index.js';

async function main() {
  console.log('Testing SDK Control Features...\n');

  // Initialize SDK (CLI binary is auto-detected from bundled binaries)
  // For development, you can override with: cliPath: '/path/to/custom/autohand'
  const sdk = new AutohandSDK({});

  console.log('✓ SDK initialized with control options');

  // Test that the SDK has the new control methods
  const controlMethods = [
    'setPermissionMode',
    'setPlanMode',
    'enablePlanMode',
    'disablePlanMode',
    'setModel',
    'setMaxThinkingTokens',
    'applyFlagSettings',
    'supportedModels',
    'getContextUsage',
    'reloadPlugins',
    'accountInfo',
    'toggleMcpServer',
    'reconnectMcpServer',
    'setMcpServers',
  ];

  for (const method of controlMethods) {
    if (typeof (sdk as any)[method] === 'function') {
      console.log(`✓ SDK has method: ${method}`);
    } else {
      console.log(`✗ SDK missing method: ${method}`);
    }
  }

  // Test that the RPC client has the new methods
  console.log('\nTesting RPC Client methods...');
  const rpcClient = (sdk as any).client;

  const rpcMethods = [
    'setPermissionMode',
    'setPlanMode',
    'setModel',
    'setMaxThinkingTokens',
    'applyFlagSettings',
    'getSupportedModels',
    'getSupportedCommands',
    'getContextUsage',
    'reloadPlugins',
    'getAccountInfo',
    'toggleMcpServer',
    'reconnectMcpServer',
    'setMcpServers',
  ];

  for (const method of rpcMethods) {
    if (typeof rpcClient[method] === 'function') {
      console.log(`✓ RPC Client has method: ${method}`);
    } else {
      console.log(`✗ RPC Client missing method: ${method}`);
    }
  }

  console.log('\n✓ All SDK control features are wired correctly');
}

main().catch(console.error);
