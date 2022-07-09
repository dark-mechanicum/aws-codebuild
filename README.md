# dark-mechanicum/aws-codebuild

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
        uses: dark-mechanicum/aws-codebuild@1
        with:
          projectName: '<your-aws-codebuild-job-name-here>'
```

## Description

Under the hood it's using JavaScript AWS SDK for making calls to the AWS API. It means, you can put [any parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodeBuild.html#startBuild-property) for triggering your AWS CodeBuild Job. 

## AWS Credentials

You can use 2 ways how to put AWS access credentials to this action:

### Environment Variables
[Using environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables) (globally or locally):
* **AWS_ACCESS_KEY_ID** - AWS Access Key ID
* **AWS_SECRET_ACCESS_KEY** - AWS Secret Access Key
* **AWS_REGION** - AWS Region where is deployed a CodeBuild Project

### Using aws-actions/configure-aws-credentials GitHub Action
Setting up credentials files ([AWS Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html)). Simplest way to do it - use [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) GitHub Action.
```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ secrets.AWS_REGION }}

- name: AWS CodeBuild Job
  uses: dark-mechanicum/aws-codebuild@1
  with:
    projectName: '<your-aws-codebuild-job-name-here>'
```

## Configuration
Unfortunately, [GitHub Actions syntax](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions) do not support complex data types. I've made a decision to use environment variables for building configuration object overrides. It means, you can extend configuration for your AWS CodeBuild Job request with using of environment variables.

For overriding AWS CodeBuild Job request parameters, you need to define environment variable `CODEBUILD__environmentVariablesOverride` and assign complex and valid JSON value to that variable.


To example, if you want to override `environmentVariablesOverride` property (it requires array of objects), you need define `CODEBUILD__environmentVariablesOverride` and assign to it required JSON value 

```yaml
- name: AWS CodeBuild Job
  uses: dark-mechanicum/aws-codebuild@1
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
  uses: dark-mechanicum/aws-codebuild@1
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
      "Action": ["codebuild:StartBuild", "codebuild:BatchGetBuilds"],
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