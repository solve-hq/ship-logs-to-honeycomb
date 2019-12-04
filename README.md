# ship-logs-to-honeycomb

An AWS [Serverless Application Repository](https://serverlessrepo.aws.amazon.com/applications) (SAR) app that sends logs and traces to [honeycomb.io](http://honeycomb.io/).

This app works with both CloudWatch Logs directly as well as through a Kinesis stream. To decide when to use which, give these two posts a read:

- [Centralised logging for AWS Lambda](https://theburningmonk.com/2017/08/centralised-logging-for-aws-lambda/)
- [Centralised logging for AWS Lambda, REVISED(2018)](https://theburningmonk.com/2018/07/centralised-logging-for-aws-lambda-revised-2018/)

Besides shipping your Lambda function logs, it can also process API Gateway logs and turn them into traces in HoneyComb.

## Deploying

You can deploy from the SAR console [here](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:968223882765:applications~ship-logs-to-honeycomb). Just click the `Deploy` and follow the instructions to deploy the app to your region.

Alternatively, you can also include it in your [AWS SAM](https://github.com/awslabs/serverless-application-model) project as a serverless app, like this:

```yml
ShipLogsToHoneycomb:
  Type: AWS::Serverless::Application
  Properties:
    Location:
      ApplicationId: arn:aws:serverlessrepo:us-east-1:968223882765:applications/ship-logs-to-honeycomb
      SemanticVersion: <check the repo page to find latest version>
    Parameters:
      EventSourceType: Kinesis
      SecretId: HoneycombIO/credentials
      KinesisStreamArn: !GetAtt LogStream.Arn
```

### Honeycomb Credentials

Make sure to provide your Honeycomb `writeKey` and `dateset` to this app by creating a secret in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) named `ShipLogs/HoneycombIO`, like so:

> **Note** Make sure to create the secret in the same region as this app

![Create Secret Step 1](https://github.com/solve-hq/ship-logs-to-honeycomb/raw/master/assets/create-secret-1.png)
![Create Secret Step 2](https://github.com/solve-hq/ship-logs-to-honeycomb/raw/master/assets/create-secret-2.png)
![Create Secret Step 3](https://github.com/solve-hq/ship-logs-to-honeycomb/raw/master/assets/create-secret-3.png)
![Create Secret Step 4](https://github.com/solve-hq/ship-logs-to-honeycomb/raw/master/assets/create-secret-4.png)

### Overriding the Dataset

You can override the `dataset` that is used if your event includes the `dataset` key/value pair.
