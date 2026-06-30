/**
 * AWS S3 utility — singleton client + upload helper.
 * Import as `import { uploadToS3 } from "@/lib/s3"`.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!env.s3) {
    throw new Error('AWS S3 is not configured. Set AWS_S3_BUCKET_NAME, AWS_S3_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.');
  }

  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
    });
  }

  return client;
}

/**
 * Upload a file buffer to S3 and return the public URL.
 *
 * Files are stored under the `uploads/` prefix inside the bucket.
 * The bucket must have public read access or a CloudFront distribution
 * configured for serving the uploaded objects.
 */
export async function uploadToS3(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  if (!env.s3) {
    throw new Error('AWS S3 is not configured.');
  }

  const s3 = getS3Client();
  const key = `uploads/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return `https://${env.s3.bucketName}.s3.${env.s3.region}.amazonaws.com/${key}`;
}
