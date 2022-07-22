const utilsMocks = {
  actionsCoreDebug: jest.fn().mockName('Mock: "@actions/core".debug()'),
  actionsCoreError: jest.fn().mockName('Mock: "@actions/core".error()'),
};

jest.mock('@actions/core', () => ({
  debug: utilsMocks.actionsCoreDebug,
  error: utilsMocks.actionsCoreError,
}));

describe('Utils functionality testing', () => {
  it('should report about error in stringifying of additional data for debug', async () => {
    const error = new Error('Test error');
    const stringifyMock = jest.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('Test error'); });

    const { debug } = jest.requireActual('../../../src/utils.ts');
    const { actionsCoreDebug, actionsCoreError } = utilsMocks;

    expect(() => debug('Test')).not.toThrow();
    expect(stringifyMock).toBeCalledTimes(1);
    expect(actionsCoreDebug).toBeCalledTimes(2);
    expect(actionsCoreError).toBeCalledTimes(1);

    expect(actionsCoreError).lastCalledWith(error);
    expect(actionsCoreDebug).nthCalledWith(1, `[DEBUG] Can't stringify additional debug data for the message: Test. Error: Test error`);
    expect(actionsCoreDebug).nthCalledWith(2, `[DEBUG] Test`);

    stringifyMock.mockRestore();
  });
});