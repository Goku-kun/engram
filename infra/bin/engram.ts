import * as cdk from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { ProcessingStack } from "../lib/processing-stack";

const app = new cdk.App();

const data = new DataStack(app, "EngramData");

new ApiStack(app, "EngramApi", {
  table: data.table,
  bucket: data.bucket,
  userPool: data.userPool,
  userPoolClient: data.userPoolClient,
});
new ProcessingStack(app, "EngramProcessing", {
  table: data.table,
  bucket: data.bucket,
});
