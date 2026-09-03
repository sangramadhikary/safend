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
import { Edit, Trash2, Check, FileText, Eye } from "lucide-react";
import { IndianRupee } from "@/components/icons/IndianRupee";
import { useToast } from "@/hooks/use-toast";
import { updateFollowup, deleteFollowup, Followup } from "@/services/supabase/FollowupFirebaseService";
import { TablePagination } from "@/components/ui/table-pagination";
import { DeleteRequestModal } from "@/components/sales/DeleteRequestModal";
import { AdminDeleteConfirmModal } from "@/components/sales/AdminDeleteConfirmModal";
import { FollowupDetailModal } from "./FollowupDetailModal";
import { useFollowupsData } from "@/contexts/FollowupsDataContext";

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "High":
      return <Badge className="bg-red-500 hover:bg-red-600">{priority}</Badge>;
    case "Medium":
      return <Badge className="bg-amber-500 hover:bg-amber-600">{priority}</Badge>;
    case "Low":
      return <Badge className="bg-blue-500 hover:bg-blue-600">{priority}</Badge>;
    default:
      return <Badge>{priority}</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Pending":
      return <Badge className="bg-blue-500 hover:bg-blue-600">{status}</Badge>;
    case "Completed":
      return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    case "Overdue":
      return <Badge className="bg-red-500 hover:bg-red-600">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

interface FollowupsTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (followup: any) => void;
  onConvertToQuotation?: (followup: Followup) => void;
}

export function FollowupsTable({ filter, searchTerm, onEdit, onConvertToQuotation }: FollowupsTableProps) {
  const { toast } = useToast();
  // Use centralized followups data from context
  const { followups: contextFollowups } = useFollowupsData();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [selectedFollowup, setSelectedFollowup] = useState<Followup | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [followupToView, setFollowupToView] = useState<Followup | null>(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  // Filter follow-ups based on selected filter and search term
  const filteredFollowups = useMemo(() => {
    return contextFollowups.filter(followup => {
      // Safety check for dateTime
      if (!followup.dateTime) return false;
      
      // Extract date from dateTime string
      const followupDate = followup.dateTime.split('T')[0];
      // Filter by time frame
      if (filter === "Today" && followupDate !== today) {
        return false;
      } else if (filter === "This Week") {
        const followupDateTime = new Date(followup.dateTime);
        const currentDate = new Date();
        const daysDifference = Math.floor((followupDateTime.getTime() - currentDate.getTime()) / (1000 * 3600 * 24));
        if (daysDifference < 0 || daysDifference >= 7) {
          return false;
        }
      } else if (filter === "This Month") {
        const followupMonth = new Date(followup.dateTime).getMonth();
        const currentMonth = new Date().getMonth();
        if (followupMonth !== currentMonth) {
          return false;
        }
      } else if (filter === "Overdue" && followup.status !== "Overdue") {
        return false;
      } else if (filter !== "All Follow-ups" && filter !== "Today" && 
                 filter !== "This Week" && filter !== "This Month" && 
                 filter !== "Overdue") {
        return false;
      }
      
      // Filter by search term
      if (searchTerm && !Object.values(followup).some(value => 
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )) {
        return false;
      }
      
      return true;
    });
  }, [contextFollowups, filter, searchTerm, today]);
  
  // Handle delete request (admin can delete directly, employees go through approval)
  const handleDeleteClick = (followup: Followup) => {
    setSelectedFollowup(followup);
    const userRole = typeof window !== 'undefined' ? localStorage.getItem("userRole") : "";
    if (userRole === "admin") {
      setAdminDeleteModalOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  };

  const handleAdminDirectDelete = async () => {
    if (!selectedFollowup?.id) return;
    const result = await deleteFollowup(selectedFollowup.id);
    if (result.success) {
      toast({ title: "Follow-up Deleted", description: `Follow-up for "${selectedFollowup.contact}" has been permanently deleted.` });
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete follow-up", variant: "destructive" });
    }
    setAdminDeleteModalOpen(false);
    setSelectedFollowup(null);
  };

  const handleView = (followup: Followup) => {
    setFollowupToView(followup);
    setViewModalOpen(true);
  };
  
  const handleMarkComplete = async (id: string) => {
    const result = await updateFollowup(id, { status: "Completed" });
    if (result.success) {
      toast({
        title: "Follow-up Completed",
        description: "Follow-up has been marked as completed.",
        duration: 3000,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to update follow-up",
        variant: "destructive",
      });
    }
  };
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredFollowups.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedFollowups = filteredFollowups.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>Scheduled follow-ups with clients and prospects</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead className="hidden md:table-cell">Company</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="hidden md:table-cell">Date & Time</TableHead>
            <TableHead className="hidden lg:table-cell">Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedFollowups.length > 0 ? (
            paginatedFollowups.map((followup) => {
              // Parse dateTime to display date and time separately
              const dateTime = new Date(followup.dateTime);
              const displayDate = dateTime.toLocaleDateString('en-IN');
              const displayTime = dateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
              
              return (
                <TableRow key={followup.id}>
                  <TableCell className="font-medium">{followup.contact}</TableCell>
                  <TableCell className="hidden md:table-cell">{followup.company}</TableCell>
                  <TableCell>{followup.type}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {displayDate} at {displayTime}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {followup.subject}
                    {followup.priority && (
                      <div className="mt-1">
                        {getPriorityBadge(followup.priority)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(followup.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleView(followup)}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {followup.status !== "Completed" && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-green-500 hover:text-green-600"
                          onClick={() => handleMarkComplete(followup.id!)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {followup.status === "Completed" && onConvertToQuotation && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-blue-500 hover:text-blue-600"
                          onClick={() => onConvertToQuotation(followup)}
                          title="Convert to Quotation"
                        >
                          <FileText className="h-4 w-4" />
                          <IndianRupee className="h-3 w-3 -ml-1" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onEdit(followup)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600" 
                        onClick={() => handleDeleteClick(followup)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-6">
                No follow-ups found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {filteredFollowups.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredFollowups.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
      
      {/* Delete Request Modal (for non-admin users) */}
      {selectedFollowup && (
        <DeleteRequestModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedFollowup(null);
          }}
          itemType="followup"
          itemId={selectedFollowup.id || ""}
          clientName={selectedFollowup.contact}
          additionalInfo={`Company: ${selectedFollowup.company} | Subject: ${selectedFollowup.subject} | Type: ${selectedFollowup.type}`}
        />
      )}

      {/* Admin Direct Delete Confirmation Modal */}
      {selectedFollowup && (
        <AdminDeleteConfirmModal
          isOpen={adminDeleteModalOpen}
          onClose={() => { setAdminDeleteModalOpen(false); setSelectedFollowup(null); }}
          onConfirm={handleAdminDirectDelete}
          itemType="Follow-up"
          itemName={selectedFollowup.contact}
          itemId={selectedFollowup.id || ""}
        />
      )}

      {/* View Details Modal */}
      <FollowupDetailModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setFollowupToView(null);
        }}
        followup={followupToView}
      />
    </div>
  );
}
