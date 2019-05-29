#!/bin/bash
set -e
set -o pipefail

echo '***Start***'

INSTRUCTION="If you want to deploy, try running the script with 'deploy stage stack-name region bucket-name', e.g. 'deploy dev cf-macro-test-outputs us-east-1 code-bucket'"

if [ $# -eq 0 ]; then
  echo "Missing arguments." 
  echo $INSTRUCTION
  exit 1
elif [ "$1" = "deploy" ] && [ $# -eq 5 ]; then
  STAGE=$2
  STACK_NAME=$3
  REGION=$4
  BUCKET_NAME=$5

  echo $BUCKET_NAME
  
  aws cloudformation package --template-file template.yml --output-template-file packaged.yml --s3-bucket $BUCKET_NAME --region $REGION
  aws cloudformation deploy --template-file packaged.yml --stack-name $STACK_NAME --capabilities CAPABILITY_IAM --region $REGION --no-fail-on-empty-changeset
elif [ "$1" = "publish" ] && [ $# -eq 2 ]; then
  REGION=$2
  ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" | tr -d \")
  BUCKET_NAME="devops-${REGION}-${ACCOUNT_ID}.solvehq.com"
  
  sam build
  aws cloudformation package --template-file .aws-sam/build/template.yaml --output-template-file .aws-sam/build/packaged.yml --s3-bucket $BUCKET_NAME --region $REGION
  sam publish --template .aws-sam/build/packaged.yml --region $REGION
else
  echo $INSTRUCTION
  exit 1
fi