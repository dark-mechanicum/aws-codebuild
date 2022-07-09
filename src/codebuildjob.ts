import * as core from '@actions/core';
import { CodeBuild } from 'aws-sdk';
import { Logger } from './logger';
import { BatchGetBuildsOutput, BuildPhaseType, Builds, LogsLocation, StartBuildInput } from 'aws-sdk/clients/codebuild';
import { EventEmitter } from 'events';

class CodeBuildJob extends EventEmitter {
  protected params: StartBuildInput;
  protected client = new CodeBuild();
  protected build: CodeBuild.Build | undefined = undefined;
  protected logger: Logger | undefined;
  protected timeout: NodeJS.Timeout | undefined;
  protected currentPhase: BuildPhaseType | 'STARTING' = 'STARTING';

  constructor(params: StartBuildInput) {
    super();
    this.params = params;

    this.wait = this.wait.bind(this);

    this.on('phaseChanged', this.onPhaseChanged.bind(this));
    this.on('COMPLETED', this.onCompleted.bind(this));
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
      await this.wait();
    }
  }

  /**
   * Wait till build job reach phase where logs can be obtained
   * @protected
   */
  protected async wait() {
    const { id } = this.build as CodeBuild.Build;
    const { builds } = await this.client.batchGetBuilds({ ids: [ id as string ] }).promise() as BatchGetBuildsOutput;
    const build = (builds as Builds).at(0);

    if (build?.currentPhase !== this.currentPhase) {
      this.currentPhase = build?.currentPhase as BuildPhaseType;
      this.emit('phaseChanged', build?.currentPhase);
    }

    if (this.currentPhase !== 'COMPLETED') {
      this.timeout = setTimeout(this.wait, 20000);
    }
  }

  protected onPhaseChanged(phase: BuildPhaseType) {
    core.info(`Build phase was changed to the "${this.currentPhase}" status`);
    this.emit(phase);

    if (!(['SUBMITTED', 'QUEUED', 'PROVISIONING'] as BuildPhaseType[]).includes(phase)) {
      this.logger?.start();
    }
  }

  protected onCompleted() {
    this.logger?.stop();
  }
}

export {
  CodeBuildJob,
}