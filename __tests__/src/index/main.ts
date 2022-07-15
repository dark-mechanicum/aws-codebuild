const mocks: Record<string, jest.Mock> = {
  actionsCoreInfo: jest.fn().mockName('Mock: "@actions/core".info()'),
  actionsCoreGetInput: jest.fn().mockName('Mock: "@actions/core".getInput()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
  startBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuild()'),
  cancelBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.cancelBuild()'),
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

describe('CodeBuildJob class functionality', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules() // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  afterEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  it('should trigger job successfully', async () => {
    process.env.INPUT_PROJECTNAME = 'test';
    process.env.CODEBUILD__test__nested__variable = 'CODEBUILD__test_nested_variable';
    process.env.CODEBUILD__test__nested__bool = 'true';
    process.env.CODEBUILD__test__nested__number = '555';

    const { startBuild, actionsCoreGetInput } = mocks;
    startBuild.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockReturnValue('test');

    jest.requireMock('../../../src/index');

    expect(CodeBuildJobMock).toHaveBeenLastCalledWith({
      projectName: 'test',
      test: {
        nested: {
          variable: 'CODEBUILD__test_nested_variable',
          bool: true,
          number: 555,
        },
      },
    })
  });

  it('should cancel job on SIGINT signal', async () => {
    const { startBuild, actionsCoreGetInput, cancelBuild } = mocks;
    startBuild.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockReturnValue('test');
    jest.requireMock('../../../src/index');

    jest.spyOn(process, 'exit').mockImplementation(jest.fn().mockName('Mock process.exit()') as never);
    process.emit('SIGINT');
    expect(cancelBuild).toBeCalled();
  });
});