import { S3Client } from "bun";

const globalForS3 = globalThis as unknown as {
  awsClient: S3Client | undefined;
};

export const Awsclient =
  globalForS3.awsClient ??
  new S3Client({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    bucket: process.env.AWS_BUCKET!,
    region: process.env.AWS_REGION!,
  });

if (process.env.NODE_ENV !== "production") {
  globalForS3.awsClient = Awsclient;
}