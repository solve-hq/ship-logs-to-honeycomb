# ship-logs-to-honeycomb

An [AWS SAM](https://github.com/awslabs/serverless-application-model) app that sends logs provided by the [lambda-logs-event-source app](https://github.com/solve-hq/lambda-logs-event-source) to [honeycomb.io](http://honeycomb.io/).

# Deploying

## Command Line

If deploying from the command line, you must first make sure you have the latest [aws-sam-cli](https://github.com/awslabs/aws-sam-cli) installed. View instructions for installation [here](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html).

To deploy to your account in a specific region, build the app using `sam build` and then deploy using `sam package` and `sam deploy`, like below:

```bash
$ sam build
$ sam package --template-file ./.aws-sam/build/template.yaml \
              --s3-bucket <S3 BUCKET NAME> \
              --output-template-file ./.aws-sam/build/packaged.yml \
              --region <TARGET AWS REGION>

$ sam deploy --template-file ./.aws-sam/build/packaged.yml \
             --stack-name <STACK NAME> \
             --capabilities CAPABILITY_IAM \
             --region <TARGET AWS REGION>
```

> **Note** The S3 bucket specified above must exist in the same region as the deployed stack, or else deploying will fail

### Honeycomb Credentials

Make sure to provide your Honeycomb `writeKey` and `dateset` to this app by creating a secret in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html).

> **Note** Make sure to create the secret in the same region the app is deploying to

![create secret 1](/assets/create-secret-1.png)
![create secret 2](/assets/create-secret-2.png)
![create secret 3](/assets/create-secret-3.png)
![create secret 4](/assets/create-secret-4.png)
