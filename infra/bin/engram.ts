import * as cdk from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";

const app = new cdk.App();

const data = new DataStack(app, "EngramData");
