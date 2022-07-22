const mocks = {
  actionsCoreError: jest.fn().mockName('Mock: "@actions/core".error()'),
  actionsCoreStartGroup: jest.fn().mockName('Mock: "@actions/core".startGroup()'),
  actionsCoreEndGroup: jest.fn().mockName('Mock: "@actions/core".endGroup()'),
  actionsCoreDebug: jest.fn().mockName('Mock: "@actions/core".debug()'),
  actionsCoreNotice: jest.fn().mockName('Mock: "@actions/core".notice()'),
  actionsCoreWarning: jest.fn().mockName('Mock: "@actions/core".warning()'),
}

jest.mock("@actions/core", () => ({
  error: mocks.actionsCoreError,
  startGroup: mocks.actionsCoreStartGroup,
  endGroup: mocks.actionsCoreEndGroup,
  debug: mocks.actionsCoreDebug,
  notice: mocks.actionsCoreNotice,
  warning: mocks.actionsCoreWarning,
}));

import { Logger } from '../../../src/logger';

describe('Decorator Logger functionality', () => {
  let logger: Logger;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.unmock("@actions/core");
    jest.useRealTimers();
  });

  beforeEach(() => {
    logger = new Logger({ type: 'cloudwatch', logGroupName: 'log_group_name', logStreamName: 'log_stream_name' });
    logger['logger']['startListen'] = jest.fn().mockReturnValue(Promise.resolve());
    logger['logger']['stopListen'] = jest.fn();
  });

  it('should trigger error for unknown logger type', async () => {
    expect(() => new Logger({ type: 'fake', logGroupName: 'log_group_name', logStreamName: 'log_stream_name' })).toThrowError('No found CloudWatch config for listening');
  });

  it('should exit with error on exception in startLogger', async () => {
    logger['logger']['startListen'] = () => Promise.reject('Test error');
    logger.start();

    await Promise.resolve(); // wait till all pending promises will be resolved

    expect(mocks.actionsCoreError).toBeCalled();
  });

  it('should call startListen only one time', async () => {
    const startListenMock = logger['logger']['startListen'];
    const stopListenMock = logger['logger']['stopListen'];

    logger.start();
    expect(startListenMock).toBeCalledTimes(1);

    logger.start();
    expect(startListenMock).toBeCalledTimes(1);

    logger.stop();
    expect(stopListenMock).toBeCalledTimes(1);
  });

  it('should close log group on process uncaughtException event', async () => {
    process.emit('uncaughtException', new Error());
    jest.runAllTicks();
    expect(mocks.actionsCoreEndGroup).toBeCalled();
  });

  it('should close log group on process exit event', async () => {
    process.emit('exit', 0);
    jest.runAllTicks();
    expect(mocks.actionsCoreEndGroup).toBeCalled();
  });
})