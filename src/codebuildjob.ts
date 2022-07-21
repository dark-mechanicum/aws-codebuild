import * as core from '@actions/core';
import { CodeBuild } from 'aws-sdk';
import { Logger } from './logger';
import {
  BatchGetBuildsOutput,
  BuildPhaseType,
  Builds,
  LogsLocation,
  StartBuildInput,
  Build,
} from 'aws-sdk/clients/codebuild';

class CodeBuildJob {
  protected params: StartBuildInput;
  protected client = new CodeBuild();
  protected build: CodeBuild.Build = {};
  protected logger: Logger = undefined as unknown as Logger;
  protected timeout: NodeJS.Timeout | undefined;
  protected currentPhase: BuildPhaseType | 'STARTING' = 'STARTING';

  constructor(params: StartBuildInput) {
    this.params = params;

    this.wait = this.wait.bind(this);
  }

  /**
   * Starting a CodeBuild job
   */
  public async startBuild() {
    const { projectName } = this.params;

    core.info(`Starting "${projectName}" CodeBuild project job`);
    const startBuildOutput = await this.client.startBuild(this.params).promise();

    if (!startBuildOutput || !startBuildOutput.build) {
      throw new Error(`Can't start ${projectName} CodeBuild job. Empty response from AWS API Endpoint`);
    }

    const { build } = startBuildOutput;
    this.build = build;

    core.info(`CodeBuild project job ${build.id} was started successfully`);

    // initiate logger listening
    const { cloudWatchLogs } = build.logs as LogsLocation;
    if (cloudWatchLogs && cloudWatchLogs.status === 'ENABLED') {
      const options = {
        type: 'cloudwatch',
        logGroupName: (cloudWatchLogs.groupName || `/aws/codebuild/${projectName}`) as string,
        logStreamName: (cloudWatchLogs.streamName || (build.id as string).split(':').at(-1)) as string,
      }

      this.logger = new Logger(options);
    }

    if (!this.logger) {
      core.info(`Can't find logs output for AWS CodeBuild job: ${build.id}`);
    }

    await this.wait();
  }

  /**
   * Canceling job execution
   */
  public async cancelBuild() {
    core.info(`Canceling job ${this.build.id}`);
    await this.client.stopBuild({ id: this.build.id as string }).promise();
    core.info(`Build ${this.build.id} was successfully canceled`);

    clearTimeout(this.timeout);
    this.logger?.stop(true);
  }

  /**
   * Wait till build job reach phase where logs can be obtained
   * @protected
   */
  protected async wait() {
    const { id } = this.build as CodeBuild.Build;
    const { builds } = await this.client.batchGetBuilds({ ids: [ id as string ] }).promise() as BatchGetBuildsOutput;
    const build = (builds as Builds).at(0) as Build;
    const { currentPhase, buildStatus } = build;

    const phasesWithoutLogs: BuildPhaseType[] = ['SUBMITTED', 'QUEUED', 'PROVISIONING'];
    if (!phasesWithoutLogs.includes(currentPhase as BuildPhaseType)) {
      this.logger?.start();
    }

    if (currentPhase === 'COMPLETED') {
      this.logger?.stop();

      if (buildStatus !== 'IN_PROGRESS' && buildStatus !== 'SUCCEEDED') {
        process.on('exit', () => {
          core.setFailed(`Job ${this.build.id} was finished with failed status: ${buildStatus}`);
        });
      }

      if (buildStatus !== 'IN_PROGRESS') {
        core.setOutput('id', build.id);
        core.setOutput('success', buildStatus === 'SUCCEEDED');
        core.setOutput('buildNumber', build.buildNumber);
        core.setOutput('timeoutInMinutes', build.timeoutInMinutes);
        core.setOutput('initiator', build.initiator);
        core.setOutput('buildStatus', build.buildStatus);
      }
    }

    if (currentPhase !== this.currentPhase) {
      this.currentPhase = currentPhase as BuildPhaseType;
      core.info(`Build phase was changed to the "${this.currentPhase}"`);
    }

    if (build.buildStatus === 'IN_PROGRESS') {
      this.timeout = setTimeout(this.wait, 5000);
    }
  }
}

export {
  CodeBuildJob,
}