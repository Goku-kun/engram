import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";
import * as path from "node:path";

interface ProcessingStackProps extends cdk.StackProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
}

const API_KEY_PARAM = "/engram/anthropic-api-key";

export class ProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ProcessingStackProps) {
    super(scope, id, props);

    const processor = new nodejs.NodejsFunction(this, "Processor", {
      entry: path.join(__dirname, "../../services/processor/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        TABLE_NAME: props.table.tableName,
        ANTHROPIC_API_KEY_PARAM: API_KEY_PARAM,
        ENGRAM_MODEL: "claude-opus-4-8",
      },
    });

    props.table.grantReadWriteData(processor);
    props.bucket.grantRead(processor);

    processor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          this.formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: API_KEY_PARAM.slice(1), // ARN form has no leading slash
          }),
        ],
      }),
    );

    const uploadsBucket = s3.Bucket.fromBucketName(
      this,
      "UploadsBucketRef",
      props.bucket.bucketName,
    );

    uploadsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processor),
      { prefix: "uploads/" },
    );
  }
}
