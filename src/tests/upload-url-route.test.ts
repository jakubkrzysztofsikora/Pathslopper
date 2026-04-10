import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the S3 client module before importing route
const getS3ClientMock = vi.fn();
const getBucketMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Client: () => getS3ClientMock(),
  getBucket: () => getBucketMock(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class {
    constructor(public params: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public params: unknown) {}
  },
}));

import { GET } from "@/app/api/character-sheet/upload-url/route";

function makeRequest(mimeType?: string): NextRequest {
  const url = mimeType
    ? `http://localhost/api/character-sheet/upload-url?mimeType=${encodeURIComponent(mimeType)}`
    : "http://localhost/api/character-sheet/upload-url";
  return new NextRequest(url, { method: "GET" });
}

const OBJECT_KEY_REGEX = /^uploads\/[a-f0-9-]+\.\w{3,4}$/;

describe("GET /api/character-sheet/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getS3ClientMock.mockReturnValue({});
    getBucketMock.mockReturnValue("test-bucket");
    getSignedUrlMock.mockResolvedValue("https://s3.example.com/presigned-put-url");
  });

  it("returns 400 when mimeType is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when mimeType is invalid", async () => {
    const res = await GET(makeRequest("application/pdf"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBeDefined();
  });

  it("returns 400 for text/plain mimeType", async () => {
    const res = await GET(makeRequest("text/plain"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns objectKey and putUrl for image/jpeg", async () => {
    const res = await GET(makeRequest("image/jpeg"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.objectKey).toMatch(OBJECT_KEY_REGEX);
    expect(json.objectKey).toMatch(/\.jpg$/);
    expect(json.putUrl).toBe("https://s3.example.com/presigned-put-url");
  });

  it("returns objectKey and putUrl for image/png", async () => {
    const res = await GET(makeRequest("image/png"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.objectKey).toMatch(OBJECT_KEY_REGEX);
    expect(json.objectKey).toMatch(/\.png$/);
    expect(json.putUrl).toBeDefined();
  });

  it("returns objectKey and putUrl for image/webp", async () => {
    const res = await GET(makeRequest("image/webp"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.objectKey).toMatch(/\.webp$/);
  });

  it("returns objectKey and putUrl for image/gif", async () => {
    const res = await GET(makeRequest("image/gif"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.objectKey).toMatch(/\.gif$/);
  });

  it("objectKey matches uploads/uuid.ext pattern", async () => {
    const res = await GET(makeRequest("image/jpeg"));
    const json = await res.json();
    expect(json.objectKey).toMatch(OBJECT_KEY_REGEX);
  });

  it("returns expiresIn: 300", async () => {
    const res = await GET(makeRequest("image/png"));
    const json = await res.json();
    expect(json.expiresIn).toBe(300);
  });

  it("returns 500 when S3 client throws", async () => {
    getSignedUrlMock.mockRejectedValueOnce(new Error("S3 error"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(makeRequest("image/png"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Failed to generate upload URL.");
  });
});
