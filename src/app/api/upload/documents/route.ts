/**
 * POST /api/upload/documents — Upload a document file and return its public URL.
 *
 * Supports DOC, DOCX, CSV, XLS, XLSX, JPG, PNG (max 50 MB).
 * Uses AWS S3 when configured, otherwise falls back to local disk.
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { env } from '@/lib/env';
import { uploadToS3 } from '@/lib/s3';

const ALLOWED_TYPES: Record<string, string> = {
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/csv': '.csv',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
};

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
    }

    // Validate type
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { data: null, error: `Invalid file type. Allowed: DOC, DOCX, CSV, XLS, XLSX, PDF, JPG, HEIC, PNG` },
        { status: 400 },
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { data: null, error: 'File size must be less than 50 MB' },
        { status: 400 },
      );
    }

    // Generate unique filename
    const originalName = (file as File).name || `document${ext}`;
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;

    if (env.s3) {
      // Upload to S3 under documents/ prefix
      const s3Key = `documents/${filename}`;
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: env.s3.region,
        credentials: {
          accessKeyId: env.s3.accessKeyId,
          secretAccessKey: env.s3.secretAccessKey,
        },
      });
      await s3.send(
        new PutObjectCommand({
          Bucket: env.s3.bucketName,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        }),
      );
      url = `https://${env.s3.bucketName}.s3.${env.s3.region}.amazonaws.com/${s3Key}`;
    } else {
      // Fallback: save to local disk
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'documents');
      await mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);
      await writeFile(filePath, buffer);
      url = `/uploads/documents/${filename}`;
    }

    return NextResponse.json(
      {
        data: {
          url,
          filename,
          originalName,
          contentType: file.type,
          size: file.size,
        },
        error: null,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ data: null, error: 'Upload failed' }, { status: 500 });
  }
}
