import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_client) return _client;
  const accessKey = process.env.SCW_OBJECT_STORAGE_ACCESS_KEY;
  const secretKey = process.env.SCW_OBJECT_STORAGE_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      "SCW_OBJECT_STORAGE_ACCESS_KEY and SCW_OBJECT_STORAGE_SECRET_KEY are required"
    );
  }
  _client = new S3Client({
    region: "fr-par",
    endpoint: "https://s3.fr-par.scw.cloud",
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
  return _client;
}

export function getBucket(): string {
  const bucket = process.env.SCW_CHARACTER_SHEETS_BUCKET;
  if (!bucket) throw new Error("SCW_CHARACTER_SHEETS_BUCKET is required");
  return bucket;
}
