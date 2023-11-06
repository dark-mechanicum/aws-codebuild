const mocks: Record<string, jest.Mock> = {
  actionsCoreInfo: jest.fn().mockName('Mock: "@actions/core".info()'),
  actionsCoreGetInput: jest.fn().mockName('Mock: "@actions/core".getInput()'),
  actionsCoreGetBooleanInput: jest.fn().mockName('Mock: "@actions/core".getBooleanInput()'),
  actionsCoreSetFailed: jest.fn().mockName('Mock: "@actions/core".setFailed()'),
  actionsCoreError: jest.fn().mockName('Mock: "@actions/core".error()'),
  startBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuild()'),
  startBuildBatch: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.startBuildBatch()'),
  cancelBuild: jest.fn().mockName('Mock: "src/codebuildjob".CodeBuildJob.cancelBuild()'),
};

jest.mock('@actions/core', () => ({
  info: mocks.actionsCoreInfo,
  getInput: mocks.actionsCoreGetInput,
  getBooleanInput: mocks.actionsCoreGetBooleanInput,
  setFailed: mocks.actionsCoreSetFailed,
  error: mocks.actionsCoreError,
}));

describe('CodeBuildJob class functionality', () => {
  const OLD_ENV = { ...process.env };
  let CodeBuildJobMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...OLD_ENV }; // Make a copy
    CodeBuildJobMock = jest.fn(() => ({
      startBuild: mocks.startBuild,
      startBuildBatch: mocks.startBuildBatch,
      cancelBuild: mocks.cancelBuild,
    }))

    jest.mock('../../../src/codebuildjob', () => ({
      CodeBuildJob: CodeBuildJobMock,
    }));
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  afterEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    jest.resetModules(); // Most important - it clears the cache
    jest.unmock('../../../src/codebuildjob');
  });

  it('should trigger startBuild job successfully', async () => {
    process.env.INPUT_PROJECTNAME = 'test';
    process.env.INPUT_BUILDSTATUSINTERVAL = '5000';
    process.env.INPUT_DISPLAYBUILDLOGS = 'true';
    process.env.INPUT_LOGSUPDATEINTERVAL = '5000';
    process.env.INPUT_WAITTOBUILDEND = 'true';
    process.env.CODEBUILD__test__nested__variable = 'CODEBUILD__test_nested_variable';
    process.env.CODEBUILD__test__nested__bool = 'true';
    process.env.CODEBUILD__test__nested__number = '555';

    const { startBuild, actionsCoreGetInput, actionsCoreGetBooleanInput } = mocks;
    startBuild.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockImplementation((val: string) => {
      switch (val) {
        case 'projectName': return 'test';
        case 'buildStatusInterval': return '5000';
        case 'logsUpdateInterval': return '5000';
        case 'buildspec': return '{}';
        default: return '';
      }
    });

    actionsCoreGetBooleanInput.mockImplementation((val: string) => {
      switch (val) {
        case 'displayBuildLogs': return true;
        case 'waitToBuildEnd': return true;
        case 'redirectServiceURL': return false;
        case 'runBatch': return false;
        default: return false;
      }
    });

    require('../../../src/index');

    expect(CodeBuildJobMock).toHaveBeenLastCalledWith({
      projectName: 'test',
      test: {
        nested: {
          variable: 'CODEBUILD__test_nested_variable',
          bool: true,
          number: 555,
        },
      },
    }, {
      buildStatusInterval: 5000,
      displayBuildLogs: true,
      logsUpdateInterval: 5000,
      waitToBuildEnd: true,
      redirectServiceURL: undefined,
      runBatch: false,
    })
  });

  it('should trigger startBuildBatch job successfully', async () => {
    process.env.INPUT_PROJECTNAME = 'test';
    process.env.INPUT_BUILDSTATUSINTERVAL = '5000';
    process.env.INPUT_DISPLAYBUILDLOGS = 'true';
    process.env.INPUT_LOGSUPDATEINTERVAL = '5000';
    process.env.INPUT_WAITTOBUILDEND = 'true';
    process.env.INPUT_RUNBATCH = 'true';
    process.env.CODEBUILD__test__nested__variable = 'CODEBUILD__test_nested_variable';
    process.env.CODEBUILD__test__nested__bool = 'true';
    process.env.CODEBUILD__test__nested__number = '555';

    const { startBuildBatch, actionsCoreGetInput, actionsCoreGetBooleanInput } = mocks;
    startBuildBatch.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockImplementation((val: string) => {
      switch (val) {
        case 'projectName': return 'test';
        case 'buildStatusInterval': return '5000';
        case 'logsUpdateInterval': return '5000';
        case 'buildspec': return '{}';
        default: return '';
      }
    });

    actionsCoreGetBooleanInput.mockImplementation((val: string) => {
      switch (val) {
        case 'displayBuildLogs': return true;
        case 'waitToBuildEnd': return true;
        case 'redirectServiceURL': return false;
        case 'runBatch': return true;
        default: return false;
      }
    });

    require('../../../src/index');

    expect(CodeBuildJobMock).toHaveBeenLastCalledWith({
      projectName: 'test',
      test: {
        nested: {
          variable: 'CODEBUILD__test_nested_variable',
          bool: true,
          number: 555,
        },
      },
    }, {
      buildStatusInterval: 5000,
      displayBuildLogs: true,
      logsUpdateInterval: 5000,
      waitToBuildEnd: true,
      redirectServiceURL: undefined,
      runBatch: true,
    })
  });

  it('should cancel job on SIGINT signal', async () => {
    const { startBuild, actionsCoreGetInput, cancelBuild } = mocks;
    startBuild.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'buildspec' ? '{}' : 'test');
    require('../../../src/index');

    jest.spyOn(process, 'exit').mockImplementation(jest.fn().mockName('Mock process.exit()') as never);
    process.emit('SIGINT');
    expect(cancelBuild).toBeCalled();
  });

  it('should try to cancel job on SIGINT signal with exception', async () => {
    const { startBuild, actionsCoreGetInput, cancelBuild, actionsCoreError } = mocks;
    startBuild.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockImplementation((val: string): string => val === 'buildspec' ? '{}' : 'test');
    const error = new Error('test error');
    cancelBuild.mockImplementation(() => {throw error;});
    jest.spyOn(process, 'exit').mockImplementation(jest.fn().mockName('Mock process.exit()') as never);

    require('../../../src/index');
    process.emit('SIGINT');

    expect(cancelBuild).toBeCalled();
    expect(actionsCoreError).toHaveBeenLastCalledWith(error);
  });

  it('should use default values', async () => {
    process.env.INPUT_PROJECTNAME = 'test';
    process.env.INPUT_DISPLAYBUILDLOGS = 'true';
    process.env.INPUT_WAITTOBUILDEND = 'true';
    process.env.CODEBUILD__test__nested__variable = 'CODEBUILD__test_nested_variable';
    process.env.CODEBUILD__test__nested__bool = 'true';
    process.env.CODEBUILD__test__nested__number = '555';

    const { startBuild, actionsCoreGetInput, actionsCoreGetBooleanInput } = mocks;
    startBuild.mockReturnValue({ catch: jest.fn() });
    actionsCoreGetInput.mockImplementation((val: string): string => {
      switch (val) {
        case 'projectName': return 'test';
        case 'buildspec': return '{}';
        default: return '';
      }
    });

    actionsCoreGetBooleanInput.mockReturnValue(false);
    require('../../../src/index');

    expect(CodeBuildJobMock).toBeCalled();
    expect(CodeBuildJobMock).toHaveBeenLastCalledWith({
      projectName: 'test',
      test: {
        nested: {
          variable: 'CODEBUILD__test_nested_variable',
          bool: true,
          number: 555,
        },
      },
    }, {
      buildStatusInterval: 5000,
      displayBuildLogs: false,
      logsUpdateInterval: 5000,
      waitToBuildEnd: false,
      redirectServiceURL: undefined,
      runBatch: false,
    });
  });
});
