import * as core from '@actions/core';
import { CodeBuildJob } from './codebuildjob'

try {
  const projectName = core.getInput('projectName');
  const job = new CodeBuildJob({ projectName })
  job.startBuild().catch(error => core.setFailed(error as Error));
} catch (error) {
  core.setFailed(error as Error);
}