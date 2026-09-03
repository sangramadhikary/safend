'use client';

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { CompanyDocument, DocumentAcknowledgment, DocType, DocCategory, DocStatus } from './types';
import { uploadDocument as uploadToR2, deleteFromR2 } from '@/lib/r2-storage';

interface DocumentStoreState {
  documents: CompanyDocument[];
  acknowledgments: DocumentAcknowledgment[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDocuments: (branchId: string) => Promise<void>;
  addDocument: (doc: Omit<CompanyDocument, 'id' | 'doc_code' | 'created_at' | 'updated_at'>, file?: File) => Promise<{ success: boolean; error?: string }>;
  updateDocument: (id: string, updates: Partial<CompanyDocument>) => Promise<{ success: boolean; error?: string }>;
  deleteDocument: (id: string) => Promise<{ success: boolean; error?: string }>;
  uploadNewVersion: (parentId: string, doc: Omit<CompanyDocument, 'id' | 'doc_code' | 'created_at' | 'updated_at'>, file?: File) => Promise<{ success: boolean; error?: string }>;

  // Acknowledgments
  fetchAcknowledgments: (documentId: string) => Promise<void>;
  acknowledgeDocument: (documentId: string, userId: string, userName: string) => Promise<{ success: boolean; error?: string }>;

  // Computed
  getPoliciesAndSOPs: () => CompanyDocument[];
  getSensitiveDocuments: () => CompanyDocument[];

  clearError: () => void;
}

const generateDocCode = (docType: string) => {
  const prefix = docType === 'policy' ? 'POL' : docType === 'sop' ? 'SOP' : docType === 'contract' ? 'CON' : 'DOC';
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
};

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
  documents: [],
  acknowledgments: [],
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchDocuments: async (branchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_latest', true)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      set({ documents: data || [], isLoading: false });
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      set({ error: err.message || 'Failed to fetch documents', isLoading: false });
    }
  },

  addDocument: async (docData, file) => {
    try {
      let fileUrl: string | undefined;
      let fileKey: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      let fileType: string | undefined;

      // Upload file if provided
      if (file) {
        const uploadResult = await uploadToR2(file, docData.doc_type || 'general', docData.title?.replace(/\s+/g, '_'));
        if (!uploadResult.success) {
          return { success: false, error: uploadResult.error || 'File upload failed' };
        }
        fileUrl = uploadResult.url;
        fileKey = uploadResult.key;
        fileName = file.name;
        fileSize = file.size;
        fileType = file.type;
      }

      const newDoc = {
        ...docData,
        doc_code: generateDocCode(docData.doc_type),
        file_url: fileUrl,
        file_key: fileKey,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
      };

      const { data, error } = await supabase
        .from('company_documents')
        .insert(newDoc)
        .select()
        .single();

      if (error) throw error;

      set(state => ({ documents: [data, ...state.documents] }));
      return { success: true };
    } catch (err: any) {
      console.error('Error adding document:', err);
      return { success: false, error: err.message || 'Failed to add document' };
    }
  },

  updateDocument: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('company_documents')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        documents: state.documents.map(d => d.id === id ? data : d),
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update document' };
    }
  },

  deleteDocument: async (id) => {
    try {
      const doc = get().documents.find(d => d.id === id);

      // Delete file from R2 if exists
      if (doc?.file_key) {
        await deleteFromR2(doc.file_key);
      }

      const { error } = await supabase
        .from('company_documents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        documents: state.documents.filter(d => d.id !== id),
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete document' };
    }
  },

  uploadNewVersion: async (parentId, docData, file) => {
    try {
      // Mark old version as superseded
      await supabase
        .from('company_documents')
        .update({ is_latest: false, status: 'superseded', updated_at: new Date().toISOString() })
        .eq('id', parentId);

      // Create new version
      const result = await get().addDocument({
        ...docData,
        parent_doc_id: parentId,
        is_latest: true,
      }, file);

      if (result.success) {
        // Update local state for old doc
        set(state => ({
          documents: state.documents.filter(d => d.id !== parentId),
        }));
      }

      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchAcknowledgments: async (documentId: string) => {
    try {
      const { data, error } = await supabase
        .from('document_acknowledgments')
        .select('*')
        .eq('document_id', documentId)
        .order('acknowledged_at', { ascending: false });

      if (error) throw error;
      set({ acknowledgments: data || [] });
    } catch (err: any) {
      console.error('Error fetching acknowledgments:', err);
    }
  },

  acknowledgeDocument: async (documentId, userId, userName) => {
    try {
      const { data, error } = await supabase
        .from('document_acknowledgments')
        .upsert({
          document_id: documentId,
          user_id: userId,
          user_name: userName,
          acknowledged_at: new Date().toISOString(),
        }, { onConflict: 'document_id,user_id' })
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        acknowledgments: [...state.acknowledgments.filter(a => !(a.document_id === documentId && a.user_id === userId)), data],
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  getPoliciesAndSOPs: () => {
    return get().documents.filter(d =>
      (d.doc_type === 'policy' || d.doc_type === 'sop' || d.doc_type === 'manual') &&
      d.status === 'active'
    );
  },

  getSensitiveDocuments: () => {
    return get().documents.filter(d =>
      (d.doc_type === 'contract' || d.doc_type === 'workorder' || d.doc_type === 'agreement' || d.doc_type === 'license') &&
      d.status === 'active'
    );
  },
}));
