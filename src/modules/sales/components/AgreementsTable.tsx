'use client';
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, Send, CheckCircle, FileText, Upload, Clock, MoreVertical, FileSignature } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { updateAgreement, deleteAgreement } from "@/services/supabase/AgreementFirebaseService";
import { addWorkOrder } from "@/services/supabase/WorkOrderFirebaseService";
import { AgreementDocumentService } from "@/services/documents/AgreementDocumentService";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteRequestModal } from "@/components/sales/DeleteRequestModal";
import { AdminDeleteConfirmModal } from "@/components/sales/AdminDeleteConfirmModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { uploadSignedAgreement } from "@/lib/r2-storage";
import { addPendingAgreementTask, getPendingTaskByAgreementId, completePendingTask } from "@/services/supabase/PendingTaskService";
import { AgreementDetailModal } from "./AgreementDetailModal";
import { useAgreementsData } from "@/contexts/AgreementsDataContext";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Draft":
    case "Pending Signature":
      return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
    case "Pending Upload":
      return <Badge className="bg-red-600 hover:bg-red-700 animate-pulse">{status}</Badge>;
    case "Signed":
      return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    case "Active":
      return <Badge className="bg-safend-red hover:bg-red-700">{status}</Badge>;
    case "Expired":
      return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
    case "Terminated":
      return <Badge className="bg-black hover:bg-gray-900 text-white">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

interface AgreementsTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (agreement: any) => void;
}

export function AgreementsTable({ filter, searchTerm, onEdit }: AgreementsTableProps) {
  // Use centralized agreements data from context
  const { agreements: contextAgreements } = useAgreementsData();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<any>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [agreementToView, setAgreementToView] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Valid agreement filters
  const validAgreementFilters = ["All Agreements", "Draft", "Pending Signature", "Signed", "Active", "Expired", "Terminated"];
  
  // Filter agreements based on selected filter and search term
  const filteredAgreements = useMemo(() => {
    return contextAgreements.filter(agreement => {
      // Only apply filter if it's a valid agreement filter
      if (validAgreementFilters.includes(filter)) {
        if (filter !== "All Agreements") {
          const statusLower = (agreement.status || "").toLowerCase();
          const filterLower = filter.toLowerCase();
          
          if (!statusLower.includes(filterLower)) {
            return false;
          }
        }
      }
      
      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchFound = Object.values(agreement).some(value => 
          String(value).toLowerCase().includes(searchLower)
        );
        if (!matchFound) {
          return false;
        }
      }
      
      return true;
    });
  }, [contextAgreements, filter, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredAgreements.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedAgreements = filteredAgreements.slice(startIndex, endIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);
  
  // Handle delete request (admin can delete directly, employees go through approval)
  const handleDeleteClick = (agreement: any) => {
    setSelectedAgreement(agreement);
    const userRole = typeof window !== 'undefined' ? localStorage.getItem("userRole") : "";
    if (userRole === "admin") {
      setAdminDeleteModalOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  };

  const handleAdminDirectDelete = async () => {
    if (!selectedAgreement?.id) return;
    const result = await deleteAgreement(selectedAgreement.id);
    if (result.success) {
      toast({ title: "Agreement Deleted", description: `Agreement for "${selectedAgreement.clientName || 'Unknown Client'}" has been permanently deleted.` });
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete agreement", variant: "destructive" });
    }
    setAdminDeleteModalOpen(false);
    setSelectedAgreement(null);
  };
  
  const handleView = (agreement: any) => {
    setAgreementToView(agreement);
    setViewModalOpen(true);
  };
  
  const handleDownloadPDF = (agreement: any) => {
    try {
      AgreementDocumentService.generatePDFDocument(agreement);
      toast({
        title: "PDF Downloaded",
        description: `Agreement ${agreement.id} downloaded as PDF.`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate PDF document",
        variant: "destructive",
      });
    }
  };
  
  const handleDownloadWord = async (agreement: any) => {
    try {
      await AgreementDocumentService.generateWordDocument(agreement);
      toast({
        title: "Word Document Downloaded",
        description: `Agreement ${agreement.id} downloaded as Word document.`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate Word document",
        variant: "destructive",
      });
    }
  };
  
  const handlePreview = (agreement: any) => {
    try {
      AgreementDocumentService.previewPDF(agreement);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to preview document",
        variant: "destructive",
      });
    }
  };
  
  const handleSign = async (agreement: any) => {
    // Open upload modal instead of directly signing
    setSelectedAgreement(agreement);
    setUploadModalOpen(true);
  };

  // A "skipped" agreement was created via Skip for Now: active but with no formal
  // agreement document. It still needs to be completed later.
  const isSkippedAgreement = (agreement: any) =>
    (agreement.notes || "").toLowerCase().startsWith("agreement skipped") &&
    !agreement.documentUrl;

  // Complete a previously skipped agreement — open the form to capture details.
  const handleCompleteSkipped = (agreement: any) => {
    onEdit(agreement);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF or image file (JPG, PNG)",
          variant: "destructive",
        });
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please upload a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // Handle upload and sign
  const handleUploadAndSign = async () => {
    if (!selectedFile || !selectedAgreement) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);

    try {
      // Upload file to Cloudflare R2 Storage
      const uploadResult = await uploadSignedAgreement(selectedFile, selectedAgreement.id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload file');
      }

      // Update agreement status to Signed with the document URL
      const updateResult = await updateAgreement(selectedAgreement.id, { 
        status: "signed",
        signedDate: new Date(),
        signedDocumentUrl: uploadResult.url
      });
      
      if (updateResult.success) {
        // Check if there's a pending task for this agreement and complete it
        const pendingTaskResult = await getPendingTaskByAgreementId(selectedAgreement.id);
        if (pendingTaskResult.success && pendingTaskResult.data) {
          await completePendingTask(pendingTaskResult.data.id!);
        }

        // Only create work order if agreement was in "Pending Upload" status (already has work order)
        // or if it's a fresh agreement without work order
        if (selectedAgreement.status !== "Pending Upload") {
          // Create work order from agreement
          const workOrderResult = await addWorkOrder({
            linkedAgreementId: selectedAgreement.id,
            linkedQuoteId: selectedAgreement.linkedQuoteId || selectedAgreement.quotationRef, // Pass quotation reference for post sync
            clientName: selectedAgreement.clientName,
            companyName: selectedAgreement.companyName,
            contactPerson: selectedAgreement.contactPerson,
            contactEmail: selectedAgreement.contactEmail || selectedAgreement.clientEmail,
            contactPhone: selectedAgreement.contactPhone || selectedAgreement.clientPhone,
            address: selectedAgreement.address,
            city: selectedAgreement.city,
            state: selectedAgreement.state,
            pincode: selectedAgreement.pincode,
            serviceDetails: selectedAgreement.serviceDetails,
            value: selectedAgreement.value,
            posts: selectedAgreement.posts || [], // Pass posts from agreement
            status: "Draft"
          });
          
          if (workOrderResult.success) {
            toast({
              title: "Agreement Signed",
              description: "Signed agreement uploaded and work order created successfully!",
              duration: 3000,
            });
          } else {
            toast({
              title: "Partial Success",
              description: "Agreement signed but failed to create work order",
              variant: "destructive",
            });
          }
        } else {
          // Agreement was in "Pending Upload" status, work order already exists
          toast({
            title: "Agreement Signed",
            description: "Signed agreement uploaded successfully! Pending task completed.",
            duration: 3000,
          });
        }
      } else {
        toast({
          title: "Error",
          description: updateResult.error || "Failed to sign agreement",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload signed agreement",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      setUploadModalOpen(false);
      setSelectedFile(null);
      setSelectedAgreement(null);
    }
  };

  // Handle "Upload Later" - bypass agreement upload and create work order with pending task
  const handleUploadLater = async () => {
    if (!selectedAgreement) return;

    setUploadingFile(true);

    try {
      const userName = localStorage.getItem("userName") || "Unknown";
      
      // Update agreement status to "Pending Upload"
      const updateResult = await updateAgreement(selectedAgreement.id, { 
        status: "pending_upload",
        pendingUploadSince: new Date(),
        pendingUploadBy: userName
      });
      
      if (updateResult.success) {
        // Create work order from agreement (bypassing the upload)
        const workOrderResult = await addWorkOrder({
          linkedAgreementId: selectedAgreement.id,
          linkedQuoteId: selectedAgreement.linkedQuoteId || selectedAgreement.quotationRef, // Pass quotation reference for post sync
          clientName: selectedAgreement.clientName,
          companyName: selectedAgreement.companyName,
          contactPerson: selectedAgreement.contactPerson,
          contactEmail: selectedAgreement.contactEmail || selectedAgreement.clientEmail,
          contactPhone: selectedAgreement.contactPhone || selectedAgreement.clientPhone,
          address: selectedAgreement.address,
          city: selectedAgreement.city,
          state: selectedAgreement.state,
          pincode: selectedAgreement.pincode,
          serviceDetails: selectedAgreement.serviceDetails,
          value: selectedAgreement.value,
          posts: selectedAgreement.posts || [], // Pass posts from agreement
          status: "Draft",
          pendingAgreementUpload: true
        });
        
        // Create pending task for agreement upload with 10-day TAT
        await addPendingAgreementTask({
          agreementId: selectedAgreement.id,
          clientName: selectedAgreement.clientName,
          value: selectedAgreement.value,
          assignedTo: userName,
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
          tatDays: 10
        });
        
        if (workOrderResult.success) {
          toast({
            title: "Work Order Created",
            description: "Work order created. Please upload the signed agreement within 10 days.",
            duration: 5000,
          });
        } else {
          toast({
            title: "Partial Success",
            description: "Agreement marked for later upload but failed to create work order",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Error",
          description: updateResult.error || "Failed to process request",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Upload later error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      setUploadModalOpen(false);
      setSelectedFile(null);
      setSelectedAgreement(null);
    }
  };
  
  const handleSend = (id: string) => {
    toast({
      title: "Send Agreement",
      description: "Preparing to send agreement via email.",
      duration: 3000,
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>List of agreements and contracts</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead className="hidden md:table-cell">Ref.</TableHead>
            <TableHead className="hidden lg:table-cell">Contract Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Value / mo</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedAgreements.length > 0 ? (
            paginatedAgreements.map((agreement, index) => (
              <TableRow key={agreement.id || `agreement-${index}`}>
                <TableCell className="font-medium">
                  {agreement.clientName}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{agreement.linkedQuoteId || (agreement as any).agreementId || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs">
                  {(() => {
                    const fmt = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                    const start = fmt((agreement as any).signedOn || agreement.createdAt);
                    const end = fmt((agreement as any).validUntil);
                    if (!start && !end) return <span className="text-muted-foreground">—</span>;
                    return <span>{start || '—'} <span className="text-muted-foreground">→</span> {end || 'Open'}</span>;
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const isSkipped = agreement.notes?.toLowerCase().includes('skipped');
                      if (isSkipped) {
                        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Skipped</Badge>;
                      }
                      return getStatusBadge(agreement.status);
                    })()}
                    {agreement.notes?.toLowerCase().includes('skipped') && (() => {
                      const m = agreement.notes?.match(/reminder set for ([\d/]+)/i);
                      return m ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />Remind {m[1]}
                        </span>
                      ) : null;
                    })()}
                    {agreement.status === "Pending Upload" && agreement.pendingUploadSince && (
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {(() => {
                          const pendingDate = agreement.pendingUploadSince instanceof Date 
                            ? agreement.pendingUploadSince 
                            : new Date(agreement.pendingUploadSince);
                          const dueDate = new Date(pendingDate.getTime() + 10 * 24 * 60 * 60 * 1000);
                          const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          return daysRemaining > 0 ? `${daysRemaining}d left` : "Overdue!";
                        })()}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right font-medium">{agreement.value}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleView(agreement)}
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          title="More Actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isSkippedAgreement(agreement) && (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleCompleteSkipped(agreement)}
                              className="text-amber-600 focus:text-white focus:bg-amber-600"
                            >
                              <FileSignature className="mr-2 h-4 w-4" />
                              Complete Agreement
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleSign(agreement)}
                              className="text-green-600 focus:text-white focus:bg-green-600"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Upload Signed Agreement
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {(agreement.status === "Pending Signature" || agreement.status === "Draft") && (
                          <DropdownMenuItem
                            onClick={() => handleSign(agreement)}
                            className="text-green-600 focus:text-white focus:bg-green-600"
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Sign &amp; Create Work Order
                          </DropdownMenuItem>
                        )}
                        {agreement.status === "Pending Upload" && (
                          <DropdownMenuItem
                            onClick={() => handleSign(agreement)}
                            className="text-red-600 focus:text-white focus:bg-red-600"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Signed Agreement (Pending)
                          </DropdownMenuItem>
                        )}
                        {agreement.status !== "Pending Upload" && (
                          <>
                            <DropdownMenuItem onClick={() => handlePreview(agreement)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Preview PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPDF(agreement)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadWord(agreement)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Download Word
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onClick={() => handleSend(agreement.id)}>
                          <Send className="mr-2 h-4 w-4" />
                          Send
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(agreement)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(agreement)}
                          className="text-red-600 focus:text-white focus:bg-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6">
                No agreements found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {filteredAgreements.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredAgreements.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
      
      {/* Delete Request Modal (for non-admin users) */}
      {selectedAgreement && deleteModalOpen && (
        <DeleteRequestModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedAgreement(null);
          }}
          itemType="agreement"
          itemId={selectedAgreement.id || ""}
          clientName={selectedAgreement.clientName || "Unknown Client"}
          additionalInfo={`Quote Ref: ${selectedAgreement.linkedQuoteId || "N/A"} | Value: ${selectedAgreement.value}`}
        />
      )}

      {/* Admin Direct Delete Confirmation Modal */}
      {selectedAgreement && (
        <AdminDeleteConfirmModal
          isOpen={adminDeleteModalOpen}
          onClose={() => { setAdminDeleteModalOpen(false); setSelectedAgreement(null); }}
          onConfirm={handleAdminDirectDelete}
          itemType="Agreement"
          itemName={selectedAgreement.clientName || "Unknown Client"}
          itemId={selectedAgreement.agreementId || selectedAgreement.id || ""}
        />
      )}

      {/* Upload Signed Agreement Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={(open) => {
        if (!open) {
          setUploadModalOpen(false);
          setSelectedFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-green-600" />
              Upload Signed Agreement
            </DialogTitle>
            <DialogDescription>
              Upload the signed agreement document from your computer. This will mark the agreement as signed and create a work order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Agreement Info */}
            {selectedAgreement && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Client:</span>
                  <span className="text-sm font-medium">{selectedAgreement.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Agreement ID:</span>
                  <span className="text-sm font-mono">{selectedAgreement.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Value:</span>
                  <span className="text-sm font-medium">{selectedAgreement.value}</span>
                </div>
              </div>
            )}

            {/* File Upload Area */}
            <div className="space-y-2">
              <Label>Signed Agreement Document</Label>
              <div 
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-green-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileText className="h-10 w-10 mx-auto text-green-600" />
                    <p className="text-sm font-medium text-green-600">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">
                      PDF, JPG, PNG (max 10MB)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={handleUploadLater}
              disabled={uploadingFile}
              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Clock className="mr-2 h-4 w-4" />
              I'll Upload Later
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setUploadModalOpen(false);
                  setSelectedFile(null);
                }}
                disabled={uploadingFile}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUploadAndSign}
                disabled={!selectedFile || uploadingFile}
                className="bg-green-600 hover:bg-green-700"
              >
                {uploadingFile ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Upload & Sign
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <AgreementDetailModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setAgreementToView(null);
        }}
        agreement={agreementToView}
      />
    </div>
  );
}
