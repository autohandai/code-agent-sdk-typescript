// Load config from file (supports JSON, TOML, YAML)
import { AutohandSDK } from '../src/index.js';
import {
  loadConfigFrom,
  loadWorkspaceConfig,
  detectProviderFromModel,
  ProviderName,
  // New types for permissions, skills, context, session, and AGENTS.md
  type PermissionSettings,
  type SkillSettings,
  type ContextSettings,
  type SessionSettings,
  type AgentsMdSettings,
} from '../src/index.js';

async function main(): Promise<void> {
  try {
    // Option 1: Load config from file
    // const config = await loadConfigFrom('~/.autohand/config.json');
    // const sdk = new AutohandSDK(config);

    // Option 2: Load workspace config (merges with global config if available)
    // const config = await loadWorkspaceConfig();
    // const sdk = new AutohandSDK(config);

    // Option 3: Use inline configuration with new features
    const model = 'z-ai/glm-4.5-air:free';
    const detectedProvider = detectProviderFromModel(model);
    console.log(`Detected provider: ${detectedProvider}`);

    // Configure permissions (CLI-3 compatible)
    const permissions: PermissionSettings = {
      mode: 'interactive', // 'interactive' | 'unrestricted' | 'restricted' | 'external'
      allowList: ['read_file', 'write_file', 'git_status'],
      denyList: ['delete_path', 'run_command'],
      allowPatterns: ['git *', 'npm install'],
      denyPatterns: ['rm -rf', 'sudo'],
    };

    // Configure skills
    const skills: SkillSettings = {
      autoSkill: true,
      skills: ['typescript', 'react', 'git'],
      sources: ['autohand-user', 'autohand-project', 'community'],
      installMissing: true,
    };

    // Configure context management
    const context: ContextSettings = {
      contextCompact: true,
      maxTokens: 128000,
      compressionThreshold: 0.7,
      summarizationThreshold: 0.9,
    };

    // Configure session management
    const session: SessionSettings = {
      persistSession: true,
      resume: false,
      sessionPath: './.autohand/sessions',
      autoSaveInterval: 60,
    };

    // Configure AGENTS.md
    const agentsMd: AgentsMdSettings = {
      enable: true,
      create: true,
      path: './AGENTS.md',
      autoUpdate: true,
      includeTechStack: true,
      includeCommands: true,
      includeSkills: true,
      includeConventions: true,
    };

    const sdk = new AutohandSDK({
      cwd: '.',
      // CLI binary is auto-detected from bundled binaries based on platform/arch
      // For local development, override: cliPath: '/path/to/dev/autohand'
      autoMode: true,
      unrestricted: true,
      autoCommit: false,
      appendSystemPrompt: 'You are helping validate the TypeScript SDK public API.',
      model,
      // Provider is auto-detected from model ID, but can be explicitly set:
      // provider: 'zai',
      temperature: 0.7,
      // Provider-specific options:
      apiKey: process.env.OPENROUTER_API_KEY, // For cloud providers
      // New SDK features:
      permissions,
      skills,
      context,
      session,
      agentsMd,
      // OpenAI-specific options:
      // reasoningEffort: 'high', // For o1 models
      // Azure-specific options:
      // azureAuthMethod: 'api-key',
      // azureTenantId: 'your-tenant-id',
      // azureClientId: 'your-client-id',
      // azureClientSecret: 'your-client-secret',
    });

    await sdk.start();
    console.log('✓ SDK started');

    // Get session metadata
    const metadata = await sdk.getSessionMetadata();
    console.log('Session ID:', metadata.sessionId);
    console.log('Project:', metadata.projectName);
    console.log('Model:', metadata.model);

    // Get session stats
    const stats = await sdk.getStats();
    console.log('Initial stats:', stats);

    // Demonstrate AGENTS.md loading
    try {
      // Check if AGENTS.md exists and load it
      const agentsContent = await sdk.loadAgentsMd('./AGENTS.md');
      console.log('✓ Loaded AGENTS.md');
      console.log('Content preview:', agentsContent.substring(0, 200) + '...');
    } catch {
      // Create default AGENTS.md if it doesn't exist
      const template = sdk.createDefaultAgentsMd('My Project');
      console.log('✓ Created default AGENTS.md template');
      console.log('Template:', template.substring(0, 200) + '...');
    }

    // Stream prompt
    for await (const event of sdk.streamPrompt({ message: 'Hello, what can you help me with today?' })) {
      if (event.type === 'message_update') {
        process.stdout.write(event.delta ?? '');
      } else if (event.type === 'tool_start') {
        console.log(`\n[Tool: ${event.toolName}]`);
      }
    }
    console.log('\n');

    // Get updated stats after the prompt
    const finalStats = await sdk.getStats();
    console.log('Final stats:', finalStats);

    // Save session manually
    await sdk.saveSession();
    console.log('✓ Session saved');

    await sdk.stop();
    console.log('✓ SDK stopped');

    // Demonstrate session resumption
    console.log('\n--- Session Resumption Demo ---');
    const resumedSdk = new AutohandSDK({
      session: {
        sessionId: metadata.sessionId,
        resume: true,
        persistSession: true,
      },
    });

    await resumedSdk.resumeSession(metadata.sessionId);
    console.log('✓ Resumed session:', metadata.sessionId);

    // Continue the conversation
    for await (const event of resumedSdk.streamPrompt({ message: 'What was my previous message?' })) {
      if (event.type === 'message_update') {
        process.stdout.write(event.delta ?? '');
      }
    }
    console.log('\n');

    await resumedSdk.stop();
    console.log('✓ Resumed session stopped');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
