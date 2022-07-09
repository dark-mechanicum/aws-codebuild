import * as core from '@actions/core';
import { CodeBuildJob } from './codebuildjob';
import * as nconf from 'nconf';

const config = nconf.env({ separator: '_', parseValues: true }).overrides();

const job = new CodeBuildJob({
  projectName: config.get('INPUT:projectName'),
});

job.startBuild().catch(error => core.setFailed(error as Error));