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