const setFailedMocks: Record<string, jest.Mock> = {
  actionsCoreGetInput: jest.fn().mockName('Mock: "@actions/core".getInput()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
  startBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuild()'),
};

const setFailedCodeBuildJobMock = jest.fn(() => ({
  startBuild: setFailedMocks.startBuild,
  cancelBuild: setFailedMocks.cancelBuild,
}))

jest.mock('@actions/core', () => ({
  info: setFailedMocks.actionsCoreInfo,
  getInput: setFailedMocks.actionsCoreGetInput,
  setFailed: setFailedMocks.actionsCoreSetFailed,
}));

jest.mock('../../../src/codebuildjob', () => ({
  CodeBuildJob: setFailedCodeBuildJobMock,
}));

describe('Testing setFailed functionality', () => {
  it('should set job failed on startBuild() error', async () => {
    const { startBuild, actionsCoreGetInput, actionsCoreSetFailed } = setFailedMocks;
    startBuild.mockRejectedValue(new Error('test'));
    actionsCoreGetInput.mockReturnValue('test');

    jest.requireMock('../../../src/index');
    await new Promise(process.nextTick);

    await expect(actionsCoreSetFailed).toBeCalled();
  });
});