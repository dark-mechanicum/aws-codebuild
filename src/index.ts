import * as core from '@actions/core';
import nconf from 'nconf';
import { CodeBuildJob } from './codebuildjob';

const config = nconf.env({
  separator: '__',
  parseValues: true,
  match: /^CODEBUILD__/,
});

const job = new CodeBuildJob({
  ...config.get('CODEBUILD'),
  projectName: core.getInput('projectName'),
});

job.startBuild().catch(error => core.setFailed(error as Error));

/**
 * Reaction to job cancellation
 * @see https://docs.github.com/en/actions/managing-workflow-runs/canceling-a-workflow
 */
process.on('SIGINT', async () => {
  await job.cancelBuild();
  process.exit(0);
})