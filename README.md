# dark-mechanicum/aws-codebuild

[![CodeQL Badge](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/codeql.yml/badge.svg)](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/codeql.yml)
[![Validation Badge](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/validation.yml/badge.svg)](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/validation.yml)
[![Release Version](https://img.shields.io/github/v/release/dark-mechanicum/aws-codebuild)](https://github.com/dark-mechanicum/aws-codebuild/releases)
[![License](https://img.shields.io/github/license/dark-mechanicum/aws-codebuild)](LICENSE)

Simple, but very powerful GitHub Action to trigger AWS CodeBuild jobs with overrides all parameters and job execution log output.

```yaml
name: Running example
on: [push]

env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  AWS_REGION: ${{ secrets.AWS_REGION }}

jobs:
  deploy:
    name: 'Deployment'
    runs-on: ubuntu-latest
    steps:
      - name: Executing AWS CodeBuild task
        uses: dark-mechanicum/aws-codebuild@v1
        with:
          projectName: '<your-aws-codebuild-job-name-here>'
```

## Description

Under the hood it's using AWS SDK for JavaScript (v3) for making calls to the AWS API. It means, you can put [any parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codebuild/command/StartBuildCommand/) for triggering your AWS CodeBuild Job.

In case if AWS CodeBuild job execution will be failed, it also will fail execution of GitHub Action.

In case if you have enabled AWS CloudWatch logs for AWS CodeBuild job execution, it will put AWS CloudWatch logs output in the GitHub Actions logs output.

## Inputs

```yaml
- name: Executing AWS CodeBuild task
  uses: dark-mechanicum/aws-codebuild@v1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
    buildStatusInterval: 5000
    logsUpdateInterval: 5000
    waitToBuildEnd: true
    displayBuildLogs: true
    redirectServiceURL: 'https://cloudaws.link/r/'
    buildspec: '{
      "environmentVariablesOverride":[
        { "name":"testEnvVar", "value":"Testing environment variable", "type": "PLAINTEXT" }
      ],
      "logsConfigOverride": {
        "cloudWatchLogs": {
          "status": "ENABLED"
        }
      }
    }'
```

- `projectName` [string] [required] - The name of the CodeBuild build project to start running a build
- `buildStatusInterval` [number] [optional] - Interval in milliseconds to control how often should be checked status of build
- `logsUpdateInterval` [number] [optional] - Interval in milliseconds to control how often should be checked new events in logs stream
- `waitToBuildEnd` [boolean] [optional] - Wait till AWS CodeBuild job will be finished
- `displayBuildLogs` [boolean] [optional] - Display AWS CodeBuild logs output in the GitHub Actions logs output
- `redirectServiceURL` [string] [optional] - In case if that option will be enabled, in the Summary Report, all links will be replaced by the pattern `${redirectServiceURL}${base64_encoded/link}`. That can be useful when some other actions masking credentials like AWS Account ID, Region etc. It will make default generated urls unusable. You can use `https://cloudaws.link/r/` value like example of service usage
- `buildspec` [string] [optional] - Custom parameters to override job parameters in the valid JSON format. Full list of supported parameters you can find in the [StartBuildCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codebuild/command/StartBuildCommand/) documentation

## AWS Credentials

You can use 2 ways how to put AWS access credentials to this action:

### Environment Variables

[Using environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables) (globally or locally):

- **AWS_ACCESS_KEY_ID** - AWS Access Key ID
- **AWS_SECRET_ACCESS_KEY** - AWS Secret Access Key
- **AWS_REGION** - AWS Region where is deployed a CodeBuild Project

### Using aws-actions/configure-aws-credentials GitHub Action

Setting up credentials files ([AWS Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html)). Simplest way to do it - use [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) GitHub Action.

Important: if you want a links working correctly in Summary report, remember that action will mask by `***` region, account number and other credentials. If you want make links working, you should assign redirect service to the `redirectServiceURL` action input.

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ secrets.AWS_REGION }}

- name: AWS CodeBuild Job
  uses: dark-mechanicum/aws-codebuild@v1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
```

## Configuration

Unfortunately, [GitHub Actions syntax](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions) do not support complex data types. I've made a decision to use environment variables for building configuration object overrides. It means, you can extend configuration for your AWS CodeBuild Job request with using of environment variables.

Most elegant way to implement overriding of [StartBuildCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codebuild/command/StartBuildCommand/) is using `buildspec` input. The `buildspec` input should contain valid JSON object with values that you are planning to override.

```yaml
- name: Executing AWS CodeBuild task
  uses: dark-mechanicum/aws-codebuild@v1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
    buildspec: '{
      "environmentVariablesOverride":[
        { "name":"testEnvVar1", "value":"Testing environment variable", "type": "PLAINTEXT" },
        { "name":"testEnvVar2", "value":"${{ secrets.SOME_SECRET }}", "type": "PLAINTEXT" }
      ],
      "logsConfigOverride": {
        "cloudWatchLogs": {
          "status": "ENABLED"
        }
      }
    }'
```

---

For overriding through environment variables, you need to define environment variable `CODEBUILD__environmentVariablesOverride` and assign complex and valid JSON value to that variable.

To example, if you want to override `environmentVariablesOverride` property (it requires array of objects), you need define `CODEBUILD__environmentVariablesOverride` and assign to it required JSON value

```yaml
- name: AWS CodeBuild Job
  uses: dark-mechanicum/aws-codebuild@v1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
  env:
    CODEBUILD__environmentVariablesOverride: '[
      { "name":"testEnvVar1", "value":"Testing environment variable", "type": "PLAINTEXT" },
      { "name":"testEnvVar2", "value":"${{ secrets.AWS_REGION }}", "type": "PLAINTEXT" }
    ]'
```

In case, if configuration option do not have a complex type, you can define single environment variable with required to you value.

```yaml
- name: AWS CodeBuild Job
  uses: dark-mechanicum/aws-codebuild@v1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
  env:
    CODEBUILD__logsConfigOverride__cloudWatchLogs__status: 'DISABLED'
    CODEBUILD__privilegedModeOverride: 'false'
```

Please, keep in mind, that **you need to use** `__` separator for nested properties, if you want override nested property only.

## CloudWatch Logs

AWS CodeBuild using by default AWS CloudWatch Logs for your CodeBuild Job logs output. It means the logs can be placed in default logs group `/aws/codebuild/<your-codebuild-project-name>` with stream ID the same as AWS CodeBuild Job ID. Or it can be placed according to configuration of AWS CodeBuild Project. Both variants supported automatically.

## AWS Permissions ([Documentation](https://github.com/aws-actions/aws-codebuild-run-build/blob/master/README.md#credentials-and-permissions))

You need to grant permissions for triggering AWS CodeBuild Project Jobs and read AWS CloudWatch Logs in you AWS Console.

The credentials that you provide need to have the following permissions:

- `codebuild:StartBuild`
- `codebuild:BatchGetBuilds`
- `logs:GetLogEvents`

For example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["codebuild:StartBuild", "codebuild:StopBuild", "codebuild:BatchGetBuilds"],
      "Resource": ["arn:aws:codebuild:REGION:ACCOUNT_ID:project/PROJECT_NAME"]
    },
    {
      "Effect": "Allow",
      "Action": ["logs:GetLogEvents"],
      "Resource": ["arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/codebuild/PROJECT_NAME:*"]
    }
  ]
}
```

## GitHub Action Outputs

Current action provides a set of outputs, that you can use in the next steps:

- `id` [string] - The unique ID for the build
- `success` [boolean] - Flag that marks is current AWS CodeBuild job was finished successfully
- `buildNumber` [number] - The number of the build. For each project, the buildNumber of its first build is 1. The buildNumber of each subsequent build is incremented by 1. If a build is deleted, the buildNumber of other builds does not change.
- `timeoutInMinutes` [number] - How long, in minutes, from 5 to 480 (8 hours), for CodeBuild to wait before timing out any related build that did not get marked as completed. The default is 60 minutes
- `initiator` [string] - The AWS entity that started the build
- `buildStatus` [string] - The final status of the build. Valid values include:
  - `FAILED`: The build failed.
  - `FAULT`: The build faulted.
  - `IN_PROGRESS`: The build is still in progress.
  - `STOPPED`: The build stopped.
  - `SUCCEEDED`: The build succeeded.
  - `TIMED_OUT`: The build timed out.

## GitHub Actions Summary

This action automatically generates a detailed [job summary](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary) that appears in the GitHub Actions UI. The summary includes:

- **Build Information**: Job ID, project name, initiator, and execution time
- **AWS Console Link**: Direct link to the CodeBuild job in AWS Console
- **CloudWatch Logs Link**: Link to view logs in AWS CloudWatch (when logs are enabled)
- **Build Configuration**: The buildspec parameters used to start the job
- **Build Phases Table**: Detailed breakdown of each build phase with status and duration

The summary is automatically generated when the build completes and provides a comprehensive overview of the CodeBuild execution without requiring manual log parsing.

### Link Redirection Service

When using the `redirectServiceURL` parameter, all AWS console and CloudWatch links in the summary will be encoded through the redirect service. This is useful when other GitHub Actions mask AWS credentials (account ID, region) making direct links unusable.

Example redirect URL: `https://cloudaws.link/r/`

## Requirements

- **Node.js**: 20 or higher
- **GitHub Actions**: Compatible with all GitHub Actions environments
- **AWS SDK**: Uses AWS SDK for JavaScript v3

## Troubleshooting

### Common Issues

**CodeBuild job fails to start**

- Verify that the `projectName` matches exactly with your AWS CodeBuild project name
- Check that your AWS credentials have `codebuild:StartBuild` permission
- Ensure the CodeBuild project exists in the specified AWS region

**Logs not displaying**

- Verify CloudWatch logs are enabled in your CodeBuild project settings
- Check that your AWS credentials have `logs:GetLogEvents` permission
- Ensure the `displayBuildLogs` input is set to `true` (default)

**Links in summary not working**

- AWS console links may be masked by `aws-actions/configure-aws-credentials`
- Use the `redirectServiceURL` parameter to enable working links
- Example: `redirectServiceURL: 'https://cloudaws.link/r/'`

**Build hangs or times out**

- Check the `buildStatusInterval` setting (default: 5000ms)
- Verify your CodeBuild project timeout settings
- Review CloudWatch logs for build-specific issues

**Permission denied errors**

- Ensure your AWS credentials have all required permissions:
  - `codebuild:StartBuild`
  - `codebuild:StopBuild`
  - `codebuild:BatchGetBuilds`
  - `logs:GetLogEvents`

### Getting Help

- Check the [GitHub Issues](https://github.com/dark-mechanicum/aws-codebuild/issues) for similar problems
- Review [AWS CodeBuild documentation](https://docs.aws.amazon.com/codebuild/) for build-specific issues
- Verify your AWS IAM policies match the required permissions above

## Migration Guide

### Upgrading to v1.4.x

- **Node.js**: Minimum version requirement is now Node.js 20
- **AWS SDK**: Migrated from AWS SDK v2 to v3 (no breaking changes for users)
- **GitHub Actions Summary**: Now automatically generated (no configuration required)
- **Version Reference**: Update your workflows to use `@v1.4.1` or `@v1` for latest v1.x.x

### From v1.3.x to v1.4.x

No breaking changes. Simply update the version in your workflow:

```yaml
# Before
uses: dark-mechanicum/aws-codebuild@v1.3.9

# After
uses: dark-mechanicum/aws-codebuild@v1
```

## Changelog

See [Releases](https://github.com/dark-mechanicum/aws-codebuild/releases) for detailed changelog of each version.
