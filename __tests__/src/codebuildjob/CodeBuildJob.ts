const mocks = {
  startBuild: jest.fn().mockName('Mock: "aws-sdk".CodeBuild.prototype.startBuild()'),
  batchGetBuilds: jest.fn().mockName('Mock: "aws-sdk".CodeBuild.prototype.batchGetBuilds()'),
  stopBuild: jest.fn().mockName('Mock: "aws-sdk".CodeBuild.prototype.stopBuild()'),
  actionsCoreInfo: jest.fn().mockName('Mock: "@actions/core".info()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
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
  setFailed: mocks.actionsCoreSetFailed,
}));

jest.mock('../../../src/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    start: mocks.loggerStart,
    stop: mocks.loggerStop,
  })),
}));

import { CodeBuildJob } from '../../../src/codebuildjob';
import { StartBuildOutput, BatchGetBuildsOutput, BuildPhaseType, StopBuildOutput } from 'aws-sdk/clients/codebuild';

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
    const [onPhaseChanged] = [jest.fn(), jest.fn()];
    const job = new CodeBuildJob({ projectName: 'test' });

    job.on('phaseChanged', onPhaseChanged);

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'ENABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'QUEUED' as BuildPhaseType } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'PROVISIONING' as BuildPhaseType } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'BUILD' as BuildPhaseType } ] } as BatchGetBuildsOutput))
      .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'COMPLETED' as BuildPhaseType } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'QUEUED' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'PROVISIONING' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'BUILD' }));
    expect(loggerStart).toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'COMPLETED' }));

    await job.cancelBuild();
    expect(stopBuild).toBeCalled();
    expect(loggerStop).toBeCalled();
  });

  it('should complete whole cycle successfully without logs', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop } = mocks;
    const [onPhaseChanged] = [jest.fn(), jest.fn()];
    const job = new CodeBuildJob({ projectName: 'test' });

    job.on('phaseChanged', onPhaseChanged);

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'QUEUED' as BuildPhaseType } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'PROVISIONING' as BuildPhaseType } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'BUILD' as BuildPhaseType } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'COMPLETED' as BuildPhaseType } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'QUEUED' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'PROVISIONING' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'BUILD' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'COMPLETED' }));

    await job.cancelBuild();
    expect(stopBuild).toBeCalled();
    expect(loggerStop).not.toBeCalled();
  });

  it('should setFail GitHub Action job on failing of AWS CodeBuild job', async () => {
    const { startBuild, batchGetBuilds, stopBuild, loggerStart, loggerStop, actionsCoreSetFailed } = mocks;
    const [onPhaseChanged] = [jest.fn(), jest.fn()];
    const job = new CodeBuildJob({ projectName: 'test' });

    job.on('phaseChanged', onPhaseChanged);

    startBuild.mockReturnValueOnce(createAWSResponse({
      build: {
        id: 'test:testStreamID',
        logs: { cloudWatchLogs: { status: 'DISABLED' } },
      },
    } as StartBuildOutput));

    stopBuild.mockReturnValue(createAWSResponse({ build: {} } as StopBuildOutput));

    batchGetBuilds
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'QUEUED' as BuildPhaseType } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'PROVISIONING' as BuildPhaseType } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'BUILD' as BuildPhaseType } ] } as BatchGetBuildsOutput))
    .mockReturnValueOnce(createAWSResponse({ builds: [ { currentPhase: 'COMPLETED' as BuildPhaseType, buildStatus: 'FAILED' } ] } as BatchGetBuildsOutput))

    await job.startBuild();
    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'QUEUED' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'PROVISIONING' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'BUILD' }));
    expect(loggerStart).not.toBeCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onPhaseChanged).toHaveBeenLastCalledWith(expect.objectContaining({ currentPhase: 'COMPLETED', buildStatus: 'FAILED' }));

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