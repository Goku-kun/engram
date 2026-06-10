import * as cdk from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";

const app = new cdk.App();

const data = new DataStack(app, "EngramData");

new ApiStack(app, "EngramApi", { table: data.table, bucket: data.bucket });
