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
import { getStatusBadge } from "./QuotationStatusBadge";
import { QuotationActionButtons } from "./QuotationActionButtons";
import { deleteQuotation } from "@/services/supabase/QuotationFirebaseService";
import { useToast } from "@/hooks/use-toast";
import { TablePagination } from "@/components/ui/table-pagination";
import { useQuotationsData } from "@/contexts/QuotationsDataContext";
import { BrandLoader } from "@/components/ui/brand-loader";

interface QuotationsTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (quotation: any) => void;
}

// Format date for display
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

export function QuotationsTable({ filter, searchTerm, onEdit }: QuotationsTableProps) {
  const { quotations: contextQuotations, isLoading } = useQuotationsData();
  const { toast } = useToast();
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const handleDelete = async (id: string) => {
    const result = await deleteQuotation(id);
    if (result.success) {
      toast({
        title: "Success",
        description: "Quotation deleted successfully",
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete quotation",
        variant: "destructive",
      });
    }
  };

  // Valid quotation filters
  const validQuotationFilters = ["All Quotations", "Draft", "Sent", "Revised", "Accepted", "Rejected", "Pending"];
  
  // Filter quotations based on selected filter and search term
  const filteredQuotations = useMemo(() => {
    return contextQuotations.filter(quotation => {
      // Only apply filter if it's a valid quotation filter
      if (validQuotationFilters.includes(filter)) {
        if (filter !== "All Quotations") {
          const statusLower = (quotation.status || "").toLowerCase();
          const filterLower = filter.toLowerCase();
          if (statusLower !== filterLower) {
            return false;
          }
        }
      }
      
      // Filter by search term - search by quotation ID or client name
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase().trim();
        const quotationId = ((quotation as any).quotationId || quotation.id || "").toString().toLowerCase();
        const clientName = (quotation.client || "").toLowerCase();
        const service = ((quotation as any).service || "").toLowerCase();
        
        if (!quotationId.includes(searchLower) && !clientName.includes(searchLower) && !service.includes(searchLower)) {
          return false;
        }
      }
      
      return true;
    });
  }, [contextQuotations, filter, searchTerm]);
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredQuotations.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedQuotations = filteredQuotations.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <BrandLoader size="md" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>Quotations for your clients and prospects</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Quote #</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="hidden md:table-cell">Service Details</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedQuotations.length > 0 ? (
            paginatedQuotations.map((quotation) => (
              <TableRow key={quotation.id}>
                <TableCell className="font-medium">{quotation.quotationId || quotation.id}</TableCell>
                <TableCell>
                  {quotation.client}
                  {quotation.contactPerson && quotation.contactPerson !== quotation.client && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {quotation.contactPerson}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell max-w-[200px]">
                  <div className="truncate">{quotation.service}</div>
                  {quotation.validUntil && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Valid until: {formatDate(quotation.validUntil)}
                    </div>
                  )}
                </TableCell>
                <TableCell>{quotation.amount}</TableCell>
                <TableCell>{getStatusBadge(quotation.status)}</TableCell>
                <TableCell className="text-right">
                  <QuotationActionButtons quotation={quotation} onEdit={onEdit} />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6">
                No quotations found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {filteredQuotations.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredQuotations.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
}
