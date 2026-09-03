'use client';

import { useState, useCallback } from 'react';
import { STORAGE_PATHS } from '@/lib/r2-storage';

export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  url: string | null;
  key: string | null;
}

export interface UploadOptions {
  folder?: string;
  prefix?: string;
  onProgress?: (progress: number) => void;
  onSuccess?: (url: string, key: string) => void;
  onError?: (error: string) => void;
}

const initialState: UploadState = {
  isUploading: false,
  progress: 0,
  error: null,
  url: null,
  key: null,
};

/**
 * Hook for uploading files to Cloudflare R2 storage
 */
export function useR2Upload() {
  const [state, setState] = useState<UploadState>(initialState);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const upload = useCallback(async (
    file: File,
    options: UploadOptions = {}
  ): Promise<{ success: boolean; url?: string; key?: string; error?: string }> => {
    const { folder = 'uploads', prefix = '', onProgress, onSuccess, onError } = options;

    setState({
      isUploading: true,
      progress: 0,
      error: null,
      url: null,
      key: null,
    });

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      if (prefix) {
        formData.append('prefix', prefix);
      }

      // Simulate progress (since fetch doesn't support progress for uploads easily)
      const progressInterval = setInterval(() => {
        setState(prev => {
          const newProgress = Math.min(prev.progress + 10, 90);
          onProgress?.(newProgress);
          return { ...prev, progress: newProgress };
        });
      }, 200);

      // Upload via API route
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setState({
        isUploading: false,
        progress: 100,
        error: null,
        url: result.url,
        key: result.key,
      });

      onProgress?.(100);
      onSuccess?.(result.url, result.key);

      return {
        success: true,
        url: result.url,
        key: result.key,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Upload failed';
      
      setState({
        isUploading: false,
        progress: 0,
        error: errorMessage,
        url: null,
        key: null,
      });

      onError?.(errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  // Convenience methods for specific upload types
  const uploadProfilePicture = useCallback((file: File, userId: string, callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>) => {
    return upload(file, {
      folder: STORAGE_PATHS.PROFILE_PICTURES,
      prefix: `user_${userId}`,
      ...callbacks,
    });
  }, [upload]);

  const uploadSignedAgreement = useCallback((file: File, agreementId: string, callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>) => {
    return upload(file, {
      folder: STORAGE_PATHS.SIGNED_AGREEMENTS,
      prefix: `agreement_${agreementId}`,
      ...callbacks,
    });
  }, [upload]);

  const uploadDocument = useCallback((file: File, category: string, documentId?: string, callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>) => {
    return upload(file, {
      folder: `${STORAGE_PATHS.DOCUMENTS}/${category}`,
      prefix: documentId,
      ...callbacks,
    });
  }, [upload]);

  const uploadVisitorPhoto = useCallback((file: File, visitorId: string, callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>) => {
    return upload(file, {
      folder: STORAGE_PATHS.VISITOR_PHOTOS,
      prefix: `visitor_${visitorId}`,
      ...callbacks,
    });
  }, [upload]);

  const uploadWorkorderDocument = useCallback((file: File, workorderId: string, callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>) => {
    return upload(file, {
      folder: STORAGE_PATHS.WORKORDER_DOCUMENTS,
      prefix: `wo_${workorderId}`,
      ...callbacks,
    });
  }, [upload]);

  const uploadVideo = useCallback((file: File, folder: string, referenceId: string, callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>) => {
    return upload(file, {
      folder: `${STORAGE_PATHS.ATTACHMENTS}/${folder}`,
      prefix: `video_${referenceId}`,
      ...callbacks,
    });
  }, [upload]);

  const uploadAttachment = useCallback((
    file: File, 
    category: 'helpdesk' | 'maintenance' | 'cash-advance' | 'general' | 'videos',
    referenceId: string,
    callbacks?: Omit<UploadOptions, 'folder' | 'prefix'>
  ) => {
    return upload(file, {
      folder: `${STORAGE_PATHS.ATTACHMENTS}/${category}`,
      prefix: referenceId,
      ...callbacks,
    });
  }, [upload]);

  return {
    ...state,
    upload,
    reset,
    uploadProfilePicture,
    uploadSignedAgreement,
    uploadDocument,
    uploadVisitorPhoto,
    uploadWorkorderDocument,
    uploadVideo,
    uploadAttachment,
  };
}

export default useR2Upload;
