const mocks: Record<string, jest.Mock> = {
  actionsCoreGetInput: jest.fn().mockName('Mock: "@actions/core".getInput()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
  startBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuild()'),
};

const CodeBuildJobMock = jest.fn(() => ({
  startBuild: mocks.startBuild,
  cancelBuild: mocks.cancelBuild,
}))

jest.mock('@actions/core', () => ({
  info: mocks.actionsCoreInfo,
  getInput: mocks.actionsCoreGetInput,
  setFailed: mocks.actionsCoreSetFailed,
}));

jest.mock('../../../src/codebuildjob', () => ({
  CodeBuildJob: CodeBuildJobMock,
}));

describe('Testing setfailed functionality', () => {
  it('should set job failed on startBuild() error', async () => {
    const { startBuild, actionsCoreGetInput, actionsCoreSetFailed } = mocks;
    startBuild.mockRejectedValue(new Error('test'));
    actionsCoreGetInput.mockReturnValue('test');

    jest.requireMock('../../../src/index');
    await new Promise(process.nextTick);

    await expect(actionsCoreSetFailed).toBeCalled();
  });
});