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
  actionsCoreExportVariable: jest.fn().mockName('Mock: "@actions/core".exportVariable()'),
  loggerStart: jest.fn().mockName('Mock: "src/logger".Logger.start()'),
  loggerStop: jest.fn().mockName('Mock: "src/logger".Logger.stop()'),
};

jest.mock('aws-sdk', () => ({
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
  exportVariable: mocks.actionsCoreExportVariable,
}));

jest.mock('../../../src/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    start: mocks.loggerStart,
    stop: mocks.loggerStop,
  })),
}));

import { CodeBuildJob } from '../../../src/codebuildjob';
import { StartBuildOutput, BatchGetBuildsOutput, StopBuildOutput } from 'aws-sdk/clients/codebuild';

describe('CodeBuildJob class functionality', () => {
  const createAWSResponse = (resolves: unknown) => ({ promise: () => Promise.resolve(resolves) });

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.unmock('aws-sdk');
    jest.unmock('@actions/core');
    jest.unmock('../../../src/logger');
    jest.useRealTimers();
  });

  afterEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  it('should complete whole cycle successfully', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'ENABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toBeCalled();
    expect(loggerStop).toBeCalled();
  });

  it('should complete whole cycle successfully without logs', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'COMPLETED', buildStatus: 'SUCCEEDED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toBeCalled();
    expect(loggerStop).not.toBeCalled();
  });

  it('should setFail GitHub Action job on failing of AWS CodeBuild job', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop, actionsCoreSetFailed } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' });

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'QUEUED', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'PROVISIONING', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'BUILD', buildStatus: 'IN_PROGRESS' } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'COMPLETED', buildStatus: 'FAILED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    await job.cancelBuild();
    expect(stopBuild).toBeCalled();
    expect(loggerStop).not.toBeCalled();

    process.emit('exit', 1);
    expect(actionsCoreSetFailed).toBeCalledWith(`Job test:testStreamID was finished with failed status: FAILED`);
  });

  it('should trigger exception if codebuild job can not be started', async () => {
    const { startBuild } = mocks;
    const job = new CodeBuildJob({ projectName: 'test' });

    startBuild.mockReturnValueOnce(createAWSResponse({} as StartBuildOutput));

    await expect(() => job.startBuild()).rejects.toThrowError('Can\'t start test CodeBuild job. Empty response from AWS API Endpoint')
  });
});