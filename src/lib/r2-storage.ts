'use client';

/**
 * Storage Client Library — Supabase Storage (self-hosted on VPS)
 * 
 * Uploads files directly to the self-hosted Supabase Storage API.
 * No separate API route needed — uses the anon key + user session.
 * 
 * NOTE: Previously named "r2-storage" — this uses Supabase Storage,
 * not Cloudflare R2. The name is kept for backward compatibility of imports.
 */

import { getSupabaseClient } from '@/integrations/supabase/client';

// The default bucket for uploads
const DEFAULT_BUCKET = 'uploads';
const PROFILE_BUCKET = 'profile-pictures';

// Supabase URL for constructing public URLs
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Storage folder paths
export const STORAGE_PATHS = {
  PROFILE_PICTURES: 'profile-pictures',
  SIGNED_AGREEMENTS: 'signed-agreements',
  DOCUMENTS: 'documents',
  VISITOR_PHOTOS: 'visitors/photos',
  VISITOR_AGREEMENTS: 'visitors/agreements',
  WORKORDER_DOCUMENTS: 'workorders',
  LICENSE_DOCUMENTS: 'licenses',
  ATTACHMENTS: 'attachments',
  REPORTS: 'reports',
} as const;

// File type validation
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 
  'image/png', 
  'image/webp', 
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/mpeg',
  'video/3gpp',
];

const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/zip',
  'application/x-rar-compressed',
];

const ALL_ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface FileValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  allowedTypes: string[] = ALL_ALLOWED_TYPES,
  maxSize?: number
): FileValidation {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: `Invalid file type: ${file.type}. Allowed types: images, videos, PDF, Word, Excel, PowerPoint` 
    };
  }

  const effectiveMaxSize = maxSize || (
    ALLOWED_VIDEO_TYPES.includes(file.type) ? MAX_VIDEO_SIZE :
    ALLOWED_IMAGE_TYPES.includes(file.type) ? MAX_IMAGE_SIZE :
    MAX_FILE_SIZE
  );

  if (file.size > effectiveMaxSize) {
    return { 
      valid: false, 
      error: `File too large. Maximum size: ${effectiveMaxSize / 1024 / 1024}MB` 
    };
  }

  return { valid: true };
}

/**
 * Get public URL for a file stored in Supabase Storage
 */
export function getPublicUrl(key: string): string {
  // Determine bucket from key path
  const bucket = key.startsWith('profile-pictures') ? PROFILE_BUCKET : DEFAULT_BUCKET;
  const path = key.startsWith('profile-pictures/') ? key.replace('profile-pictures/', '') : key;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Generate a safe filename
 */
function generateFileName(file: File, prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = file.name.split('.').pop() || 'bin';
  const safeName = prefix ? prefix.replace(/[^a-zA-Z0-9._-]/g, '_') : 'file';
  return `${safeName}_${timestamp}_${random}.${ext}`;
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadToR2(
  file: File,
  folder: string,
  options?: {
    prefix?: string;
  }
): Promise<UploadResult> {
  try {
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const client = getSupabaseClient();
    const fileName = generateFileName(file, options?.prefix);
    const filePath = `${folder}/${fileName}`;
    
    // Determine bucket
    const bucket = folder === STORAGE_PATHS.PROFILE_PICTURES ? PROFILE_BUCKET : DEFAULT_BUCKET;
    const storagePath = folder === STORAGE_PATHS.PROFILE_PICTURES ? fileName : filePath;

    const { data, error } = await client.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    // Get the public URL
    const { data: urlData } = client.storage
      .from(bucket)
      .getPublicUrl(data.path);

    const key = bucket === PROFILE_BUCKET 
      ? `profile-pictures/${data.path}` 
      : data.path;

    return {
      success: true,
      url: urlData.publicUrl,
      key,
    };
  } catch (error: any) {
    console.error('[Storage] Upload error:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload file',
    };
  }
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFromR2(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getSupabaseClient();
    
    const bucket = key.startsWith('profile-pictures') ? PROFILE_BUCKET : DEFAULT_BUCKET;
    const path = key.startsWith('profile-pictures/') ? key.replace('profile-pictures/', '') : key;

    const { error } = await client.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Storage] Delete error:', error);
    return { success: false, error: error.message };
  }
}

// Convenience functions for specific upload types

export async function uploadProfilePicture(file: File, userId: string): Promise<UploadResult> {
  const validation = validateFile(file, ALLOWED_IMAGE_TYPES, 5 * 1024 * 1024);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, STORAGE_PATHS.PROFILE_PICTURES, { prefix: `user_${userId}` });
}

export async function uploadSignedAgreement(file: File, agreementId: string): Promise<UploadResult> {
  const validation = validateFile(file, [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, STORAGE_PATHS.SIGNED_AGREEMENTS, { prefix: `agreement_${agreementId}` });
}

export async function uploadDocument(file: File, category: string, documentId?: string): Promise<UploadResult> {
  const validation = validateFile(file, [...ALLOWED_DOCUMENT_TYPES, ...ALLOWED_IMAGE_TYPES]);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, `${STORAGE_PATHS.DOCUMENTS}/${category}`, { prefix: documentId });
}

export async function uploadVisitorPhoto(file: File, visitorId: string): Promise<UploadResult> {
  const validation = validateFile(file, ALLOWED_IMAGE_TYPES, 5 * 1024 * 1024);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, STORAGE_PATHS.VISITOR_PHOTOS, { prefix: `visitor_${visitorId}` });
}

export async function uploadWorkorderDocument(file: File, workorderId: string): Promise<UploadResult> {
  const validation = validateFile(file, [...ALLOWED_DOCUMENT_TYPES, ...ALLOWED_IMAGE_TYPES]);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, STORAGE_PATHS.WORKORDER_DOCUMENTS, { prefix: `wo_${workorderId}` });
}

export async function uploadVideo(file: File, folder: string, referenceId: string): Promise<UploadResult> {
  const validation = validateFile(file, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, `${STORAGE_PATHS.ATTACHMENTS}/${folder}`, { prefix: `video_${referenceId}` });
}

export async function uploadAttachment(
  file: File,
  category: 'helpdesk' | 'maintenance' | 'cash-advance' | 'general' | 'videos',
  referenceId: string
): Promise<UploadResult> {
  const validation = validateFile(file, ALL_ALLOWED_TYPES);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  return uploadToR2(file, `${STORAGE_PATHS.ATTACHMENTS}/${category}`, { prefix: referenceId });
}

export {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  ALL_ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_IMAGE_SIZE,
};

export default {
  uploadToR2,
  deleteFromR2,
  getPublicUrl,
  validateFile,
  uploadProfilePicture,
  uploadSignedAgreement,
  uploadDocument,
  uploadVisitorPhoto,
  uploadWorkorderDocument,
  uploadVideo,
  uploadAttachment,
  STORAGE_PATHS,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  ALL_ALLOWED_TYPES,
};
