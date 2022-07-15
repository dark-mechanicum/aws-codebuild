const mocks = {
  getLogEvents: jest.fn().mockName('Mock: "aws-sdk".CloudWatchLogs.prototype.getLogEvents()'),
  actionsCoreInfo: jest.fn().mockName('Mock: "@actions/core".info()'),
}

jest.mock("aws-sdk", () => ({
  CloudWatchLogs: jest.fn(() => ({
    getLogEvents: mocks.getLogEvents,
  })),
}));

jest.mock("@actions/core", () => ({
  info: mocks.actionsCoreInfo,
}));

import { CloudWatchLogger } from '../../../src/logger';


describe('CloudWatchLogs Logger getEvents() method', () => {
  const createAWSResponse = (resolves: unknown) => ({ promise: () => Promise.resolve(resolves) });

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.unmock("aws-sdk");
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

    const logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' });

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toBeCalledTimes(3);
    expect(actionsCoreInfo).toBeCalledTimes(4);

    await expect(logger['getEvents']()).resolves.toBeUndefined();
    expect(getLogEvents).toBeCalledTimes(6);
    expect(actionsCoreInfo).toBeCalledTimes(8);
  });
});

describe('CloudWatchLogs Logger Timers', () => {
  let logger: CloudWatchLogger;

  beforeEach(() => {
    logger = new CloudWatchLogger({ logGroupName: 'log_group_name', logStreamName: 'log_stream_name' });
    logger['getEvents'] = jest.fn();
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should start timer and execute it 2 times', async () => {
    const getEventsMock = logger['getEvents'];
    await logger.startListen();

    expect(getEventsMock).toBeCalledTimes(1);
    logger.stopListen();
    jest.runOnlyPendingTimers();
    expect(getEventsMock).toBeCalledTimes(2);
  });

  it('should start timer and execute it 1 times on force stop', async () => {
    const getEventsMock = logger['getEvents'];
    await logger.startListen();

    expect(getEventsMock).toBeCalledTimes(1);
    logger.stopListen(true);
    jest.runOnlyPendingTimers();
    expect(getEventsMock).toBeCalledTimes(1);
  });
})