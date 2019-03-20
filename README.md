# ship-logs-to-honeycomb

An [AWS SAM](https://github.com/awslabs/serverless-application-model) app that sends logs provided by the [lambda-logs-event-source app](https://github.com/solve-hq/lambda-logs-event-source) to [honeycomb.io](http://honeycomb.io/).

The `lambda-logs-event-source` app is a public app published to the Serverless Application Repository ([public link](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:958845080241:applications~lambda-logs-event-source)) which is deployed as a child of this app automatically by using the `AWS::Serverless::Application` resource in the SAM template. You can optionally configure a few parameters exposed by `lambda-logs-event-source` by editing the resource in the [template.yml](template.yml) file:

```yaml
LogSource:
  Type: AWS::Serverless::Application
  Properties:
    Location:
      ApplicationId: arn:aws:serverlessrepo:us-east-1:958845080241:applications/lambda-logs-event-source
      SemanticVersion: 1.0.4
    Parameters:
      EventProcessorFunctionName: !Ref ShipLogsToHoney
      DebugEnabled: "no" # set this to "yes" to enable debug logs in the lambda-logs-event-source functions
      RetentionDays: 7 # set this to the number of days to retain cloudwatch logs
```

`lambda-logs-event-source` does the following:

- Sets the retention policy of newly created Lambda & API Gateway CloudWatch Log Groups to the configured number of days
- Subscribes to newly created Lambda & API Gateway CloudWatch Log Groups
- Parses JSON logs in Lambda Log Groups and invokes the `ShipLogsToHoney` function with those events
- Parses API Gateway logs and converts them to events, and then invokes the `ShipLogsToHoney` function with those events

`ShipLogsToHoney` sends events sourced from `lambda-logs-event-source` to honeycomb.io, using the credentials provided by the `ShipLogs/HoneycombIO` secret in Secrets Manager (see below for details).

`ShipLogsToHoney` does no preprocessing to the events sourced from Lambda functions, simply sending them along to honeycomb.io. For events sourced from API Gateway Logs, `ShipLogsToHoney` uses data in the request logs to add tracing data to the event before sending to honeycomb.io.

# Deploying

## Command Line

If deploying from the command line, you must first make sure you have the latest [aws-sam-cli](https://github.com/awslabs/aws-sam-cli) installed. View instructions for installation [here](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html).

To deploy to your account, build the app using `sam build` and then deploy using `sam package` and `sam deploy`, like below:

```bash
$ sam build
$ sam package --template-file ./.aws-sam/build/template.yaml \
              --s3-bucket <S3 BUCKET NAME> \
              --output-template-file ./.aws-sam/build/packaged.yml \
              --region <REGION>

$ sam deploy --template-file ./.aws-sam/build/packaged.yml \
             --stack-name <STACK NAME> \
             --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
             --region <REGION>
```

> **Note** The S3 bucket specified above must exist in the same region as the deployed stack, or else deploying will fail.

### Honeycomb Credentials

Make sure to provide your Honeycomb `writeKey` and `dateset` to this app by creating a secret in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) named `ShipLogs/HoneycombIO`, like so:

> **Note** Make sure to create the secret in the same region as this app

![Create Secret Step 1](/assets/create-secret-1.png)
![Create Secret Step 2](/assets/create-secret-2.png)
![Create Secret Step 3](/assets/create-secret-3.png)
![Create Secret Step 4](/assets/create-secret-4.png)
