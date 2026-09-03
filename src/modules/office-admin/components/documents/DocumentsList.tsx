'use client';

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Calendar, CheckCircle, AlertCircle, User, X } from "lucide-react";
import { Document } from "@/types/documents";
import { getDocuments } from "@/services/documents/DocumentService";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingAnimation } from "@/components/ui/loading-animation";

interface DocumentsListProps {
  branchId: string;
  category?: string;
  searchQuery?: string;
}

export function DocumentsList({ branchId, category, searchQuery }: DocumentsListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try {
      setIsLoading(true);
      // Get documents from service
      const fetchedDocuments = getDocuments(branchId);
      
      // Filter by category if provided
      let filteredDocs = category 
        ? fetchedDocuments.filter(doc => doc.category === category) 
        : fetchedDocuments;
      
      // Filter by search query if provided
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredDocs = filteredDocs.filter(doc => 
          doc.title.toLowerCase().includes(query) || 
          doc.description.toLowerCase().includes(query) ||
          doc.tags.some(tag => tag.toLowerCase().includes(query))
        );
      }
      
      setDocuments(filteredDocs);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load documents.",
        variant: "destructive"
      });
      console.error("Error fetching documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, category, searchQuery, toast]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };
  
  const getFileIcon = (fileType: string) => {
    return <FileText className="h-4 w-4" />;
  };
  
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'policy':
        return <Badge className="bg-blue-500">Policy</Badge>;
      case 'procedure':
        return <Badge className="bg-green-500">Procedure</Badge>;
      case 'form':
        return <Badge className="bg-purple-500">Form</Badge>;
      case 'contract':
        return <Badge className="bg-amber-500">Contract</Badge>;
      case 'license':
        return <Badge variant="outline" className="border-indigo-300 text-indigo-700">License</Badge>;
      case 'certificate':
        return <Badge variant="outline" className="border-teal-300 text-teal-700">Certificate</Badge>;
      default:
        return <Badge variant="outline">{category}</Badge>;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'archived':
        return <Badge variant="outline" className="bg-gray-100 text-gray-700">Archived</Badge>;
      case 'draft':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const handleViewDocument = (document: Document) => {
    setSelectedDocument(document);
    setIsDocumentDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <FileText className="h-12 w-12 mx-auto text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-foreground">No Documents Found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {category 
            ? `No ${category} documents found${searchQuery ? ' matching your search' : ''}` 
            : `No documents found${searchQuery ? ' matching your search' : ''}`}
        </p>
        <div className="mt-6">
          <Button>
            Upload New Document
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {documents.map((document) => (
          <Card key={document.id} className="p-4">
            <div className="flex flex-col md:flex-row justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  {getFileIcon(document.fileType)}
                  <h4 className="font-medium">{document.title}</h4>
                  {getCategoryBadge(document.category)}
                  {getStatusBadge(document.status)}
                </div>
                
                <p className="text-sm text-gray-600">{document.description}</p>
                
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    Uploaded: {formatDate(document.uploadedAt)}
                  </span>
                  {document.expiryDate && (
                    <span className="flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Expires: {formatDate(document.expiryDate)}
                    </span>
                  )}
                  <span className="flex items-center">
                    <User className="h-3 w-3 mr-1" />
                    By: {document.uploadedBy}
                  </span>
                </div>
                
                {document.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {document.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {document.signatureRequired && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-amber-600 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Signature required
                    </span>
                    {document.signatures && document.signatures.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span>
                          {document.signatures.length} of {document.signatureRequired ? "required" : "optional"} signatures collected
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 mt-4 md:mt-0">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleViewDocument(document)}
                >
                  View
                </Button>
                {document.status !== 'archived' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-red-600 border-red-600"
                  >
                    Archive
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      
      {/* Document Viewer Dialog */}
      <Dialog open={isDocumentDialogOpen} onOpenChange={setIsDocumentDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{selectedDocument?.title}</DialogTitle>
          </DialogHeader>
          
          {selectedDocument && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getCategoryBadge(selectedDocument.category)}
                {getStatusBadge(selectedDocument.status)}
              </div>
              
              <p className="text-sm text-gray-600">{selectedDocument.description}</p>
              
              <Separator />
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">File Name</p>
                  <p className="font-medium">{selectedDocument.fileName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">File Size</p>
                  <p className="font-medium">{(selectedDocument.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Uploaded On</p>
                  <p className="font-medium">{formatDate(selectedDocument.uploadedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Version</p>
                  <p className="font-medium">{selectedDocument.version}</p>
                </div>
                {selectedDocument.expiryDate && (
                  <div>
                    <p className="text-muted-foreground">Expiry Date</p>
                    <p className="font-medium">{formatDate(selectedDocument.expiryDate)}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Views</p>
                  <p className="font-medium">{selectedDocument.views}</p>
                </div>
              </div>
              
              {selectedDocument.signatureRequired && (
                <>
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-2">Signatures</h4>
                    
                    {selectedDocument.signatures && selectedDocument.signatures.length > 0 ? (
                      <div className="space-y-2">
                        {selectedDocument.signatures.map((signature) => (
                          <div key={signature.id} className="flex items-center justify-between text-sm p-2 border rounded-md">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>{signature.employeeName}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(signature.signedAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No signatures collected yet.</p>
                    )}
                  </div>
                </>
              )}
              
              <div className="flex justify-end space-x-2 mt-4">
                <Button variant="outline">Download</Button>
                {selectedDocument.signatureRequired && !selectedDocument.signatures?.some(sig => sig.employeeId === "current-user-id") && (
                  <Button>Sign Document</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
