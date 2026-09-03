'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Download, ExternalLink, Shield, Lock, Users, Building2,
  Calendar, FileText, Tag, CheckCircle, Clock, User,
} from "lucide-react";
import {
  CompanyDocument, DocumentAcknowledgment, DOC_TYPE_LABELS,
  DOC_CATEGORY_LABELS, DOC_STATUS_LABELS, ACCESS_LEVEL_LABELS,
} from "./types";
import { useDocumentStore } from "./documentStore";
import { useAppData } from "@/contexts/AppDataContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface DocumentDetailProps {
  document: CompanyDocument;
  onClose: () => void;
  onUpdate: () => void;
}

export function DocumentDetail({ document: doc, onClose, onUpdate }: DocumentDetailProps) {
  const { acknowledgeDocument, fetchAcknowledgments, acknowledgments, updateDocument } = useDocumentStore();
  const { user } = useAppData();
  const { toast } = useToast();
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  useEffect(() => {
    fetchAcknowledgments(doc.id);
  }, [doc.id, fetchAcknowledgments]);

  const docAcks = acknowledgments.filter(a => a.document_id === doc.id);
  const hasAcknowledged = docAcks.some(a => a.user_id === user?.email);

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);
    const result = await acknowledgeDocument(doc.id, user?.email || 'unknown', user?.name || 'Unknown User');
    setIsAcknowledging(false);

    if (result.success) {
      toast({ title: "Acknowledged", description: "You have acknowledged this document." });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  const handleArchive = async () => {
    const result = await updateDocument(doc.id, { status: 'archived' });
    if (result.success) {
      toast({ title: "Archived", description: "Document has been archived." });
      onUpdate();
    }
  };

  const getAccessIcon = () => {
    switch (doc.access_level) {
      case 'admin_only': return <Lock className="h-4 w-4 text-red-500" />;
      case 'management': return <Shield className="h-4 w-4 text-amber-500" />;
      case 'department_specific': return <Building2 className="h-4 w-4 text-blue-500" />;
      default: return <Users className="h-4 w-4 text-green-500" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Document Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <span className="text-muted-foreground">Code</span>
          <p className="font-mono font-medium">{doc.doc_code}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Version</span>
          <p className="font-medium">v{doc.version}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Type</span>
          <p>{DOC_TYPE_LABELS[doc.doc_type]}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Category</span>
          <p>{DOC_CATEGORY_LABELS[doc.category]}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Status</span>
          <p>{DOC_STATUS_LABELS[doc.status]}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Access</span>
          <div className="flex items-center gap-1.5">
            {getAccessIcon()}
            <span>{ACCESS_LEVEL_LABELS[doc.access_level]}</span>
          </div>
        </div>
        {doc.effective_date && (
          <div className="space-y-1">
            <span className="text-muted-foreground">Effective</span>
            <p>{format(new Date(doc.effective_date), 'dd MMM yyyy')}</p>
          </div>
        )}
        {doc.expiry_date && (
          <div className="space-y-1">
            <span className="text-muted-foreground">Expires</span>
            <p>{format(new Date(doc.expiry_date), 'dd MMM yyyy')}</p>
          </div>
        )}
        <div className="space-y-1">
          <span className="text-muted-foreground">Uploaded By</span>
          <p>{doc.uploaded_by}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Last Updated</span>
          <p>{format(new Date(doc.updated_at), 'dd MMM yyyy')}</p>
        </div>
      </div>

      {doc.description && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
            <p className="text-sm">{doc.description}</p>
          </div>
        </>
      )}

      {doc.tags && doc.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          {doc.tags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
      )}

      {/* File Download */}
      {doc.file_url && (
        <>
          <Separator />
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm font-medium">{doc.file_name || 'Document File'}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open(doc.file_url, '_blank')}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Acknowledgment Section */}
      {doc.requires_acknowledgment && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Acknowledgment Required</h4>
            {doc.acknowledgment_deadline && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Deadline: {format(new Date(doc.acknowledgment_deadline), 'dd MMM yyyy')}
              </p>
            )}

            {hasAcknowledged ? (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg p-3">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">You have acknowledged this document</span>
              </div>
            ) : (
              <Button onClick={handleAcknowledge} disabled={isAcknowledging} className="w-full">
                <CheckCircle className="h-4 w-4 mr-2" />
                {isAcknowledging ? 'Acknowledging...' : 'Acknowledge Document'}
              </Button>
            )}

            {docAcks.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-muted-foreground">{docAcks.length} acknowledgment(s)</p>
                {docAcks.slice(0, 5).map(ack => (
                  <div key={ack.id} className="flex items-center justify-between text-xs border-b pb-1">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span>{ack.user_name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {format(new Date(ack.acknowledged_at), 'dd MMM yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Actions */}
      <Separator />
      <div className="flex justify-between">
        <Button variant="outline" onClick={onClose}>Close</Button>
        {doc.status === 'active' && (
          <Button variant="secondary" onClick={handleArchive}>Archive</Button>
        )}
      </div>
    </div>
  );
}
