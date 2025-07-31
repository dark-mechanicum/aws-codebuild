const mocks = {
  getLogEvents: jest.fn().mockName('Mock: "aws-sdk".CloudWatchLogs.prototype.getLogEvents()'),
  actionsCoreInfo: jest.fn().mockName('Mock: "@actions/core".info()'),
  actionsCoreDebug: jest.fn().mockName('Mock: "@actions/core".debug()'),
  actionsCoreNotice: jest.fn().mockName('Mock: "@actions/core".notice()'),
  actionsCoreWarning: jest.fn().mockName('Mock: "@actions/core".warning()'),
  actionsCoreError: jest.fn().mockName('Mock: "@actions/core".error()'),
}

jest.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogs: jest.fn(() => ({
    getLogEvents: mocks.getLogEvents,
  })),
}));

jest.mock("@actions/core", () => ({
  info: mocks.actionsCoreInfo,
  debug: mocks.actionsCoreDebug,
  notice: mocks.actionsCoreNotice,
  warning: mocks.actionsCoreWarning,
  error: mocks.actionsCoreError,
}));

import { CloudWatchLogger } from '../../../src/logger';


describe('CloudWatchLogs Logger getEvents() method', () => {
  const createAWSResponse = (resolves: unknown) => resolves;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.unmock("@aws-sdk/client-cloudwatch-logs");
    jest.unmock("@actions/core");
    jest.useRealTimers();
  });

  afterEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
  })

  it('should successfully do a whole cycle for events downloading', async () => {
    const events = [
      { ingestionTime: (new Date()).getTime(), timestamp: (new Date()).getTime(), message: 'Test1' },
      { ingestionTime: (new Date()).getTime(), timestamp: (new Date()).getTime(), message: 'Test2' },
    ];

    const { getLogEvents, actionsCoreInfo } = mocks;
    getLogEvents
      // first getEvents call
      .mockReturnValueOnce(createAWSResponse({ events, nextForwardToken: 'blah' }))
      .mockReturnValueOnce(createAWSResponse({ events, nextForwardToken: 'blah' }))
      .mockReturnValueOnce(createAWSResponse({ events: [], nextForwardToken: 'blah' }))
      // second getEvents call
      .mockReturnValueOnce(createAWSResponse({ events, nextForwardToken: 'blah' }))
      .mockReturnValueOnce(createAWSResponse({ events, nextForwardToken: 'blah' }))
      .mockReturnValueOnce(createAWSResponse({ events: [], nextForwardToken: 'blah' }))

    const logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' }, { updateInterval: 5000 });

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toHaveBeenCalledTimes(3);
    expect(actionsCoreInfo).toHaveBeenCalledTimes(4);

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toHaveBeenCalledTimes(6);
    expect(actionsCoreInfo).toHaveBeenCalledTimes(8);
  });

  it('should cancel logs listening if have no access', async () => {
    const { getLogEvents, actionsCoreInfo, actionsCoreError } = mocks;
    const error = {
      message: 'test error',
      code: 'AccessDeniedException',
    } as Error & { code: string };

    getLogEvents.mockRejectedValue(error);
    const logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' }, { updateInterval: 5000 });
    const stopListenSpy = jest.spyOn(logger, 'stopListen');

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toHaveBeenCalledTimes(1);
    expect(actionsCoreInfo).not.toHaveBeenCalled();
    expect(actionsCoreError).toHaveBeenCalledTimes(1);
    expect(stopListenSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle recursive calls with nextForwardToken for paginated results', async () => {
    const events = [
      { ingestionTime: (new Date()).getTime(), timestamp: (new Date()).getTime(), message: 'Test1' },
      { ingestionTime: (new Date()).getTime(), timestamp: (new Date()).getTime(), message: 'Test2' },
    ];

    const { getLogEvents, actionsCoreInfo } = mocks;
    getLogEvents
      // First call returns nextForwardToken which triggers recursive call
      .mockReturnValueOnce(createAWSResponse({
        events,
        nextForwardToken: 'page2token'
      }))
      // Recursive call with nextForwardToken
      .mockReturnValueOnce(createAWSResponse({
        events: [{ ingestionTime: (new Date()).getTime(), timestamp: (new Date()).getTime(), message: 'Test3' }],
        nextForwardToken: null
      }));

    const logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' }, { updateInterval: 5000 });

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toHaveBeenCalledTimes(2);
    expect(actionsCoreInfo).toHaveBeenCalledTimes(3); // 2 from first call + 1 from recursive call
  });

  it('should handle other types of errors besides AccessDeniedException', async () => {
    const { getLogEvents, actionsCoreInfo, actionsCoreError } = mocks;
    const error = {
      message: 'some other error',
      code: 'UnknownError',
    } as Error & { code: string };

    getLogEvents.mockRejectedValue(error);
    const logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' }, { updateInterval: 5000 });
    const stopListenSpy = jest.spyOn(logger, 'stopListen');

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toHaveBeenCalledTimes(1);
    expect(actionsCoreInfo).not.toHaveBeenCalled();
    expect(actionsCoreError).toHaveBeenCalledTimes(1);
    expect(actionsCoreError).toHaveBeenCalledWith('some other error');
    expect(stopListenSpy).not.toHaveBeenCalled(); // Should not stop for non-AccessDeniedException
  });
});

describe('CloudWatchLogs Logger Timers', () => {
  let logger: CloudWatchLogger;

  beforeEach(() => {
    logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' }, { updateInterval: 5000 });
    logger['getEvents'] = jest.fn();
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should start timer and execute it 2 times', async () => {
    const getEventsMock = logger['getEvents'];
    await logger.startListen();

    expect(getEventsMock).toHaveBeenCalledTimes(1);
    logger.stopListen();
    jest.runOnlyPendingTimers();
    expect(getEventsMock).toHaveBeenCalledTimes(2);
  });

  it('should start timer and execute it 1 times on force stop', async () => {
    const getEventsMock = logger['getEvents'];
    await logger.startListen();

    expect(getEventsMock).toHaveBeenCalledTimes(1);
    logger.stopListen(true);
    jest.runOnlyPendingTimers();
    expect(getEventsMock).toHaveBeenCalledTimes(1);
  });
})
