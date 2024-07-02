import * as core from '@actions/core';
import nconf from 'nconf';
import { CodeBuildJob } from './codebuildjob';

const config = nconf.env({
  separator: '__',
  parseValues: true,
  match: /^CODEBUILD__/,
});

const job = new CodeBuildJob({
  projectName: core.getInput('projectName'),
  ...JSON.parse(core.getInput('buildspec')),
  ...config.get('CODEBUILD'),
}, {
  buildStatusInterval: Number(core.getInput('buildStatusInterval') || '5000'),
  logsUpdateInterval: Number(core.getInput('logsUpdateInterval') || '5000'),
  waitToBuildEnd: !!core.getBooleanInput('waitToBuildEnd'),
  displayBuildLogs: !!core.getBooleanInput('displayBuildLogs'),
  redirectServiceURL: core.getInput('redirectServiceURL') || undefined,
});

job.startBuild().catch(error => core.setFailed(error as Error));

/**
 * Reaction to job cancellation
 * @see https://docs.github.com/en/actions/managing-workflow-runs/canceling-a-workflow
 */
process.on('SIGINT', async () => {
  try {
    await job.cancelBuild();
  } catch (error) {
    core.error(error as Error);
  }

  process.exit(0);
})
