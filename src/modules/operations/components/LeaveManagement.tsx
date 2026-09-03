'use client';

import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Search, Download, Calendar, Plus, Info, Users, Clock, CalendarDays, AlertTriangle, FileText, IndianRupee, Shield, Smartphone } from "lucide-react";
import { LeaveManagementTable } from "./leave/LeaveManagementTable";
import { LeaveForm, LeaveFormData } from "./leave/LeaveForm";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { applyBranchScope } from "@/utils/branchScope";

export function LeaveManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState<LeaveFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();
  
  const handleEdit = (data: LeaveFormData) => {
    setEditData(data);
    setShowForm(true);
  };
  
  const handleFormClose = () => {
    setShowForm(false);
    setEditData(null);
  };
  
  const handleFormSubmit = async (data: LeaveFormData) => {
    setIsLoading(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        leave_id: data.id,
        employee_id: data.employeeId || null,
        leave_type: `${data.type} - ${data.subType}`,
        from_date: data.fromDate || today,
        to_date: data.toDate || today,
        reason: data.reason || null,
        status: 'Pending',
      };

      if (editData) {
        // Update existing
        const { error } = await supabase
          .from('leave_requests')
          .update(payload)
          .eq('leave_id', editData.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('leave_requests')
          .insert(payload);
        if (error) throw error;
      }

      setShowForm(false);
      setEditData(null);
      setRefreshKey(prev => prev + 1);

      toast({
        title: "Request Submitted",
        description: editData
          ? "Leave request updated successfully."
          : "Leave request submitted. Awaiting HR approval.",
        duration: 4000,
      });
    } catch (err: any) {
      console.error('Error saving leave request:', err);
      toast({
        title: "Error",
        description: err?.message || "Failed to save leave request.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold">Leave Management</h3>
          <p className="text-muted-foreground">
            Apply for leave on behalf of employees. Final approval by HR.
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button onClick={() => setShowForm(true)} className="flex gap-2 items-center">
            <Plus className="h-4 w-4" />
            <span>New Leave Request</span>
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-medium">Leave Request Guidelines:</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-300">
            <li><strong>Planned Leave</strong> — Paid (if balance available) or Unpaid. Must apply 3+ days in advance.</li>
            <li><strong>Sick Leave</strong> — Always Unpaid. Must apply 1+ day in advance.</li>
            <li><strong>Abscond</strong> — Employee absent 24+ hours without intimation. Show-cause notice issued, may lead to termination without salary.</li>
            <li><strong><Smartphone className="inline h-3.5 w-3.5 mr-0.5" />Employee Submitted</strong> — Requests submitted by employees via the Self-Service Hub are labeled with a purple badge.</li>
          </ul>
          <p className="text-xs mt-2 text-blue-600 dark:text-blue-400">
            Operations can only request. HR is the final approver for all leave applications.
          </p>
        </div>
      </div>
      
      <Card>
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="flex">
              <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "all" ? "bg-background text-foreground shadow-sm" : ""}`}
                >
                  All Requests
                </button>
                <button
                  onClick={() => setActiveTab("pending")}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "pending" ? "bg-background text-foreground shadow-sm" : ""}`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setActiveTab("approved")}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "approved" ? "bg-background text-foreground shadow-sm" : ""}`}
                >
                  Approved
                </button>
                <button
                  onClick={() => setActiveTab("rejected")}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "rejected" ? "bg-background text-foreground shadow-sm" : ""}`}
                >
                  Rejected
                </button>
                <button
                  onClick={() => setActiveTab("information")}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "information" ? "bg-background text-foreground shadow-sm" : ""}`}
                >
                  <Info className="h-3.5 w-3.5 mr-1" />
                  Information
                </button>
              </div>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search leave requests..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Button variant="outline" size="sm" className="h-9">
                <Calendar className="h-4 w-4 mr-2" />
                <span>Date Range</span>
              </Button>
              
              <Button variant="outline" size="sm" className="h-9">
                <Download className="h-4 w-4 mr-2" />
                <span>Export</span>
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-[400px] bg-white rounded-lg">
              <BrandLoader size="lg" message="Loading leave data..." />
            </div>
          ) : activeTab === "information" ? (
            <LeaveInformationPanel />
          ) : (
            <LeaveManagementTable 
              filter={activeTab === "all" ? "All Leave" : activeTab} 
              searchTerm={searchTerm}
              onEdit={handleEdit}
              refreshKey={refreshKey}
            />
          )}
        </div>
      </Card>

      {/* Leave Form */}
      {showForm && (
        <LeaveForm
          isOpen={showForm}
          onClose={handleFormClose}
          onSubmit={handleFormSubmit}
          editData={editData}
        />
      )}
    </div>
  );
}

// ─── INFORMATION TAB CONTENT ─────────────────────────────────────────────────

function LeaveInformationPanel() {
  const [viewFilter, setViewFilter] = useState<'today' | 'week' | 'upcoming' | 'all'>('today');
  const [infoSearch, setInfoSearch] = useState('');
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaves();
  }, []);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leave_requests')
        .select('*, employees!leave_requests_employee_id_fkey(name)')
        .order('from_date', { ascending: false });
      query = applyBranchScope(query);
      const { data, error } = await query;

      if (error) {
        // Fallback without join
        let fbQuery = supabase
          .from('leave_requests')
          .select('*')
          .order('from_date', { ascending: false });
        fbQuery = applyBranchScope(fbQuery);
        const { data: fallback } = await fbQuery;
        setLeaves((fallback || []).map((r: any) => ({ ...r, employees: null })));
      } else {
        setLeaves(data || []);
      }
    } catch {
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Compute stats
  const onLeaveToday = leaves.filter(l =>
    l.status === 'Approved' && l.from_date && l.to_date &&
    l.from_date <= today && l.to_date >= today
  ).length;

  const pendingRequests = leaves.filter(l => l.status === 'Pending').length;

  const upcomingLeaves = leaves.filter(l =>
    l.status === 'Approved' && l.from_date && l.from_date > today
  ).length;

  const abscondCount = leaves.filter(l =>
    l.leave_type?.toLowerCase().includes('abscond')
  ).length;

  // Filter leaves based on view
  const filteredLeaves = leaves.filter(l => {
    if (viewFilter === 'today') {
      return l.status === 'Approved' && l.from_date && l.to_date &&
        l.from_date <= today && l.to_date >= today;
    }
    if (viewFilter === 'week') {
      return l.status === 'Approved' && l.from_date &&
        l.from_date >= today && l.from_date <= weekEnd;
    }
    if (viewFilter === 'upcoming') {
      return l.status === 'Approved' && l.from_date && l.from_date > today;
    }
    // 'all' — show all active (approved + pending)
    return l.status === 'Approved' || l.status === 'Pending';
  }).filter(l => {
    if (!infoSearch) return true;
    const term = infoSearch.toLowerCase();
    return [l.employees?.name, l.employee_id, l.leave_type, l.reason, l.status]
      .filter(Boolean).join(' ').toLowerCase().includes(term);
  });

  const calculateDays = (from: string | null, to: string | null) => {
    if (!from || !to) return '—';
    const diff = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : '—';
  };

  const getStatusBadge = (status: string) => {
    if (status === 'Approved') return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    if (status === 'Pending') return <Badge className="bg-amber-500 hover:bg-amber-600">{status}</Badge>;
    if (status === 'Rejected') return <Badge className="bg-red-500 hover:bg-red-600">{status}</Badge>;
    return <Badge>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-[300px]">
        <BrandLoader size="lg" message="Loading leave information..." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-red-500">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Users className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">On Leave Today</p>
            <p className="text-2xl font-bold">{onLeaveToday}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-amber-500">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pending Requests</p>
            <p className="text-2xl font-bold">{pendingRequests}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-blue-500">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Upcoming Leaves</p>
            <p className="text-2xl font-bold">{upcomingLeaves}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-gray-500">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Abscond / AWOL</p>
            <p className="text-2xl font-bold">{abscondCount}</p>
          </div>
        </Card>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          <button
            onClick={() => setViewFilter('today')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${viewFilter === 'today' ? 'bg-background text-foreground shadow-sm' : ''}`}
          >
            On Leave Today
          </button>
          <button
            onClick={() => setViewFilter('week')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${viewFilter === 'week' ? 'bg-background text-foreground shadow-sm' : ''}`}
          >
            This Week
          </button>
          <button
            onClick={() => setViewFilter('upcoming')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${viewFilter === 'upcoming' ? 'bg-background text-foreground shadow-sm' : ''}`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setViewFilter('all')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${viewFilter === 'all' ? 'bg-background text-foreground shadow-sm' : ''}`}
          >
            All Active
          </button>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search employee..."
            className="pl-8"
            value={infoSearch}
            onChange={(e) => setInfoSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Leave Table */}
      <div className="bg-white dark:bg-gray-800 rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 dark:bg-gray-900">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Employee</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Leave Type</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">From</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">To</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Days</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Reason</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredLeaves.length > 0 ? (
              filteredLeaves.map((leave) => (
                <tr key={leave.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-3 px-4 font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{leave.employees?.name || leave.employee_id || '—'}</span>
                      {leave.source === 'employee_self_service' && (
                        <span className="inline-flex items-center w-fit text-xs text-purple-700 border border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-700 rounded px-1.5 py-0.5">
                          <Smartphone className="h-3 w-3 mr-1" />
                          Employee Submitted
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">{leave.leave_type || '—'}</td>
                  <td className="py-3 px-4">{leave.from_date ? new Date(leave.from_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="py-3 px-4">{leave.to_date ? new Date(leave.to_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="py-3 px-4">{calculateDays(leave.from_date, leave.to_date)}</td>
                  <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate">{leave.reason || '—'}</td>
                  <td className="py-3 px-4">{getStatusBadge(leave.status)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-muted-foreground">
                    {viewFilter === 'today'
                      ? 'No employees on leave today — full strength!'
                      : 'No leave records found for this filter'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
