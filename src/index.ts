import * as core from '@actions/core';
import nconf from 'nconf';
import { CodeBuildJob } from './codebuildjob';
import { AWSError } from 'aws-sdk';

const config = nconf.env({
  separator: '__',
  parseValues: true,
  match: /^CODEBUILD__/,
});

const job = new CodeBuildJob({
  projectName: core.getInput('projectName'),
  ...config.get('CODEBUILD'),
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
    core.error(error as AWSError);
  }

  process.exit(0);
})