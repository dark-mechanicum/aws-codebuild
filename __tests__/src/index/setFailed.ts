const setFailedMocks: Record<string, jest.Mock> = {
  actionsCoreGetInput: jest.fn().mockName('Mock: "@actions/core".getInput()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
  startBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuild()'),
  startBuildBatch: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuildBatch()'),
};

const setFailedCodeBuildJobMock = jest.fn(() => ({
  startBuild: setFailedMocks.startBuild,
  startBuildBatch: setFailedMocks.startBuildBatch,
  cancelBuild: setFailedMocks.cancelBuild,
}));

jest.mock('@actions/core', () => ({
  getInput: setFailedMocks.actionsCoreGetInput,
  setFailed: setFailedMocks.actionsCoreSetFailed,
}));

jest.mock('../../../src/codebuildjob', () => ({
  CodeBuildJob: setFailedCodeBuildJobMock,
}));

describe('Testing setFailed startBuild() and startBuildBatch() functionality', () => {
  it('should set job failed on startBuild() error', async () => {
    const { startBuild, actionsCoreGetInput, actionsCoreSetFailed } = setFailedMocks;
    startBuild.mockRejectedValue(new Error('test'));
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'buildspec' ? '{}' : 'test');
    // Set the "runBatch" option to true
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'runBatch' ? 'false' : 'test');

    jest.requireMock('../../../src/index');
    await new Promise(process.nextTick);

    await expect(actionsCoreSetFailed).toBeCalled();
  });

  it('should set job failed on startBuildBatch() error', async () => {
    const { startBuildBatch, actionsCoreGetInput, actionsCoreSetFailed } = setFailedMocks;
    startBuildBatch.mockRejectedValue(new Error('test'));
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'buildspec' ? '{}' : 'test');
    // Set the "runBatch" option to true
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'runBatch' ? 'true' : 'test');

    jest.requireMock('../../../src/index');
    await new Promise(process.nextTick);

    await expect(actionsCoreSetFailed).toBeCalled();
  });

  it('should set job failed on startBuildBatch() error when "runBatch" option is true', async () => {
    const { startBuildBatch, actionsCoreGetInput, actionsCoreSetFailed } = setFailedMocks;
    startBuildBatch.mockRejectedValue(new Error('test'));
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'buildspec' ? '{}' : 'test');

    // Set the "runBatch" option to true
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'runBatch' ? 'true' : 'test');

    jest.requireMock('../../../src/index');
    await new Promise(process.nextTick);

    await expect(actionsCoreSetFailed).toBeCalled();
  });
});
