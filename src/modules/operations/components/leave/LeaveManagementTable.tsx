'use client';

import { useState, useEffect } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Edit, Trash2, FileImage, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { applyBranchScope, onBranchScopeChange } from "@/utils/branchScope";
import { LeaveFormData } from "./LeaveForm";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Approved":
      return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    case "Pending":
      return <Badge className="bg-amber-500 hover:bg-amber-600">Pending HR Approval</Badge>;
    case "Rejected":
      return <Badge className="bg-red-500 hover:bg-red-600">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

const getTypeBadge = (leaveType: string) => {
  if (leaveType.startsWith("Planned Leave")) {
    const subType = leaveType.includes("Paid") ? "Paid" : "Unpaid";
    return (
      <div className="flex flex-col gap-1">
        <Badge className="bg-blue-500 hover:bg-blue-600">Planned Leave</Badge>
        <Badge variant="outline" className={subType === "Paid" ? "text-green-700 border-green-300" : "text-amber-700 border-amber-300"}>
          {subType}
        </Badge>
      </div>
    );
  }
  if (leaveType.startsWith("Urgent Leave")) {
    return (
      <div className="flex flex-col gap-1">
        <Badge className="bg-orange-500 hover:bg-orange-600">Urgent Leave</Badge>
        <Badge variant="outline" className="text-amber-700 border-amber-300">Unpaid</Badge>
      </div>
    );
  }
  if (leaveType.startsWith("Abscond")) {
    return <Badge variant="destructive">Abscond</Badge>;
  }
  return <Badge>{leaveType}</Badge>;
};

/** Check if a leave request was submitted by the employee via the Self-Service Hub. */
function isEmployeeSubmitted(record: LeaveRecord): boolean {
  return record.source === 'employee_self_service';
}

interface LeaveManagementTableProps {
  filter: string;
  searchTerm?: string;
  onEdit: (leave: any) => void;
  refreshKey?: number;
}

interface LeaveRecord {
  id: string;
  leave_id: string;
  employee_id: string;
  leave_type: string;
  from_date: string | null;
  to_date: string | null;
  reason: string;
  status: string;
  created_at: string;
  source?: string | null;
  applied_by?: string | null;
  employees?: { name: string } | null;
}

export function LeaveManagementTable({ filter, searchTerm = '', onEdit, refreshKey = 0 }: LeaveManagementTableProps) {
  const { toast } = useToast();
  const [leaveData, setLeaveData] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaveRequests();
    const off = onBranchScopeChange(() => fetchLeaveRequests());
    return () => off();
  }, [refreshKey]);

  const fetchLeaveRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leave_requests')
        .select('*, employees!leave_requests_employee_id_fkey(name)')
        .order('created_at', { ascending: false });
      query = applyBranchScope(query);
      const { data, error } = await query;

      if (error) {
        // Fallback without join if relationship fails
        let fallbackQuery = supabase
          .from('leave_requests')
          .select('*')
          .order('created_at', { ascending: false });
        fallbackQuery = applyBranchScope(fallbackQuery);
        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) throw fallbackError;
        setLeaveData((fallbackData || []).map((r: any) => ({ ...r, employees: null })));
      } else {
        setLeaveData(data || []);
      }
    } catch (err) {
      console.error('Error fetching leave requests:', err);
      setLeaveData([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate days between dates
  const calculateDays = (from: string | null, to: string | null) => {
    if (!from || !to) return "—";
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : "—";
  };

  // Filter leave requests
  const filteredLeave = leaveData.filter(record => {
    // Filter by status
    if (filter === "pending" && record.status !== "Pending") return false;
    if (filter === "approved" && record.status !== "Approved") return false;
    if (filter === "rejected" && record.status !== "Rejected") return false;

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesAny = [
        record.leave_id,
        record.employee_id,
        record.leave_type,
        record.reason,
        record.status,
        record.source === 'employee_self_service' ? 'employee submitted' : null,
      ].some(val => val?.toLowerCase().includes(search));
      if (!matchesAny) return false;
    }

    return true;
  });

  const handleDelete = async (leaveId: string) => {
    try {
      const { error } = await supabase
        .from('leave_requests')
        .delete()
        .eq('leave_id', leaveId);

      if (error) throw error;

      setLeaveData(prev => prev.filter(r => r.leave_id !== leaveId));
      toast({
        title: "Deleted",
        description: "Leave request deleted.",
        duration: 3000,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to delete.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>
          Leave requests submitted by Operations. Final approval by HR.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Request ID</TableHead>
            <TableHead>Staff Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLeave.length > 0 ? (
            filteredLeave.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.leave_id}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{record.employees?.name || record.employee_id}</span>
                    {isEmployeeSubmitted(record) && (
                      <Badge variant="outline" className="w-fit text-xs text-purple-700 border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-700">
                        <Smartphone className="h-3 w-3 mr-1" />
                        Employee Submitted
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{getTypeBadge(record.leave_type)}</TableCell>
                <TableCell>{record.from_date || "—"}</TableCell>
                <TableCell>{record.to_date || "—"}</TableCell>
                <TableCell>{calculateDays(record.from_date, record.to_date)}</TableCell>
                <TableCell>{getStatusBadge(record.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {record.status === "Pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(record.leave_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-6">
                No leave requests found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
