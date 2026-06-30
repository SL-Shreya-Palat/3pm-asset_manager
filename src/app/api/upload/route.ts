/**
 * POST /api/upload — Upload a file (image) and return its public URL.
 *
 * Uses AWS S3 when configured, otherwise falls back to local disk (`public/uploads/`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { env } from '@/lib/env';
import { uploadToS3 } from '@/lib/s3';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

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
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { data: null, error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { data: null, error: 'File size must be less than 5 MB' },
        { status: 400 },
      );
    }

    // Determine extension from MIME type
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    const ext = extMap[file.type] || '.bin';

    // Generate unique filename
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;

    if (env.s3) {
      // Upload to S3
      url = await uploadToS3(buffer, filename, file.type);
    } else {
      // Fallback: save to local disk
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      await mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);
      await writeFile(filePath, buffer);
      url = `/uploads/${filename}`;
    }

    return NextResponse.json({ data: { url, filename }, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Upload failed' }, { status: 500 });
  }
}
