import { CodeBuildJob } from './codebuildjob';

const build = new CodeBuildJob({ projectName: 'testing-codebuild-logs' });
build.startBuild().catch(e => console.error(e));