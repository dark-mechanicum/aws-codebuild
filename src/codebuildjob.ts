import * as core from '@actions/core';
import { CodeBuild } from 'aws-sdk';
import { debug, convertMsToTime } from './utils';
import { Logger } from './logger';
import { SummaryTableRow } from '@actions/core/lib/summary';
import {
  BatchGetBuildsOutput,
  BatchGetBuildBatchesOutput,
  BuildPhaseType,
  BuildBatchPhaseType,
  Builds,
  BuildBatches,
  LogsLocation,
  StartBuildInput,
  Build,
  BuildBatch,
} from 'aws-sdk/clients/codebuild';
import { BuildPhase, BuildPhases } from 'aws-sdk/clients/codebuild';

interface CodeBuildJobOptions {
  /**
   * Interval in milliseconds to control how often should be checked status of build.
   * @default 5000
   */
  buildStatusInterval: number;
  /**
   * Interval in milliseconds to control how often should be checked new events in logs stream.
   * @default 5000
   */
  logsUpdateInterval: number;
  /**
   * Wait till AWS CodeBuild job will be finished
   * @default true
   */
  waitToBuildEnd: boolean;
  /**
   * Display AWS CodeBuild logs output in the GitHub Actions logs output
   * @default true
   */
  displayBuildLogs: boolean;
  /**
   * URL to the service that will do a redirect for generated links
   * @example https://cloudaws.link/r/
   */
  redirectServiceURL?: string;
  /**
   * Start a batch build
   * @default true
   */
  runBatch?: boolean;
}

class CodeBuildJob {
  protected params: StartBuildInput;
  protected client = new CodeBuild();
  protected build: CodeBuild.Build = {};
  protected buildBatch: CodeBuild.BuildBatch = {};
  protected logger?: Logger;
  protected timeout?: NodeJS.Timeout;
  protected currentPhase: BuildPhaseType | 'STARTING' = 'STARTING';
  protected options: CodeBuildJobOptions = {
    buildStatusInterval: 5000,
    displayBuildLogs: true,
    logsUpdateInterval: 5000,
    waitToBuildEnd: true,
    runBatch: true,
  };

  constructor(params: StartBuildInput, options: CodeBuildJobOptions) {
    debug('[CodeBuildJob] Created new CodeBuildJob instance with parameters:', params);

    this.params = params;
    this.options = { ...this.options, ...options };
    this.wait = this.wait.bind(this);
  }


  public async startWrapper() {
    if (this.options.runBatch) {
      await this.startBuildBatch();
    } else {
      await this.startBuild();
    }
  }

  public async startBuildBatch() {
    try {

      const { projectName } = this.params;
      console.log(`Starting "${projectName}" CodeBuild project batch job`);

      core.info(`Starting "${projectName}" CodeBuild project batch job`);
      debug('[CodeBuildJob] Doing request CodeBuild.startBuildBatch() with parameters', this.params);
      console.log('[CodeBuildJob] Doing request CodeBuild.startBuildBatch() with parameters', this.params);
      // Use the `startBuildBatch` method to start the build.
      const startBuildBatchOutput = await this.client.startBuildBatch(this.params).promise();
      debug('[CodeBuildJob] Received response from CodeBuild.startBuildBatch() request', startBuildBatchOutput);
      console.log('[CodeBuildJob] Received response from CodeBuild.startBuildBatch() request', startBuildBatchOutput);

      if (!startBuildBatchOutput ?? !startBuildBatchOutput.buildBatch) {
        throw new Error(`Can't start ${projectName} CodeBuild job. Empty response from AWS API Endpoint`);
      }
      if (!startBuildBatchOutput || !startBuildBatchOutput.buildBatch) {
        throw new Error(`Invalid response from startBuildBatch`);
      }
      const buildBatches = startBuildBatchOutput.buildBatch;

      if (!buildBatches) {
        throw new Error(`No build batches found ${buildBatches}`);
      }
      const { buildBatch } = startBuildBatchOutput;
      this.buildBatch = buildBatch;
      console.log(`buildBatch ${buildBatch}`);

      core.info(`CodeBuild project batch job ${buildBatch.id} was started successfully`);

      // If we don't need to wait until AWS CodeBuild will be finished, skip logs registering and build status checks
      if (!this.options.waitToBuildEnd) {
        core.info(`The "waitToBuildEnd" input is in a false state. No need to track logs and status. Stopping...`);
      }

      // initiate logger listening
      const logConfig = buildBatch.logConfig;
      if (buildBatch.id && logConfig && logConfig.cloudWatchLogs && logConfig.cloudWatchLogs.status === 'ENABLED') {
        const options = {
          type: 'cloudwatch',
          logGroupName: logConfig.cloudWatchLogs.groupName ?? `/aws/codebuild/${projectName}`,
          logStreamName: logConfig.cloudWatchLogs.streamName ?? (buildBatch.id.split(':').at(-1) as string),
        };

        debug('[CodeBuildJob] Creating CloudWatch Logger with parameters:', options);

        // logs will be displayed only if we have a request to do it
        if (this.options.displayBuildLogs) {
          this.logger = new Logger(options, { updateInterval: this.options.logsUpdateInterval });
        }
      }

      // helper message to help track why logs are not displayed
      if (!this.options.displayBuildLogs) {
        core.info(`The displayBuildLogs input in false state. CodeBuild logs output will not be displayed`);
      }

      if (!this.logger && this.options.displayBuildLogs) {
        core.info(`Can't find logs output for AWS CodeBuild job: ${buildBatch.id}`);
      }

      await this.waitBatch();
      console.log("After starting build batch");

    } catch (error) {
      console.error("Error in startBuildBatch:", error);

      // Rethrow the error so that it can be caught by the caller
      throw error;
    }
  }


  /**
   * Starting a CodeBuild job
   */
  public async startBuild() {
    const { projectName } = this.params;

    core.info(`Starting "${projectName}" CodeBuild build project job`);
    debug('[CodeBuildJob] Doing request CodeBuild.startBuild() with parameters', this.params);
    const startBuildOutput = await this.client.startBuild(this.params).promise();
    debug('[CodeBuildJob]Received response from CodeBuild.startBuild() request', startBuildOutput);

    if (!startBuildOutput ?? !startBuildOutput.build) {
      throw new Error(`Can't start ${projectName} CodeBuild build job. Empty response from AWS API Endpoint`);
    }

    const { build } = startBuildOutput;
    this.build = build;

    core.info(`CodeBuild project build job ${build.id} was started successfully`);

    // if we don't need to wait till AWS CodeBuild will be finished, skip logs registering and build status checks
    if (!this.options.waitToBuildEnd) {
      core.info(`The "waitToBuildEnd" input in a false state. No need to track logs and status. Stopping...`)
      return;
    }

    // initiate logger listening
    const { cloudWatchLogs } = build.logs as LogsLocation;
    if (cloudWatchLogs && cloudWatchLogs.status === 'ENABLED') {
      const options = {
        type: 'cloudwatch',
        logGroupName: (cloudWatchLogs.groupName ?? `/aws/codebuild/${projectName}`) as string,
        logStreamName: (cloudWatchLogs.streamName ?? (build.id as string).split(':').at(-1)) as string,
      }

      debug('[CodeBuildJob] Creating CloudWatch Logger with parameters:', options);

      // logs will be displayed only if we have request to do it
      if (this.options.displayBuildLogs) {
        this.logger = new Logger(options, { updateInterval: this.options.logsUpdateInterval });
      }
    }

    // helper message to help track why logs are not displayed
    if (!this.options.displayBuildLogs) {
      core.info(`The displayBuildLogs input in false state. CodeBuild logs output will not be displayed`);
    }

    if (!this.logger && this.options.displayBuildLogs) {
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
   * Canceling batch job execution
   */
  // public async cancelBuildBatch()

  /**
   * Wait till build job reach phase where logs can be obtained
   * @protected
   */
  protected async wait() {
    debug('[CodeBuildJob] Starting updating job status');

    const { id } = this.build as CodeBuild.Build;
    const request = { ids: [id as string] };

    debug('[CodeBuildJob] Doing request to the CodeBuild.batchGetBuilds() with parameters:', request);
    const response = await this.client.batchGetBuilds(request).promise() as BatchGetBuildsOutput;
    debug('[CodeBuildJob] Received response from CodeBuild.batchGetBuilds() call:', response);
    console.log(`response:`, JSON.stringify(response, null, 2));

    const { builds } = response;
    console.log(`builds: ${builds}`);

    const build = (builds as Builds).at(0) as Build;
    console.log(`build: ${build}`);

    const { currentPhase, buildStatus } = build;
    console.log(`currentPhase: ${currentPhase}`);
    console.log(`buildStatus: ${buildStatus}`);

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
      this.timeout = setTimeout(this.wait, this.options.buildStatusInterval);
    }
  }

  /**
   * Wait till build batch job reach phase where logs can be obtained
   * @protected
   */
  protected async waitBatch() {
    debug('[CodeBuildJob] Starting updating job status');

    const { id } = this.buildBatch as CodeBuild.BuildBatch;
    const request = { ids: [id as string] };

    debug('[CodeBuildJob] Doing request to the CodeBuild.batchGetBuildBatches() with parameters:', request);
    const response = await this.client.batchGetBuildBatches(request).promise() as BatchGetBuildBatchesOutput;
    console.log(`response:`, JSON.stringify(response, null, 2));
    debug('[CodeBuildJob] Received response from CodeBuild.batchGetBuildBatches() call:', response);

    const { buildBatches } = response;
    console.log(`buildBatches: ${buildBatches}`)

    const buildBatch = (buildBatches as BuildBatches) as BuildBatch;
    console.log(`buildBatch: ${buildBatch}`)
    const { currentPhase, buildBatchStatus } = buildBatch;
    console.log(`currentPhase: ${currentPhase}`)
    console.log(`buildBatchStatus: ${buildBatchStatus}`)

    const phasesWithoutLogs: BuildBatchPhaseType[] = ['SUBMITTED', 'DOWNLOAD_BATCHSPEC'];
    if (!phasesWithoutLogs.includes(currentPhase as BuildBatchPhaseType)) {
      debug('[CodeBuildJob] Starting listening for job logs output');
      this.logger?.start();
    }

    if (currentPhase === 'SUCCEEDED') {
      debug('[CodeBuildJob] Stopping listening of job logs output');
      this.logger?.stop();

      if (buildBatchStatus !== 'IN_PROGRESS' && buildBatchStatus !== 'SUCCEEDED') {
        debug('[CodeBuildJob] Detected job execution finished');
        process.on('exit', () => {
          core.setFailed(`Job ${this.build.id} was finished with failed status: ${buildBatchStatus}`);
        });
      }

      if (buildBatchStatus === 'FAILED') {
        debug('[CodeBuildJob] Detected job execution finished');
        process.on('exit', () => {
          core.setFailed(`Job ${this.build.id} was finished with failed status: ${buildBatchStatus}`);
        });
      }

      if (buildBatchStatus !== 'IN_PROGRESS') {
        debug('[CodeBuildJob] Composing GitHub Action outputs');

        core.setOutput('id', buildBatch.id);
        core.setOutput('success', buildBatchStatus === 'SUCCEEDED');
        core.setOutput('buildNumber', buildBatch.buildBatchNumber);
        core.setOutput('timeoutInMinutes', buildBatch.buildTimeoutInMinutes);
        core.setOutput('initiator', buildBatch.initiator);
        core.setOutput('buildBatchStatus', buildBatch.buildBatchStatus);

        await this.generateSummaryBatch(buildBatch);
      }
    }

    if (currentPhase !== this.currentPhase) {
      this.currentPhase = currentPhase as BuildPhaseType;
      core.info(`Build phase was changed to the "${this.currentPhase}"`);
    }

    if (buildBatch.buildBatchStatus === 'IN_PROGRESS') {
      debug('[CodeBuildJob] Scheduling next request to the CodeBuild.batchGetBuildBatches() API');
      this.timeout = setTimeout(this.waitBatch, this.options.buildStatusInterval);
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

    const [, , , region, accountID] = (build.arn as string).split(':');
    const projectName = build.projectName as string;
    const { redirectServiceURL } = this.options;

    const jobLink = `https://${region}.console.aws.amazon.com/codesuite/codebuild/${accountID}/projects/${projectName}/build/${encodeURIComponent(build.id as string)}/?region=${region}`;
    core.summary.addLink(`AWS CodeBuild Job`, redirectServiceURL ? `${redirectServiceURL}${Buffer.from(jobLink).toString('base64url')}` : jobLink);

    const { cloudWatchLogs } = build.logs as LogsLocation;
    if (cloudWatchLogs && cloudWatchLogs.status === 'ENABLED') {
      const logGroupName = (cloudWatchLogs.groupName ?? `/aws/codebuild/${projectName}`) as string;
      const logStreamName = (cloudWatchLogs.streamName ?? (build.id as string).split(':').at(-1)) as string;

      core.summary.addRaw(' | ')

      const logsLink = `https://console.aws.amazon.com/cloudwatch/home?region=${region}#logEvent:group=${logGroupName};stream=${logStreamName}`;
      core.summary.addLink(`AWS CloudWatch Logs`, redirectServiceURL ? `${redirectServiceURL}${Buffer.from(logsLink).toString('base64url')}` : logsLink);
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
      { data: 'Phase Name', header: true },
      { data: 'Status', header: true },
      { data: 'Total duration', header: true },
    ]];

    const { phases } = build as { phases: BuildPhases };
    phases.forEach((phase: BuildPhase) => {
      table.push([
        { data: phase.phaseType as string },
        { data: phase.phaseStatus as string },
        { data: convertMsToTime(Number(phase.durationInSeconds ?? 0) * 1000) },
      ]);
    })

    core.summary.addBreak();
    core.summary.addTable(table);

    await core.summary.write();
  }

  protected async generateSummaryBatch(build: BuildBatch): Promise<void> {
    core.summary.addHeading(`AWS CodeBuild Batch: ${build.id}`);

    const [, , , region, accountID] = (build.arn as string).split(':');
    const projectName = build.projectName as string;
    const { redirectServiceURL } = this.options;

    const jobLink = `https://${region}.console.aws.amazon.com/codesuite/codebuild/${accountID}/projects/${projectName}/build/${encodeURIComponent(build.id as string)}/?region=${region}`;
    core.summary.addLink(`AWS CodeBuild Batch Job`, redirectServiceURL ? `${redirectServiceURL}${Buffer.from(jobLink).toString('base64url')}` : jobLink);

    const { cloudWatchLogs } = build.logConfig as LogsLocation;
    if (cloudWatchLogs && cloudWatchLogs.status === 'ENABLED') {
      const logGroupName = (cloudWatchLogs.groupName ?? `/aws/codebuild/${projectName}`) as string;
      const logStreamName = (cloudWatchLogs.streamName ?? (build.id as string).split(':').at(-1)) as string;

      core.summary.addRaw(' | ')

      const logsLink = `https://console.aws.amazon.com/cloudwatch/home?region=${region}#logEvent:group=${logGroupName};stream=${logStreamName}`;
      core.summary.addLink(`AWS CloudWatch Logs`, redirectServiceURL ? `${redirectServiceURL}${Buffer.from(logsLink).toString('base64url')}` : logsLink);
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
      { data: 'Phase Name', header: true },
      { data: 'Status', header: true },
      { data: 'Total duration', header: true },
    ]];

    const { phases } = build as { phases: BuildPhases };
    phases.forEach((phase: BuildPhase) => {
      table.push([
        { data: phase.phaseType as string },
        { data: phase.phaseStatus as string },
        { data: convertMsToTime(Number(phase.durationInSeconds ?? 0) * 1000) },
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
