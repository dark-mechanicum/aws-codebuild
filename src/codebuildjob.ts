import * as core from '@actions/core';
import { CodeBuild } from 'aws-sdk';
import { debug, convertMsToTime } from './utils';
import { Logger } from './logger';
import { SummaryTableRow } from '@actions/core/lib/summary';
import {
  BatchGetBuildsOutput,
  BuildPhaseType,
  Builds,
  LogsLocation,
  StartBuildInput,
  Build,
} from 'aws-sdk/clients/codebuild';
import { BuildPhase, BuildPhases } from 'aws-sdk/clients/codebuild';

class CodeBuildJob {
  protected params: StartBuildInput;
  protected client = new CodeBuild();
  protected build: CodeBuild.Build = {};
  protected logger: Logger = undefined as unknown as Logger;
  protected timeout: NodeJS.Timeout | undefined;
  protected currentPhase: BuildPhaseType | 'STARTING' = 'STARTING';

  constructor(params: StartBuildInput) {
    debug('[CodeBuildJob] Created new CodeBuildJob instance with parameters:', params);

    this.params = params;

    this.wait = this.wait.bind(this);
  }

  /**
   * Starting a CodeBuild job
   */
  public async startBuild() {
    const { projectName } = this.params;

    core.info(`Starting "${projectName}" CodeBuild project job`);
    debug('[CodeBuildJob] Doing request CodeBuild.startBuild() with parameters', this.params);
    const startBuildOutput = await this.client.startBuild(this.params).promise();
    debug('[CodeBuildJob]Received response from CodeBuild.startBuild() request', startBuildOutput);

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

      debug('[CodeBuildJob] Creating CloudWatch Logger with parameters:', options);
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
    const request = { id: this.build.id as string };

    core.warning(`Canceling job ${this.build.id}`);
    debug(' [CodeBuildJob]Sending request to cancel job execution CodeBuild.stopBuild() with parameters:', request);
    const response = await this.client.stopBuild(request).promise();
    debug('[CodeBuildJob] Received response from CodeBuild.stopBuild() request:', response);
    core.info(`Build ${this.build.id} was successfully canceled`);

    debug('[CodeBuildJob] Canceling next request to the CodeBuild.batchGetBuilds()');
    clearTimeout(this.timeout);
    this.logger?.stop(true);
  }

  /**
   * Wait till build job reach phase where logs can be obtained
   * @protected
   */
  protected async wait() {
    debug('[CodeBuildJob] Starting updating job status');

    const { id } = this.build as CodeBuild.Build;
    const request = { ids: [ id as string ] };

    debug('[CodeBuildJob] Doing request to the CodeBuild.batchGetBuilds() with parameters:', request);
    const response = await this.client.batchGetBuilds(request).promise() as BatchGetBuildsOutput;
    debug('[CodeBuildJob] Received response from CodeBuild.batchGetBuilds() call:', response);

    const { builds } = response;
    const build = (builds as Builds).at(0) as Build;
    const { currentPhase, buildStatus } = build;

    const phasesWithoutLogs: BuildPhaseType[] = ['SUBMITTED', 'QUEUED', 'PROVISIONING'];
    if (!phasesWithoutLogs.includes(currentPhase as BuildPhaseType)) {
      debug('[CodeBuildJob] Starting listening for job logs output');
      this.logger?.start();
    }

    if (currentPhase === 'COMPLETED') {
      debug('[CodeBuildJob] Stopping listening of job logs output');
      this.logger?.stop();

      if (buildStatus !== 'IN_PROGRESS' && buildStatus !== 'SUCCEEDED') {
        debug('[CodeBuildJob] Detected job execution finished');
        process.on('exit', () => {
          core.setFailed(`Job ${this.build.id} was finished with failed status: ${buildStatus}`);
        });
      }

      if (buildStatus !== 'IN_PROGRESS') {
        debug('[CodeBuildJob] Composing GitHub Action outputs');

        core.setOutput('id', build.id);
        core.setOutput('success', buildStatus === 'SUCCEEDED');
        core.setOutput('buildNumber', build.buildNumber);
        core.setOutput('timeoutInMinutes', build.timeoutInMinutes);
        core.setOutput('initiator', build.initiator);
        core.setOutput('buildStatus', build.buildStatus);

        await this.generateSummary(build);
      }
    }

    if (currentPhase !== this.currentPhase) {
      this.currentPhase = currentPhase as BuildPhaseType;
      core.info(`Build phase was changed to the "${this.currentPhase}"`);
    }

    if (build.buildStatus === 'IN_PROGRESS') {
      debug('[CodeBuildJob] Scheduling next request to the CodeBuild.batchGetBuilds() API');
      this.timeout = setTimeout(this.wait, 5000);
    }
  }

  /**
   * Generating summary about build steps
   * @param {build} build - Final build state of AWS CodeBuild job
   * @see https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
   * @protected
   */
  protected async generateSummary(build: Build): Promise<void> {
    core.summary.addHeading(`AWS CodeBuild ${build.id}`);

    const [ ,,,region,accountID ] = (build.arn as string).split(':');
    const projectName = build.projectName as string;

    core.summary.addLink(`AWS CodeBuild Job`, `https://${region}.console.aws.amazon.com/codesuite/codebuild/${accountID}/projects/${projectName}/build/${encodeURIComponent(build.id as string)}/?region=${region}`);

    const { cloudWatchLogs } = build.logs as LogsLocation;
    if (cloudWatchLogs && cloudWatchLogs.status === 'ENABLED') {
      const logGroupName = (cloudWatchLogs.groupName || `/aws/codebuild/${projectName}`) as string;
      const logStreamName = (cloudWatchLogs.streamName || (build.id as string).split(':').at(-1)) as string;

      core.summary.addRaw(' | ')
      core.summary.addLink(`AWS CloudWatch Logs`, `https://console.aws.amazon.com/cloudwatch/home?region=${region}#logEvent:group=${logGroupName};stream=${logStreamName}`);
    }

    core.summary.addBreak();
    core.summary.addBreak();

    core.summary.addRaw(`<strong>Job run ID</strong>: ${build.id}`, true);
    core.summary.addBreak();
    core.summary.addRaw(`<strong>Project name</strong>: ${build.projectName}`, true);
    core.summary.addBreak();
    core.summary.addRaw(`<strong>Initiator</strong>: ${build.initiator}`, true);
    core.summary.addBreak();

    const { startTime, endTime } = build as { startTime: Date, endTime: Date };
    core.summary.addRaw(`<strong>Total execution time:</strong> ${convertMsToTime(endTime.getTime() - startTime.getTime())}`, true);
    core.summary.addBreak();
    core.summary.addBreak();

    core.summary.addRaw('<strong>Job startup configuration:</strong>', true);
    core.summary.addBreak();
    core.summary.addCodeBlock(JSON.stringify(this.params, null, 2), 'json');

    const table: SummaryTableRow[] = [[
      {data: 'Phase Name', header: true},
      {data: 'Status', header: true},
      {data: 'Execution Time', header: true},
    ]];

    const { phases } = build as { phases: BuildPhases };
    phases.forEach((phase: BuildPhase) => {
      table.push([
        { data: phase.phaseType as string },
        { data: phase.phaseStatus as string },
        { data: convertMsToTime(Number(phase.durationInSeconds || 0) * 1000) },
      ]);
    })

    core.summary.addBreak();
    core.summary.addTable(table);

    await core.summary.write();
  }
}

export {
  CodeBuildJob,
}