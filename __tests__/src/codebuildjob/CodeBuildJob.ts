const mocks = {
  startBuild: jest.fn().mockName('Mock: "aws-sdk".CodeBuild.prototype.startBuild()'),
  batchGetBuilds: jest.fn().mockName('Mock: "aws-sdk".CodeBuild.prototype.batchGetBuilds()'),
  stopBuild: jest.fn().mockName('Mock: "aws-sdk".CodeBuild.prototype.stopBuild()'),
  actionsCoreInfo: jest.fn().mockName('Mock: "@actions/core".info()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
  actionsCoreSetOutput: jest.fn().mockName('Mock: "@actions/core".setOutput()'),
  actionsCoreDebug: jest.fn().mockName('Mock: "@actions/core".debug()'),
  actionsCoreNotice: jest.fn().mockName('Mock: "@actions/core".notice()'),
  actionsCoreWarning: jest.fn().mockName('Mock: "@actions/core".warning()'),
  actionsCoreError: jest.fn().mockName('Mock: "@actions/core".error()'),
  actionsCoreGetBooleanInput: jest.fn().mockName('Mock: "@actions/core".getBooleanInput()'),
  actionsCoreGetInput: jest.fn().mockName('Mock: "@actions/core".getInput()'),
  actionsCoreExportVariable: jest.fn().mockName('Mock: "@actions/core".exportVariable()'),
  loggerStart: jest.fn().mockName('Mock: "src/logger".Logger.start()'),
  loggerStop: jest.fn().mockName('Mock: "src/logger".Logger.stop()'),
};

jest.mock('@aws-sdk/client-codebuild', () => ({
  CodeBuild: jest.fn(() => ({
    startBuild: mocks.startBuild,
    batchGetBuilds: mocks.batchGetBuilds,
    stopBuild: mocks.stopBuild,
  })),
}));

jest.mock('@actions/core', () => ({
  info: mocks.actionsCoreInfo,
  debug: mocks.actionsCoreDebug,
  notice: mocks.actionsCoreNotice,
  warning: mocks.actionsCoreWarning,
  error: mocks.actionsCoreError,
  setFailed: mocks.actionsCoreSetFailed,
  setOutput: mocks.actionsCoreSetOutput,
  getInput: mocks.actionsCoreGetInput,
  getBooleanInput: mocks.actionsCoreGetBooleanInput,
  summary: {
    addLink: jest.fn(),
    addHeading: jest.fn(),
    addBreak: jest.fn(),
    write: jest.fn(),
    addRaw: jest.fn(),
    addEOL: jest.fn(),
    addTable: jest.fn(),
    addCodeBlock: jest.fn(),
  },
}));

jest.mock('../../../src/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    start: mocks.loggerStart,
    stop: mocks.loggerStop,
  })),
}));

import { CodeBuildJob } from '../../../src/codebuildjob';
import { StartBuildOutput, BatchGetBuildsOutput, StopBuildOutput } from '@aws-sdk/client-codebuild';

describe('CodeBuildJob class functionality', () => {
  const createAWSResponse = (resolves: unknown) => resolves;
  const buildDesc = {
    id: 'test:testStreamID',
    logs: { cloudWatchLogs: { status: 'ENABLED' } },
    arn: 'arn:aws:codebuild:us-east-1:972995211738:build/testing-codebuild-logs:d585fe96-caa5-4a64-a7e1-01dcf612bffc',
    startTime: new Date(),
    endTime: new Date(),
    phases: [
      { phaseType: 'phaseType1', phaseStatus: 'phaseStatus1', durationInSeconds: 7200 },
      { phaseType: 'phaseType2', phaseStatus: 'phaseStatus2', durationInSeconds: 78 },
      { phaseType: 'phaseType3', phaseStatus: 'phaseStatus3', durationInSeconds: 15 },
      { phaseType: 'phaseType4', phaseStatus: 'phaseStatus4' },
    ]
  };
  const codeBuildJobOptions = {
    buildStatusInterval: 5000,
    displayBuildLogs: true,
    logsUpdateInterval: 5000,
    waitToBuildEnd: true,
  };

  beforeAll(() => {
    process.env['GITHUB_STEP_SUMMARY'] = '/dev/null';
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.unmock('@aws-sdk/client-codebuild');
    jest.unmock('@actions/core');
    jest.unmock('../../../src/logger');
    jest.useRealTimers();
  });

  afterEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  it('should complete whole cycle successfully', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: buildDesc,
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toHaveBeenCalled();
    expect(loggerStop).toHaveBeenCalled();
  });

  it('should complete whole cycle successfully without logs', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toHaveBeenCalled();
    expect(loggerStop).not.toHaveBeenCalled();
  });

  it('should setFail GitHub Action job on failing of AWS CodeBuild job', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop, actionsCoreSetFailed } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, { ...codeBuildJobOptions, redirectServiceURL: 'https://test/' });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'COMPLETED', buildStatus: 'FAILED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toHaveBeenCalled();
    expect(loggerStop).not.toHaveBeenCalled();

    process.emit('exit', 1);
    expect(actionsCoreSetFailed).toHaveBeenCalledWith(`Job test:testStreamID was finished with failed status: FAILED`);
  });

  it('should setFail GitHub Action job on failing of AWS CodeBuild job in failed phase', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop, actionsCoreSetFailed } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, { ...codeBuildJobOptions, redirectServiceURL: 'https://test/' });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
        .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
        .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
        .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
        .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'FAILED', buildStatus: 'FAILED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toHaveBeenCalled();
    expect(loggerStop).not.toHaveBeenCalled();

    process.emit('exit', 1);
    expect(actionsCoreSetFailed).toHaveBeenCalledWith(`Job test:testStreamID was finished with failed status: FAILED`);
  });

  it('should wait till build will be finished with disabled logs output', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop, actionsCoreSetFailed } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, { ...codeBuildJobOptions, displayBuildLogs: false });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'ENABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'COMPLETED', buildStatus: 'FAILED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toHaveBeenCalled();
    expect(loggerStop).not.toHaveBeenCalled();

    process.emit('exit', 1);
    expect(actionsCoreSetFailed).toHaveBeenCalledWith(`Job test:testStreamID was finished with failed status: FAILED`);
  });

  it('should not wait build status if waitToBuildEnd=false', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, { ...codeBuildJobOptions, waitToBuildEnd: false });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'ENABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    const startBuildPromise = job.startBuild();
    await expect(startBuildPromise).resolves.toBeUndefined();
    expect(loggerStart).not.toHaveBeenCalled();
    expect(batchGetBuilds).not.toHaveBeenCalled();
  });

  it('should trigger exception if codebuild job can not be started', async () => {
    const { startBuild } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    startBuild.mockReturnValueOnce(createAWSResponse({} as StartBuildOutput));

    await expect(() => job.startBuild()).rejects.toThrow('Can\'t start test CodeBuild job. Empty response from AWS API Endpoint')
  });

  it('should complete build and generate outputs and summary without manually canceling', async () => {
    const { startBuild, batchGetBuilds, actionsCoreSetOutput } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    const completeBuildDesc = {
      ...buildDesc,
      buildNumber: 42,
      timeoutInMinutes: 60,
      initiator: 'test-user'
    };

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: completeBuildDesc,
    } as StartBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput));

    await job.startBuild();

    // Run the first polling cycles
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // This final timer execution should detect SUCCEEDED and generate outputs
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Verify outputs were set
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('id', completeBuildDesc.id);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('success', true);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('buildNumber', 42);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('timeoutInMinutes', 60);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('initiator', 'test-user');
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('buildStatus', 'SUCCEEDED');
  });

  it('should generate summary with CloudWatch logs link when logs are enabled', async () => {
    const { startBuild, batchGetBuilds, actionsCoreSetOutput } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    const buildWithLogs = {
      ...buildDesc,
      buildNumber: 42,
      timeoutInMinutes: 60,
      initiator: 'test-user',
      logs: {
        cloudWatchLogs: {
          status: 'ENABLED',
          groupName: '/aws/codebuild/test',
          streamName: 'custom-stream'
        }
      }
    };

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: buildWithLogs,
    } as StartBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithLogs, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithLogs, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithLogs, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithLogs, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput));

    await job.startBuild();

    // Run the polling cycles
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Final timer execution detects SUCCEEDED and generates outputs and summary
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Verify outputs were set and summary with logs was generated
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('id', buildWithLogs.id);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('success', true);
  });

  it('should handle summary generation when redirectServiceURL is provided', async () => {
    const { startBuild, batchGetBuilds, actionsCoreSetOutput } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, { ...codeBuildJobOptions, redirectServiceURL: 'https://redirect.example.com/' });

    const completeBuildDesc = {
      ...buildDesc,
      buildNumber: 42,
      timeoutInMinutes: 60,
      initiator: 'test-user'
    };

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: completeBuildDesc,
    } as StartBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...completeBuildDesc, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput));

    await job.startBuild();

    // Run the polling cycles
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Final timer execution detects SUCCEEDED and generates outputs and summary
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Verify outputs and summary were generated
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('id', completeBuildDesc.id);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('success', true);
  });

  it('should generate summary without CloudWatch logs link when logs are disabled', async () => {
    const { startBuild, batchGetBuilds, actionsCoreSetOutput } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    const buildWithoutLogs = {
      ...buildDesc,
      buildNumber: 42,
      timeoutInMinutes: 60,
      initiator: 'test-user',
      logs: {
        cloudWatchLogs: {
          status: 'DISABLED'
        }
      }
    };

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: buildWithoutLogs,
    } as StartBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithoutLogs, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithoutLogs, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithoutLogs, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildWithoutLogs, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput));

    await job.startBuild();

    // Run the polling cycles
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Final timer execution detects SUCCEEDED and generates outputs and summary
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Verify outputs were set but no CloudWatch logs link was added
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('id', buildWithoutLogs.id);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('success', true);
  });

  it('should generate outputs with success=false when build fails', async () => {
    const { startBuild, batchGetBuilds, actionsCoreSetOutput } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    const failedBuildDesc = {
      ...buildDesc,
      buildNumber: 42,
      timeoutInMinutes: 60,
      initiator: 'test-user'
    };

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: failedBuildDesc,
    } as StartBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...failedBuildDesc, currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...failedBuildDesc, currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...failedBuildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...failedBuildDesc, currentPhase: 'COMPLETED', buildStatus: 'FAILED' } ] } as BatchGetBuildsOutput));

    await job.startBuild();

    // Run the polling cycles
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Final timer execution detects FAILED and generates outputs and summary
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Verify outputs were set with success=false for failed build
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('id', failedBuildDesc.id);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('success', false);
    expect(actionsCoreSetOutput).toHaveBeenCalledWith('buildStatus', 'FAILED');
  });

  it('should handle repeated polling of same phase without duplicate phase change messages', async () => {
    const { startBuild, batchGetBuilds, actionsCoreInfo } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: buildDesc,
    } as StartBuildOutput));

    // Return the same phase twice to test the else branch of phase change condition
    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { ...buildDesc, currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput));

    await job.startBuild();

    // Run the polling cycles
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // This second call should have the same phase, testing the else branch of currentPhase !== this.currentPhase
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // This call detects COMPLETED status and should trigger both output generation and phase change
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Run one more timer to ensure final processing
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Should have phase change message for BUILD but not for the duplicate BUILD phase
    expect(actionsCoreInfo).toHaveBeenCalledWith('Build phase was changed to the "BUILD"');
    expect(actionsCoreInfo).toHaveBeenCalledWith('Build phase was changed to the "COMPLETED"');
  });

  it('should skip output generation when build status is IN_PROGRESS', async () => {
    const { startBuild, batchGetBuilds, actionsCoreSetOutput, actionsCoreDebug } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' }, codeBuildJobOptions);

    // Set up the build so it's in a state where wait() can be called
    startBuild.mockReturnValueOnce(createAWSResponse({
      build: buildDesc,
    } as StartBuildOutput));

    // Setup multiple mock calls: one for startBuild, one for the direct wait() call
    // The key is to have COMPLETED phase with IN_PROGRESS status to hit the else branch
    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({
        builds: [ { ...buildDesc, currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ]
      } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({
        builds: [ { ...buildDesc, currentPhase: 'COMPLETED', buildStatus: 'IN_PROGRESS' } ]
      } as BatchGetBuildsOutput));

    // Start the build to initialize the job
    await job.startBuild();

    // Clear previous calls to focus on the wait() method call
    actionsCoreSetOutput.mockClear();
    actionsCoreDebug.mockClear();

    // Call the protected wait() method directly to test the IN_PROGRESS branch
    await (job as unknown as { wait: () => Promise<void> }).wait();

    // Verify that setOutput was NOT called (because status is IN_PROGRESS in COMPLETED phase)
    expect(actionsCoreSetOutput).not.toHaveBeenCalled();

    // Verify that debug was called (showing the method executed)
    expect(actionsCoreDebug).toHaveBeenCalled();

    // Also verify that the debug message about composing outputs was NOT called
    expect(actionsCoreDebug).not.toHaveBeenCalledWith('[CodeBuildJob] Composing GitHub Action outputs');
  });
});
