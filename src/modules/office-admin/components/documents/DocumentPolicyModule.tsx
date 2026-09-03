'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Plus, FileText, Shield, FolderLock, BookOpen,
  Upload, AlertCircle,
} from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useDocumentStore } from "./documentStore";
import { DocumentList } from "./DocumentList";
import { DocumentForm } from "./DocumentForm";
import { DocumentDetail } from "./DocumentDetail";
import { CompanyDocument } from "./types";

export function DocumentPolicyModule() {
  const { activeBranch, branches, isLoading } = useAppData();
  const { fetchDocuments, documents, getPoliciesAndSOPs, getSensitiveDocuments } = useDocumentStore();

  const [activeTab, setActiveTab] = useState("policies");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<CompanyDocument | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  useEffect(() => {
    if (activeBranch) {
      fetchDocuments(activeBranch);
    }
  }, [activeBranch, fetchDocuments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <BrandLoader size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';
  const policies = getPoliciesAndSOPs();
  const sensitiveDocuments = getSensitiveDocuments();
  const allDocs = documents;

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  const handleUploadSuccess = () => {
    setShowUploadForm(false);
    setEditingDocId(null);
    fetchDocuments(activeBranch);
  };

  // Filter documents based on active tab
  const getFilteredDocs = () => {
    let docs: CompanyDocument[];
    switch (activeTab) {
      case 'policies':
        docs = documents.filter(d => d.doc_type === 'policy' || d.doc_type === 'sop' || d.doc_type === 'manual');
        break;
      case 'contracts':
        docs = documents.filter(d => d.doc_type === 'contract' || d.doc_type === 'workorder' || d.doc_type === 'agreement');
        break;
      case 'all':
      default:
        docs = documents;
        break;
    }

    if (searchQuery) {
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.doc_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    return docs;
  };

  // Count docs requiring acknowledgment that haven't been acknowledged
  const pendingAcks = documents.filter(d => d.requires_acknowledgment && d.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Documents & Policy</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Company policies, SOPs, contracts, and sensitive documents — {activeBranchName}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('policies')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <BookOpen className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Policies & SOPs</p>
              <p className="text-lg font-bold">{policies.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('contracts')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <FolderLock className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contracts & Agreements</p>
              <p className="text-lg font-bold">{sensitiveDocuments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('all')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <FileText className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Documents</p>
              <p className="text-lg font-bold">{allDocs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <AlertCircle className="h-4 w-4 text-red-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Review</p>
              <p className="text-lg font-bold">{pendingAcks}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="policies" className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Policies & SOPs
            </TabsTrigger>
            <TabsTrigger value="contracts" className="flex items-center gap-1.5">
              <FolderLock className="h-3.5 w-3.5" />
              Contracts & Work Orders
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              All Documents
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                className="pl-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => setShowUploadForm(true)} className="whitespace-nowrap">
              <Upload className="h-4 w-4 mr-1" /> Upload
            </Button>
          </div>
        </div>

        <TabsContent value="policies" className="mt-6">
          <DocumentList
            documents={getFilteredDocs()}
            onView={setSelectedDoc}
            onEdit={(id) => { setEditingDocId(id); setShowUploadForm(true); }}
          />
        </TabsContent>

        <TabsContent value="contracts" className="mt-6">
          <DocumentList
            documents={getFilteredDocs()}
            onView={setSelectedDoc}
            onEdit={(id) => { setEditingDocId(id); setShowUploadForm(true); }}
          />
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <DocumentList
            documents={getFilteredDocs()}
            onView={setSelectedDoc}
            onEdit={(id) => { setEditingDocId(id); setShowUploadForm(true); }}
          />
        </TabsContent>
      </Tabs>

      {/* Upload/Edit Form Dialog */}
      <Dialog open={showUploadForm} onOpenChange={(open) => {
        if (!open) { setShowUploadForm(false); setEditingDocId(null); }
      }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDocId ? 'Edit Document' : 'Upload Document'}</DialogTitle>
          </DialogHeader>
          <DocumentForm
            documentId={editingDocId}
            branchId={activeBranch}
            defaultDocType={activeTab === 'policies' ? 'policy' : activeTab === 'contracts' ? 'contract' : undefined}
            onSuccess={handleUploadSuccess}
            onCancel={() => { setShowUploadForm(false); setEditingDocId(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Document Detail Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDoc?.title}</DialogTitle>
          </DialogHeader>
          {selectedDoc && (
            <DocumentDetail
              document={selectedDoc}
              onClose={() => setSelectedDoc(null)}
              onUpdate={() => { fetchDocuments(activeBranch); setSelectedDoc(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
