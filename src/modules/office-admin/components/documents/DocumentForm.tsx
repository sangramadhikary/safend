'use client';

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, X } from "lucide-react";
import { useDocumentStore } from "./documentStore";
import {
  DocType, DocCategory, AccessLevel, DOC_TYPE_LABELS,
  DOC_CATEGORY_LABELS, ACCESS_LEVEL_LABELS,
} from "./types";
import { useToast } from "@/hooks/use-toast";

interface DocumentFormProps {
  documentId: string | null;
  branchId: string;
  defaultDocType?: DocType;
  onSuccess: () => void;
  onCancel: () => void;
}

export function DocumentForm({ documentId, branchId, defaultDocType, onSuccess, onCancel }: DocumentFormProps) {
  const { documents, addDocument, updateDocument, uploadNewVersion } = useDocumentStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const existingDoc = documentId ? documents.find(d => d.id === documentId) : null;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    doc_type: (defaultDocType || '') as DocType | '',
    category: '' as DocCategory | '',
    version: '1.0',
    access_level: 'all' as AccessLevel,
    department: '',
    effective_date: '',
    expiry_date: '',
    status: 'active' as 'draft' | 'active',
    requires_acknowledgment: false,
    acknowledgment_deadline: '',
    tags: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existingDoc) {
      setFormData({
        title: existingDoc.title,
        description: existingDoc.description || '',
        doc_type: existingDoc.doc_type,
        category: existingDoc.category,
        version: existingDoc.version,
        access_level: existingDoc.access_level,
        department: existingDoc.department || '',
        effective_date: existingDoc.effective_date || '',
        expiry_date: existingDoc.expiry_date || '',
        status: existingDoc.status === 'draft' ? 'draft' : 'active',
        requires_acknowledgment: existingDoc.requires_acknowledgment,
        acknowledgment_deadline: existingDoc.acknowledgment_deadline || '',
        tags: (existingDoc.tags || []).join(', '),
        notes: '',
      });
    }
  }, [existingDoc]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.doc_type) newErrors.doc_type = 'Document type is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!documentId && !selectedFile) newErrors.file = 'Please select a file to upload';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (errors.file) setErrors(prev => ({ ...prev, file: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    const tags = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const docData = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      doc_type: formData.doc_type as DocType,
      category: formData.category as DocCategory,
      version: formData.version,
      is_latest: true,
      access_level: formData.access_level,
      department: formData.access_level === 'department_specific' ? formData.department.trim() : undefined,
      effective_date: formData.effective_date || undefined,
      expiry_date: formData.expiry_date || undefined,
      status: formData.status as any,
      requires_acknowledgment: formData.requires_acknowledgment,
      acknowledgment_deadline: formData.requires_acknowledgment ? formData.acknowledgment_deadline || undefined : undefined,
      tags: tags.length > 0 ? tags : undefined,
      uploaded_by: 'admin',
      branch_id: branchId,
    };

    let result;
    if (documentId) {
      // If a new file is selected, upload as new version
      if (selectedFile) {
        const newVersion = incrementVersion(formData.version);
        result = await uploadNewVersion(documentId, { ...docData, version: newVersion } as any, selectedFile);
      } else {
        result = await updateDocument(documentId, docData as any);
      }
    } else {
      result = await addDocument(docData as any, selectedFile || undefined);
    }

    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: documentId ? "Document Updated" : "Document Uploaded",
        description: `${formData.title} has been ${documentId ? 'updated' : 'uploaded'} successfully.`,
      });
      onSuccess();
    } else {
      toast({
        title: "Error",
        description: result.error || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const incrementVersion = (version: string): string => {
    const parts = version.split('.');
    const minor = parseInt(parts[1] || '0') + 1;
    return `${parts[0]}.${minor}`;
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* File Upload */}
      <div className="space-y-3">
        <Label>File {!documentId && '*'}</Label>
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/50 ${
            errors.file ? 'border-destructive' : 'border-muted-foreground/25'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to select a file (PDF, Word, Excel, Images)
              </p>
              <p className="text-xs text-muted-foreground">Max 50MB</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
        />
        {errors.file && <p className="text-xs text-destructive">{errors.file}</p>}
        {documentId && !selectedFile && (
          <p className="text-xs text-muted-foreground">
            Leave empty to keep the existing file. Select a new file to upload a new version.
          </p>
        )}
      </div>

      <Separator />

      {/* Document Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Document Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={e => updateField('title', e.target.value)}
              placeholder="e.g., Employee Code of Conduct"
              className={errors.title ? 'border-destructive' : ''}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-2">
            <Label>Document Type *</Label>
            <Select value={formData.doc_type} onValueChange={v => updateField('doc_type', v)}>
              <SelectTrigger className={errors.doc_type ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.doc_type && <p className="text-xs text-destructive">{errors.doc_type}</p>}
          </div>

          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={formData.category} onValueChange={v => updateField('category', v)}>
              <SelectTrigger className={errors.category ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
          </div>

          <div className="space-y-2">
            <Label>Version</Label>
            <Input
              value={formData.version}
              onChange={e => updateField('version', e.target.value)}
              placeholder="1.0"
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={v => updateField('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="Brief description of this document..."
              rows={2}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Access & Validity */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Access & Validity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Access Level</Label>
            <Select value={formData.access_level} onValueChange={v => updateField('access_level', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACCESS_LEVEL_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.access_level === 'department_specific' && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Input
                value={formData.department}
                onChange={e => updateField('department', e.target.value)}
                placeholder="e.g., Operations"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Effective Date</Label>
            <Input type="date" value={formData.effective_date} onChange={e => updateField('effective_date', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Expiry Date</Label>
            <Input type="date" value={formData.expiry_date} onChange={e => updateField('expiry_date', e.target.value)} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Acknowledgment & Tags */}
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Requires Acknowledgment</Label>
            <p className="text-xs text-muted-foreground">Employees must acknowledge reading this document</p>
          </div>
          <Switch
            checked={formData.requires_acknowledgment}
            onCheckedChange={v => updateField('requires_acknowledgment', v)}
          />
        </div>

        {formData.requires_acknowledgment && (
          <div className="space-y-2">
            <Label>Acknowledgment Deadline</Label>
            <Input type="date" value={formData.acknowledgment_deadline} onChange={e => updateField('acknowledgment_deadline', e.target.value)} />
          </div>
        )}

        <div className="space-y-2">
          <Label>Tags (comma-separated)</Label>
          <Input
            value={formData.tags}
            onChange={e => updateField('tags', e.target.value)}
            placeholder="e.g., security, compliance, mandatory"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Uploading...' : (documentId ? 'Update Document' : 'Upload Document')}
        </Button>
      </div>
    </form>
  );
}
