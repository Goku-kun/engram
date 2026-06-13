import * as cdk from "aws-cdk-lib";
import * as s3vectors from "aws-cdk-lib/aws-s3vectors";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class DataStack extends cdk.Stack {
  readonly table: dynamodb.Table;
  readonly bucket: s3.Bucket;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly vectorBucketName: string;
  readonly vectorIndexName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.bucket = new s3.Bucket(this, "Uploads", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins: [
            "http://localhost:3000",
            "https://engram-delta.vercel.app",
          ],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          prefix: "uploads/",
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    this.userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      authFlows: { userSrp: true, userPassword: true },
      preventUserExistenceErrors: true,
    });

    this.vectorBucketName = `engram-vectors-${this.account}`;
    this.vectorIndexName = "cards";

    const vectorBucket = new s3vectors.CfnVectorBucket(this, "Vectors", {
      vectorBucketName: this.vectorBucketName,
    });
    const vectorIndex = new s3vectors.CfnIndex(this, "VectorIndex", {
      vectorBucketName: this.vectorBucketName,
      indexName: this.vectorIndexName,
      dataType: "float32",
      dimension: 1024,
      distanceMetric: "cosine",
      metadataConfiguration: {
        nonFilterableMetadataKeys: ["text", "deckTitle"],
      },
    });
    vectorIndex.addDependency(vectorBucket);

    new cdk.CfnOutput(this, "TableName", { value: this.table.tableName });
    new cdk.CfnOutput(this, "BucketName", { value: this.bucket.bucketName });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "VectorBucketName", {
      value: this.vectorBucketName,
    });

    new cdk.CfnOutput(this, "VectorIndexName", {
      value: this.vectorIndexName,
    });
  }
}
