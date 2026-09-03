'use client';

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreVertical, Eye, Edit, Trash2, Download, FileText,
  Shield, Lock, Users, Building2, ExternalLink,
} from "lucide-react";
import { useDocumentStore } from "./documentStore";
import {
  CompanyDocument, DOC_TYPE_LABELS, DOC_CATEGORY_LABELS,
  DOC_STATUS_LABELS, ACCESS_LEVEL_LABELS, DocStatus, AccessLevel,
} from "./types";
import { useToast } from "@/hooks/use-toast";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { format } from "date-fns";

interface DocumentListProps {
  documents: CompanyDocument[];
  onView: (doc: CompanyDocument) => void;
  onEdit: (id: string) => void;
}

export function DocumentList({ documents, onView, onEdit }: DocumentListProps) {
  const { deleteDocument, isLoading } = useDocumentStore();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const result = await deleteDocument(deleteId);
    setIsDeleting(false);
    setDeleteId(null);

    if (result.success) {
      toast({ title: "Document Deleted", description: "Document has been removed." });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: DocStatus) => {
    const styles: Record<DocStatus, string> = {
      draft: 'bg-gray-100 text-gray-700',
      active: 'bg-green-100 text-green-800',
      archived: 'bg-slate-100 text-slate-600',
      expired: 'bg-red-100 text-red-700',
      superseded: 'bg-yellow-100 text-yellow-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
        {DOC_STATUS_LABELS[status]}
      </span>
    );
  };

  const getAccessIcon = (level: AccessLevel) => {
    switch (level) {
      case 'admin_only': return <Lock className="h-3.5 w-3.5 text-red-500" />;
      case 'management': return <Shield className="h-3.5 w-3.5 text-amber-500" />;
      case 'department_specific': return <Building2 className="h-3.5 w-3.5 text-blue-500" />;
      default: return <Users className="h-3.5 w-3.5 text-green-500" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Documents Found</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Upload company policies, SOPs, contracts, and other important documents to keep them organized and accessible.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-center">Access</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onView(doc)}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        {doc.title}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{doc.doc_code}</div>
                      {doc.file_name && (
                        <div className="text-xs text-muted-foreground">
                          {doc.file_name} ({formatFileSize(doc.file_size)})
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{DOC_TYPE_LABELS[doc.doc_type]}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{DOC_CATEGORY_LABELS[doc.category]}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">v{doc.version}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center" title={ACCESS_LEVEL_LABELS[doc.access_level]}>
                      {getAccessIcon(doc.access_level)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(doc.updated_at), 'dd MMM yyyy')}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {getStatusBadge(doc.status)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(doc); }}>
                          <Eye className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        {doc.file_url && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(doc.file_url, '_blank'); }}>
                            <Download className="h-4 w-4 mr-2" /> Download
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(doc.id); }}>
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(doc.id); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the document and its file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
