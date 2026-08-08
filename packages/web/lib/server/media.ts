import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  MEDIA_PREFIX,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@dakotajp/core";

const region = process.env.AWS_REGION ?? "us-east-1";

/**
 * Unset locally, which is the point: without a bucket there is nothing to sign
 * for, and signing against a guessed name would fail at PUT time with an opaque
 * S3 error instead of here with a readable one.
 */
const BUCKET = process.env.MEDIA_BUCKET_NAME;

// Reused across warm Lambda invocations, like the DynamoDB client.
const s3 = new S3Client({ region });

/** How long the browser has to start the upload. Short: it PUTs immediately. */
const URL_TTL_SECONDS = 60;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export interface UploadTarget {
  /** Presigned PUT the browser sends the bytes to. */
  uploadUrl: string;
  /** Where the image will be readable once the PUT lands. */
  publicUrl: string;
}

function isAllowedType(type: string): type is keyof typeof EXTENSIONS {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Date-partitioned so the bucket stays browsable by hand, with a uuid so a
 * given URL always names the same bytes -- which is what lets CloudFront cache
 * these forever.
 */
function buildKey(contentType: keyof typeof EXTENSIONS): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${MEDIA_PREFIX}/${year}/${month}/${randomUUID()}.${EXTENSIONS[contentType]}`;
}

/**
 * Sign a direct-to-S3 upload.
 *
 * The bytes deliberately never touch the server: the Lambda behind API Gateway
 * caps a request body at ~6 MB, which a phone photo clears on its own. The
 * caller is responsible for having checked the session -- this signs whatever
 * it is asked to.
 */
export async function createUploadTarget(
  contentType: string,
  size: number,
): Promise<UploadTarget> {
  if (!BUCKET) {
    throw new Error("MEDIA_BUCKET_NAME is not set; uploads are unavailable");
  }
  if (!isAllowedType(contentType)) {
    throw new Error(`Unsupported image type: ${contentType}`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Invalid file size");
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Image is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
    );
  }

  const key = buildKey(contentType);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      // Signed in, so S3 rejects a PUT whose body is a different size than the
      // one that was authorised. Without it the signature covers any payload.
      ContentLength: size,
    }),
    { expiresIn: URL_TTL_SECONDS },
  );

  // The `/media/*` behaviour passes the path through to the bucket, so the key
  // is the path. See MEDIA_PREFIX.
  return { uploadUrl, publicUrl: `/${key}` };
}
