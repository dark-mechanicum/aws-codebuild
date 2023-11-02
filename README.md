# About

Forked from dark-mechanicum/aws-codebuild

# dark-mechanicum/aws-codebuild

[![CodeQL Badge for v1 tag](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/codeql.yml/badge.svg?tag=v1)](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/codeql.yml)
[![Validation Badge for v1 tag](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/validation.yml/badge.svg?tag=v1)](https://github.com/dark-mechanicum/aws-codebuild/actions/workflows/validation.yml)

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

Under the hood it's using JavaScript AWS SDK for making calls to the AWS API. It means, you can put [any parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodeBuild.html#startBuild-property) for triggering your AWS CodeBuild Job.

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

* `projectName` [string] [required] - The name of the CodeBuild build project to start running a build
* `buildStatusInterval` [number] [optional] - Interval in milliseconds to control how often should be checked status of build
* `logsUpdateInterval` [number] [optional] - Interval in milliseconds to control how often should be checked new events in logs stream
* `waitToBuildEnd` [boolean] [optional] - Wait till AWS CodeBuild job will be finished
* `displayBuildLogs` [boolean] [optional] - Display AWS CodeBuild logs output in the GitHub Actions logs output
* `redirectServiceURL` [string] [optional] - In case if that option will be enabled, in the Summary Report, all links will be replaced by the pattern `${redirectServiceURL}${base64_encoded/link}`. That can be useful when some other actions masking credentials like AWS Account ID, Region etc. It will make default generated urls unusable. You can use `https://cloudaws.link/r/` value like example of service usage
* `buildspec` [string] [optional] - Custom parameters to override job parameters in the valid JSON format. Full list of supported parameters you can find in the [CodeBuild.startBuild()](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodeBuild.html#startBuild-property) documentation

## AWS Credentials

You can use 2 ways how to put AWS access credentials to this action:

### Environment Variables
[Using environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables) (globally or locally):
* **AWS_ACCESS_KEY_ID** - AWS Access Key ID
* **AWS_SECRET_ACCESS_KEY** - AWS Secret Access Key
* **AWS_REGION** - AWS Region where is deployed a CodeBuild Project

### Using aws-actions/configure-aws-credentials GitHub Action
Setting up credentials files ([AWS Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html)). Simplest way to do it - use [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) GitHub Action.

Important: if you want a links working correctly in Summary report, remember that action will mask by `***` region, account number and other credentials. If you want make links working, you should assign redirect service to the `redirectServiceURL` action input.
```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v1
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

Most elegant way to implement overriding of [CodeBuild.startBuild()](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodeBuild.html#startBuild-property) is using `buildspec` input. The `buildspec` input should contain valid JSON object with values that you are planning to override.

```yaml
- name: Executing AWS CodeBuild task
  uses: dark-mechanicum/aws-codebuild@v1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
    buildspec: '{
      "environmentVariablesOverride":[
        { "name":"testEnvVar1", "value":"Testing environment variable", "type": "PLAINTEXT" },
        { "name":"testEnvVar2", "value":"${{ secrets.SOME_SECRET }}", "type": "PLAINTEXT" },
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
      "Resource": [
        "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/codebuild/PROJECT_NAME:*"
      ]
    }
  ]
}
```

## GitHub Action Outputs

Current action provides a set of outputs, that you can use in the next steps:

* `id` [string] - The unique ID for the build
* `success` [boolean] - Flag that marks is current AWS CodeBuild job was finished successfully
* `buildNumber` [number] - The number of the build. For each project, the buildNumber of its first build is 1. The buildNumber of each subsequent build is incremented by 1. If a build is deleted, the buildNumber of other builds does not change.
* `timeoutInMinutes` [number] - How long, in minutes, from 5 to 480 (8 hours), for CodeBuild to wait before timing out any related build that did not get marked as completed. The default is 60 minutes
* `initiator` [string] - The AWS entity that started the build
* `buildStatus` [string] - The final status of the build. Valid values include:
  * `FAILED`: The build failed.
  * `FAULT`: The build faulted.
  * `IN_PROGRESS`: The build is still in progress.
  * `STOPPED`: The build stopped.
  * `SUCCEEDED`: The build succeeded.
  * `TIMED_OUT`: The build timed out.
