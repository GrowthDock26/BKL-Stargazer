/**
 * S3-kompatibler Dateispeicher (Cloudflare R2 oder AWS S3).
 *
 * Cloudflare R2 (EU-native, empfohlen):
 *   R2_ENDPOINT_URL      — https://<account-id>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID     — R2 API Token (Access Key ID)
 *   R2_SECRET_ACCESS_KEY — R2 API Token (Secret Access Key)
 *   R2_BUCKET_NAME       — Bucket-Name (Standard: "bkl-legal-os")
 *   R2_REGION            — nicht setzen (Standard: "auto")
 *
 * AWS S3 eu-central-1 (Frankfurt):
 *   R2_ENDPOINT_URL      — https://s3.eu-central-1.amazonaws.com
 *   R2_ACCESS_KEY_ID     — AWS Access Key ID
 *   R2_SECRET_ACCESS_KEY — AWS Secret Access Key
 *   R2_BUCKET_NAME       — S3-Bucket-Name
 *   R2_REGION            — eu-central-1
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";

let cachedClient: S3Client | undefined;

function getClient(): S3Client {
  if (!cachedClient) {
    const region = process.env.R2_REGION || "auto";
    cachedClient = new S3Client({
      region,
      endpoint: process.env.R2_ENDPOINT_URL!,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedClient;
}

const BUCKET = process.env.R2_BUCKET_NAME ?? "mike";

export const storageEnabled = Boolean(
  process.env.R2_ENDPOINT_URL &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY,
);

function requireStorageConfig(): void {
  if (!storageEnabled) {
    throw new Error(
      "R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set",
    );
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export async function uploadFile(
  key: string,
  content: Buffer | ArrayBuffer,
  contentType: string,
): Promise<void> {
  requireStorageConfig();
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.isBuffer(content) ? content : Buffer.from(content),
      ContentType: contentType,
    }),
  );
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export async function downloadFile(key: string): Promise<ArrayBuffer | null> {
  if (!storageEnabled) return null;
  try {
    const client = getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return bytes.buffer as ArrayBuffer;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteFile(key: string): Promise<void> {
  if (!storageEnabled) return;
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ---------------------------------------------------------------------------
// Signed URL (pre-signed for temporary direct access)
// ---------------------------------------------------------------------------

export async function getSignedUrl(
  key: string,
  expiresIn = 3600,
  downloadFilename?: string,
): Promise<string | null> {
  if (!storageEnabled) return null;
  try {
    const client = getClient();
    // Override the response Content-Disposition so the browser uses this
    // filename on download, instead of the last path segment of the R2 key
    // (which includes the document UUID). The `download` attribute on <a>
    // is ignored for cross-origin URLs, so we have to set it server-side.
    const responseContentDisposition = downloadFilename
      ? buildContentDisposition("attachment", downloadFilename)
      : undefined;
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
    });
    return await awsGetSignedUrl(client, command, { expiresIn });
  } catch {
    return null;
  }
}

export function normalizeDownloadFilename(name: string): string {
  const trimmed = name.trim();
  const base = trimmed || "download";
  return base.replace(/[\x00-\x1F\x7F]/g, "_").replace(/[\\/]/g, "_");
}

export function sanitizeDispositionFilename(name: string): string {
  return normalizeDownloadFilename(name)
    .replace(/["\\]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_");
}

export function encodeRFC5987(str: string): string {
  return encodeURIComponent(str).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildContentDisposition(
  kind: "inline" | "attachment",
  filename: string,
): string {
  const normalized = normalizeDownloadFilename(filename);
  return `${kind}; filename="${sanitizeDispositionFilename(normalized)}"; filename*=UTF-8''${encodeRFC5987(normalized)}`;
}

// ---------------------------------------------------------------------------
// Storage key helpers
// ---------------------------------------------------------------------------

export function storageKey(
  userId: string,
  docId: string,
  filename: string,
): string {
  return `documents/${userId}/${docId}/source${storageExtension(filename, ".bin")}`;
}

export function pdfStorageKey(
  userId: string,
  docId: string,
  stem: string,
): string {
  return `documents/${userId}/${docId}/${stem}.pdf`;
}

export function generatedDocKey(
  userId: string,
  docId: string,
  filename: string,
): string {
  return `generated/${userId}/${docId}/generated${storageExtension(filename, ".docx")}`;
}

export function versionStorageKey(
  userId: string,
  docId: string,
  versionSlug: string,
  filename: string,
): string {
  return `documents/${userId}/${docId}/versions/${versionSlug}${storageExtension(filename, ".bin")}`;
}

function storageExtension(filename: string, fallback: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return fallback;
  const ext = filename.slice(lastDot).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : fallback;
}
