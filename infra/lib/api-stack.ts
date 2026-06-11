import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as path from "node:path";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";

interface ApiStackProps extends cdk.StackProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const uploadUrlFn = new nodejs.NodejsFunction(this, "UploadUrlFn", {
      entry: path.join(__dirname, "../../services/upload-url/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.bucket.bucketName,
      },
    });
    props.table.grantReadWriteData(uploadUrlFn);
    props.bucket.grantPut(uploadUrlFn);

    const authorizer = new HttpJwtAuthorizer(
      "JwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "engram",
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: ["http://localhost:3000"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["content-type", "authorization"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    httpApi.addRoutes({
      path: "/uploads",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration("UploadIntegration", uploadUrlFn),
    });

    const apiFn = new nodejs.NodejsFunction(this, "ApiFn", {
      entry: path.join(__dirname, "../../services/api/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: props.table.tableName,
      },
    });
    props.table.grantReadWriteData(apiFn);

    const apiIntegration = new HttpLambdaIntegration("ApiIntegration", apiFn);
    httpApi.addRoutes({
      path: "/decks",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/decks/{deckId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/decks/{deckId}/attempts",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: apiIntegration,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
  }
}
