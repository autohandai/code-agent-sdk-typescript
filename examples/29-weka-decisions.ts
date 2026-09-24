import { WekaClient } from '@autohandai/agent-sdk';

async function main(): Promise<void> {
  try {
    const weka = new WekaClient();
    const questions = {
      release_lane: {
        type: 'choice',
        instructions: 'Choose the safest release lane.',
        criteria: {
          stable: 'Required checks passed and the expected impact is low.',
          canary: 'Checks passed but the change needs a limited rollout.',
          blocked: 'A required check failed or evidence is missing.',
        },
      },
      risk: {
        type: 'score',
        instructions: 'Score the release risk against these ordered anchors.',
        criteria: ['Low risk', 'Material risk', 'Severe risk'],
      },
    } as const;

    const result = await weka.decide({
      model: 'weka',
      state: {
        tests: 'passed',
        changedSystems: ['checkout'],
        recentIncidents: 1,
      },
      questions,
    });

    console.log(result.answers.release_lane.choice);
    console.log(result.answers.risk.score);
  } catch (error) {
    console.error('Weka decision failed:', error);
    process.exitCode = 1;
  }
}

void main();
