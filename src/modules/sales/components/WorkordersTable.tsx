'use client';
import { useState, useEffect, useMemo } from "react";
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
import {
  Eye, Edit, Trash2, PlayCircle, CheckCircle, Clock, MoreVertical, AlertTriangle,
  Split, Loader2, FileCheck, FileClock, Layers,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  updateWorkOrder,
  splitPerPostWorkOrder,
} from "@/services/supabase/WorkOrderFirebaseService";
import {
  toWorkOrderRows,
  searchTextOf,
  isGroupedPerPostRecord,
  type WorkOrderRow,
} from "../utils/workOrderRows";
import { cascadeDeleteWorkOrder } from "@/services/supabase/WorkOrderCascadeDeleteService";
import { getQuotationById, updateQuotation, getQuotationByDisplayId } from "@/services/supabase/QuotationFirebaseService";
import { syncPostsFromStartedWorkOrder } from "@/services/supabase/OperationalPostService";
import { SecurityPostFormModal } from "./SecurityPostFormModal";
import { TablePagination } from "@/components/ui/table-pagination";
import { DeleteRequestModal } from "@/components/sales/DeleteRequestModal";
import { AdminDeleteConfirmModal } from "@/components/sales/AdminDeleteConfirmModal";
import { WorkOrderDetailModal } from "./WorkOrderDetailModal";
import { TerminateWorkOrderModal } from "./TerminateWorkOrderModal";
import { useWorkOrdersData } from "@/contexts/WorkOrdersDataContext";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Draft":
      return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
    case "Scheduled":
      return <Badge className="bg-blue-500 hover:bg-blue-600">{status}</Badge>;
    case "In Progress":
      return <Badge className="bg-amber-500 hover:bg-amber-600">{status}</Badge>;
    case "Completed":
      return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    case "On Hold":
      return <Badge className="bg-orange-500 hover:bg-orange-600">{status}</Badge>;
    case "Cancelled":
      return <Badge className="bg-red-500 hover:bg-red-600">{status}</Badge>;
    case "Terminated":
      return <Badge className="bg-red-700 hover:bg-red-800">{status}</Badge>;
    case "Termination Initiated":
      return <Badge className="bg-orange-600 hover:bg-orange-700">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

/**
 * Status filters this table understands. Any other value — including the
 * "All Work Orders" / "All Workorders" spellings callers use — means no status
 * filter at all, so every work order is listed.
 */
const STATUS_FILTERS = ["Draft", "Scheduled", "In Progress", "Completed", "On Hold", "Cancelled", "Terminated"];

/** How many security posts a work order covers */
const postCountOf = (workOrder: any): number =>
  (workOrder?.locations?.length || workOrder?.posts?.length || 0);

const formatRowDate = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface WorkordersTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (workorder: any) => void;
}

export function WorkordersTable({ filter, searchTerm, onEdit }: WorkordersTableProps) {
  // Use centralized work orders data from context
  const { workOrders: contextWorkOrders } = useWorkOrdersData();
  const [showPostForm, setShowPostForm] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [workOrderToDelete, setWorkOrderToDelete] = useState<any>(null);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [workOrderToView, setWorkOrderToView] = useState<any>(null);
  const [terminateModalOpen, setTerminateModalOpen] = useState(false);
  const [workOrderToTerminate, setWorkOrderToTerminate] = useState<any>(null);
  const [workOrderToSplit, setWorkOrderToSplit] = useState<any>(null);
  const [splitting, setSplitting] = useState(false);
  const { toast } = useToast();

  // Turn a legacy multi-post row into one work order per post
  const handleConfirmSplit = async () => {
    if (!workOrderToSplit?.id) return;
    setSplitting(true);
    try {
      const result = await splitPerPostWorkOrder(workOrderToSplit.id);
      if (result.success) {
        const total = (result.created?.length || 0) + 1;
        toast({
          title: `Split into ${total} work orders`,
          description: `${workOrderToSplit.clientName || 'This client'} now has one work order per post. ${result.retainedWorkOrderId} kept its ID.`,
        });
        setWorkOrderToSplit(null);
      } else {
        toast({
          title: "Could not split this work order",
          description: result.error || 'Split failed',
          variant: "destructive",
        });
      }
    } finally {
      setSplitting(false);
    }
  };
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /**
   * One row per actual work order. A record that still holds several per-post
   * work orders is expanded into its posts, so a client with 7 per-post work
   * orders is listed as 7 — whether or not the record has been split yet.
   */
  const allRows = useMemo(() => toWorkOrderRows(contextWorkOrders), [contextWorkOrders]);

  const filteredRows = useMemo(() => {
    const requestedStatus = STATUS_FILTERS.find(
      s => s.toLowerCase() === (filter || "").trim().toLowerCase()
    );
    const searchLower = searchTerm.trim().toLowerCase();

    return allRows.filter(row => {
      // No recognised status filter → show every work order
      if (requestedStatus && !row.status.toLowerCase().includes(requestedStatus.toLowerCase())) {
        return false;
      }
      if (searchLower && !searchTextOf(row).includes(searchLower)) {
        return false;
      }
      return true;
    });
  }, [allRows, filter, searchTerm]);

  /** Records still holding several work orders in one row */
  const groupedRecords = useMemo(() => {
    const seen = new Map<string, any>();
    for (const row of allRows) {
      if (row.isGrouped && row.source?.id && !seen.has(row.source.id)) {
        seen.set(row.source.id, row.source);
      }
    }
    return Array.from(seen.values());
  }, [allRows]);

  // Pagination calculation — at least one page so the footer never reads "of 0"
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);
  
  // Handle delete request (admin can delete directly, employees go through approval)
  const handleDeleteClick = (workOrder: any) => {
    setWorkOrderToDelete(workOrder);
    const userRole = typeof window !== 'undefined' ? localStorage.getItem("userRole") : "";
    if (userRole === "admin") {
      setAdminDeleteModalOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  };

  const handleAdminDirectDelete = async () => {
    if (!workOrderToDelete?.id) return;
    const result = await cascadeDeleteWorkOrder(workOrderToDelete.id);
    if (result.success) {
      toast({
        title: "Work Order Deleted",
        description: `Work order for "${workOrderToDelete.clientName || 'Unknown Client'}" has been permanently deleted.`,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete work order",
        variant: "destructive",
      });
    }
    setAdminDeleteModalOpen(false);
    setWorkOrderToDelete(null);
  };
  
  const handleView = (workOrder: any) => {
    setWorkOrderToView(workOrder);
    setViewModalOpen(true);
  };
  
  const handleStart = async (workOrder: any) => {
    const result = await updateWorkOrder(workOrder.id, { 
      status: "In Progress",
      startDate: new Date()
    });
    
    if (result.success) {
      // Sync posts from the quotation to operations
      if (workOrder.linkedQuoteId) {
        const quotationResult = await getQuotationById(workOrder.linkedQuoteId);
        if (quotationResult.success && quotationResult.data) {
          await syncPostsFromStartedWorkOrder(
            { ...workOrder, status: "In Progress" }, 
            quotationResult.data
          );
        }
      }
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to start work order",
        variant: "destructive",
      });
    }
  };
  
  const handleComplete = async (workOrder: any) => {
    const result = await updateWorkOrder(workOrder.id, { 
      status: "Completed",
      endDate: new Date().toISOString().split('T')[0]
    });
    
    if (!result.success) {
      toast({
        title: "Error",
        description: result.error || "Failed to complete work order",
        variant: "destructive",
      });
    }
  };
  
  const handleCancel = async (workOrder: any) => {
    const result = await updateWorkOrder(workOrder.id, { status: "Cancelled" });
    
    if (result.success) {
      // Revert linked quotation back to Draft so it can be re-approved
      if (workOrder.linkedQuoteId) {
        const quotResult = await getQuotationByDisplayId(workOrder.linkedQuoteId);
        if (quotResult.success && quotResult.data?.id) {
          await updateQuotation(quotResult.data.id, { status: "Draft" });
        }
      }
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to cancel work order",
        variant: "destructive",
      });
    }
  };

  const handleDoLater = async (workOrder: any) => {
    // Move work order back to Draft (pause it for later)
    const result = await updateWorkOrder(workOrder.id, { status: "Draft" });
    if (!result.success) {
      toast({
        title: "Error",
        description: result.error || "Failed to update work order",
        variant: "destructive",
      });
    }
  };

  const handlePostFormClose = () => {
    setShowPostForm(false);
    setSelectedWorkOrder(null);
  };

  const handlePostFormSubmit = async () => {
    // Post will be synced to operations via the modal
    setShowPostForm(false);
    setSelectedWorkOrder(null);
  };

  return (
    <>
      {/* Records that still hold several work orders in one row. They are listed
          post by post above, but each post is not yet its own record. */}
      {groupedRecords.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <Layers className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="flex-1 text-xs text-amber-800 dark:text-amber-300">
            {groupedRecords.length} record{groupedRecords.length === 1 ? '' : 's'} still{' '}
            {groupedRecords.length === 1 ? 'holds' : 'hold'} several per-post work orders inside one
            row. Each post is listed below, but they cannot be edited, terminated or invoiced
            individually until the record is split.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groupedRecords.map(record => (
              <Button
                key={record.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-amber-300 text-xs text-amber-800 hover:bg-amber-100 dark:text-amber-300"
                onClick={() => setWorkOrderToSplit(record)}
              >
                <Split className="mr-1.5 h-3 w-3" />
                Split {record.clientName || record.workOrderId} ({postCountOf(record)})
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
        <Table>
        <TableCaption>
          {filteredRows.length} work order{filteredRows.length === 1 ? '' : 's'}
          {groupedRecords.length > 0 && ' · some are still stored as grouped records'}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Client</TableHead>
            <TableHead>Work Order</TableHead>
            <TableHead className="hidden md:table-cell">Post</TableHead>
            <TableHead className="hidden lg:table-cell">Contract Period</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="hidden xl:table-cell">Documents</TableHead>
            <TableHead className="hidden xl:table-cell">Client Ref</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedRows.length > 0 ? (
            paginatedRows.map((row: WorkOrderRow) => {
              // Actions operate on the underlying record
              const workOrder = row.source;
              return (
              <TableRow key={row.key}>
                {/* Client + the customer it belongs to */}
                <TableCell>
                  <p className="font-medium leading-tight">{row.clientName || '—'}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {row.customerId || 'No Customer ID'}
                  </p>
                </TableCell>

                {/* Work order ID, and how it is stored */}
                <TableCell>
                  <span className="font-mono text-xs">{row.workOrderId || '—'}</span>
                  {row.isGrouped && (
                    <span
                      className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-400"
                      title={`This and ${row.siblingCount - 1} more are stored inside one record (${workOrder.workOrderId}). Split it to manage them separately.`}
                    >
                      {row.postIndex + 1} of {row.siblingCount} in one record
                    </span>
                  )}
                  {!row.isGrouped && row.batchId && (
                    <span
                      className="mt-0.5 block text-[10px] text-muted-foreground"
                      title="Raised together with other work orders, one per security post"
                    >
                      per-post
                    </span>
                  )}
                </TableCell>

                {/* What it covers */}
                <TableCell className="hidden md:table-cell">
                  <p className="text-sm leading-tight">
                    {row.postName || `${row.postCount} post${row.postCount === 1 ? '' : 's'}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {row.guards > 0 ? `${row.guards} guard${row.guards === 1 ? '' : 's'}` : 'No guards set'}
                  </p>
                </TableCell>

                {/* Contract period */}
                <TableCell className="hidden lg:table-cell whitespace-nowrap text-sm">
                  {row.startDate ? formatRowDate(row.startDate) : '—'}
                  <span className="mx-1 text-muted-foreground">→</span>
                  {row.endDate
                    ? formatRowDate(row.endDate)
                    : <span className="text-muted-foreground">open</span>}
                </TableCell>

                <TableCell className="text-right font-medium whitespace-nowrap">
                  ₹{row.value.toLocaleString('en-IN')}
                </TableCell>

                {/* Paperwork actually on file */}
                <TableCell className="hidden xl:table-cell">
                  <div className="flex items-center gap-2">
                    {row.signedDocUrl ? (
                      <a
                        href={row.signedDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline"
                        title="Signed work order received from the client"
                      >
                        <FileCheck className="h-3.5 w-3.5" />Signed
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600" title="No signed work order on file">
                        <FileClock className="h-3.5 w-3.5" />Unsigned
                      </span>
                    )}
                    {row.generatedDocUrl && (
                      <a
                        href={row.generatedDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-blue-600 hover:underline"
                        title="Work order PDF generated for the client"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </TableCell>

                <TableCell className="hidden xl:table-cell font-mono text-xs">
                  {row.clientWoRef || <span className="text-muted-foreground">—</span>}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    {getStatusBadge(row.status)}
                    {row.isTerminating && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-orange-600 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-800" title="Termination in progress">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Terminating
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleView(workOrder)}
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
                        {(workOrder.status === "Draft" || workOrder.status === "Scheduled") && (
                          <DropdownMenuItem
                            onClick={() => onEdit(workOrder)}
                            className="text-blue-600 focus:text-white focus:bg-blue-600"
                          >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Open &amp; Complete Work Order
                          </DropdownMenuItem>
                        )}
                        {workOrder.status === "In Progress" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleComplete(workOrder)}
                              className="text-green-600 focus:text-white focus:bg-green-600"
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Mark as Completed
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDoLater(workOrder)}>
                              <Clock className="mr-2 h-4 w-4" />
                              Do Later (pause)
                            </DropdownMenuItem>
                          </>
                        )}
                        {workOrder.status === "Draft" && (
                          <DropdownMenuItem onClick={() => handleDoLater(workOrder)}>
                            <Clock className="mr-2 h-4 w-4" />
                            Do Later
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onEdit(workOrder)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {/* Record holding several posts in one row */}
                        {isGroupedPerPostRecord(workOrder) && (
                          <DropdownMenuItem
                            onClick={() => setWorkOrderToSplit(workOrder)}
                            className="text-blue-600 focus:text-white focus:bg-blue-600"
                          >
                            <Split className="mr-2 h-4 w-4" />
                            Split into {postCountOf(workOrder)} work orders
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {/* Terminate Work Order - available for active work orders */}
                        {(workOrder.status === "In Progress" || workOrder.status === "Completed" || workOrder.status === "Scheduled" || workOrder.status === "Termination Initiated") && (
                          <DropdownMenuItem
                            onClick={() => {
                              setWorkOrderToTerminate(workOrder);
                              setTerminateModalOpen(true);
                            }}
                            className="text-orange-600 focus:text-white focus:bg-orange-600"
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            Terminate Work Order
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(workOrder)}
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
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-6">
                No work orders found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {filteredRows.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredRows.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>

    {showPostForm && selectedWorkOrder && (
      <SecurityPostFormModal
        isOpen={showPostForm}
        onClose={handlePostFormClose}
        onSubmit={handlePostFormSubmit}
        workOrder={selectedWorkOrder}
      />
    )}

    {/* Split a legacy multi-post work order into one work order per post */}
    <AlertDialog
      open={!!workOrderToSplit}
      onOpenChange={(open) => { if (!open && !splitting) setWorkOrderToSplit(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Split into {postCountOf(workOrderToSplit)} separate work orders?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                <strong>{workOrderToSplit?.clientName}</strong> issued a separate work order per
                post, but they are all stored inside{' '}
                <span className="font-mono">{workOrderToSplit?.workOrderId}</span>, so the list shows
                them as one.
              </p>
              <p>
                Each post becomes a work order in its own right — with its own dates, value, client
                reference and signed document — all linked to this customer.{' '}
                <span className="font-mono">{workOrderToSplit?.workOrderId}</span> keeps its ID and
                becomes the first post's work order, so nothing already referencing it breaks.
              </p>
              <p className="text-muted-foreground">
                Posts without their own contract value share whatever is left of the{' '}
                {workOrderToSplit?.value} total evenly, so the client's total stays the same.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={splitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirmSplit(); }}
            disabled={splitting}
            className="bg-safend-red hover:bg-red-700"
          >
            {splitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Splitting…</>
              : `Split into ${postCountOf(workOrderToSplit)} work orders`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    {/* Delete Request Modal (for non-admin users) */}
    {workOrderToDelete && (
      <DeleteRequestModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setWorkOrderToDelete(null);
        }}
        itemType="workorder"
        itemId={workOrderToDelete.id || ""}
        clientName={workOrderToDelete.clientName || "Unknown Client"}
        additionalInfo={`Agreement Ref: ${workOrderToDelete.linkedAgreementId || "N/A"} | Value: ${workOrderToDelete.value}`}
      />
    )}

    {/* Admin Direct Delete Confirmation Modal */}
    {workOrderToDelete && (
      <AdminDeleteConfirmModal
        isOpen={adminDeleteModalOpen}
        onClose={() => {
          setAdminDeleteModalOpen(false);
          setWorkOrderToDelete(null);
        }}
        onConfirm={handleAdminDirectDelete}
        itemType="Work Order"
        itemName={workOrderToDelete.clientName || "Unknown Client"}
        itemId={workOrderToDelete.workOrderId || workOrderToDelete.id || ""}
      />
    )}

    {/* View Details Modal */}
    <WorkOrderDetailModal
      isOpen={viewModalOpen}
      onClose={() => {
        setViewModalOpen(false);
        setWorkOrderToView(null);
      }}
      workOrder={workOrderToView}
    />

    {/* Terminate Work Order Modal */}
    {workOrderToTerminate && (
      <TerminateWorkOrderModal
        isOpen={terminateModalOpen}
        onClose={() => {
          setTerminateModalOpen(false);
          setWorkOrderToTerminate(null);
        }}
        workOrder={workOrderToTerminate}
      />
    )}
  </>
  );
}
