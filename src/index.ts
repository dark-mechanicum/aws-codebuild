import * as core from '@actions/core';
import nconf from 'nconf';
import { CodeBuildJob } from './codebuildjob';

const config = nconf.env({ separator: '_', parseValues: true });

const job = new CodeBuildJob({
  projectName: config.get('INPUT:projectName'),
});

job.startBuild().catch(error => core.setFailed(error as Error));