import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { getS3Client, getBucket } from "@/lib/storage/s3-client";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function GET(request: NextRequest) {
  const mimeType = request.nextUrl.searchParams.get("mimeType");
  if (!mimeType || !ALLOWED_MIME[mimeType]) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing mimeType." },
      { status: 400 }
    );
  }

  try {
    const ext = ALLOWED_MIME[mimeType];
    const objectKey = `uploads/${randomUUID()}.${ext}`;
    const putUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: objectKey,
        ContentType: mimeType,
      }),
      { expiresIn: 300 }
    );
    return NextResponse.json({ ok: true, objectKey, putUrl, expiresIn: 300 });
  } catch (err) {
    console.error("[upload-url]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate upload URL." },
      { status: 500 }
    );
  }
}
