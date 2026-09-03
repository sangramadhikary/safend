'use client';

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  RefreshCw,
  Download,
  Users,
  Calendar,
  Pencil,
  Save,
} from "lucide-react";
// Force refresh
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/integrations/supabase/client";
import { CountUp } from "@/components/dashboard/CountUp";

interface LeaveBalance {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  email: string;
  phone: string;
  casualLeave: number;
  sickLeave: number;
  carryForwardLeave: number;
  totalBalance: number;
}

type SortField = 'employeeId' | 'employeeName' | 'casualLeave' | 'sickLeave' | 'carryForwardLeave' | 'totalBalance';
type SortDirection = 'asc' | 'desc' | null;

export function LeaveBalanceTable() {
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'casualLeave' | 'sickLeave' | 'carryForwardLeave' } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [sourceTable, setSourceTable] = useState<string>("employees");
  const { toast } = useToast();

  useEffect(() => {
    fetchLeaveBalances();
  }, []);

  const fetchLeaveBalances = async () => {
    try {
      setLoading(true);
      
      // Try hr_employees first, fall back to employees table
      let data: any[] | null = null;
      let usedTable = "employees";
      
      const { data: hrData, error: hrError } = await supabaseClient
        .from('hr_employees')
        .select('*')
        .order('employee_id', { ascending: true });
      
      if (!hrError && hrData && hrData.length > 0) {
        data = hrData;
        usedTable = "hr_employees";
      } else {
        // Fallback: use the employees table (always available)
        const { data: empData, error: empError } = await supabaseClient
          .from('employees')
          .select('*')
          .order('name', { ascending: true });
        
        if (empError) {
          console.warn("Neither hr_employees nor employees table is accessible:", hrError, empError);
          setLeaveBalances([]);
          return;
        }
        data = empData;
        usedTable = "employees";
      }
      
      setSourceTable(usedTable);
      
      const balances: LeaveBalance[] = (data || []).map((emp: any) => {
        const casualLeave = emp.casual_leave ?? 0;
        const sickLeave = emp.sick_leave ?? 0;
        const carryForwardLeave = emp.carry_forward_leave ?? 0;
        
        return {
          id: emp.id,
          employeeId: String(emp.employee_id || emp.id || ''),
          employeeName: emp.name || 'Unknown',
          department: emp.department || 'N/A',
          designation: emp.designation || 'N/A',
          email: emp.email || 'N/A',
          phone: emp.phone || 'N/A',
          casualLeave,
          sickLeave,
          carryForwardLeave,
          totalBalance: casualLeave + sickLeave + carryForwardLeave,
        };
      });
      
      setLeaveBalances(balances);
    } catch (error) {
      console.error("Error fetching leave balances:", error);
      toast({
        title: "Error",
        description: "Failed to fetch leave balances. The table may not be set up yet.",
        variant: "destructive",
      });
      setLeaveBalances([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredBalances = useMemo(() => {
    if (!searchTerm) return leaveBalances;
    
    const term = searchTerm.toLowerCase();
    return leaveBalances.filter(balance => 
      String(balance.employeeId).toLowerCase().includes(term) ||
      String(balance.employeeName).toLowerCase().includes(term) ||
      String(balance.department).toLowerCase().includes(term) ||
      String(balance.designation).toLowerCase().includes(term)
    );
  }, [leaveBalances, searchTerm]);

  const sortedBalances = useMemo(() => {
    if (!sortField || !sortDirection) return filteredBalances;
    
    return [...filteredBalances].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }
      
      return 0;
    });
  }, [filteredBalances, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-4 w-4 ml-1 text-safend-red" />;
    }
    if (sortDirection === 'desc') {
      return <ArrowDown className="h-4 w-4 ml-1 text-safend-red" />;
    }
    return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
  };

  const startEdit = (id: string, field: 'casualLeave' | 'sickLeave' | 'carryForwardLeave') => {
    const balance = leaveBalances.find(b => b.id === id);
    if (!balance) return;
    setEditingCell({ id, field });
    setDraftValue(String(balance[field]));
  };

  const handleSave = async (id: string, field: 'casualLeave' | 'sickLeave' | 'carryForwardLeave') => {
    const balance = leaveBalances.find(b => b.id === id);
    if (!balance) return;

    const parsed = Number(draftValue);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid non-negative number",
        variant: "destructive",
      });
      return;
    }

    const newValue = Math.floor(parsed);
    if (newValue === balance[field]) {
      setEditingCell(null);
      setDraftValue("");
      return;
    }

    const dbField = field === 'casualLeave' ? 'casual_leave' 
      : field === 'sickLeave' ? 'sick_leave' 
      : 'carry_forward_leave';

    const key = `${id}:${field}`;
    try {
      setSavingKey(key);
      const { error } = await supabaseClient
        .from(sourceTable)
        .update({ [dbField]: newValue })
        .eq('id', id);

      if (error) {
        console.error('Supabase update error:', error);
        throw new Error(error.message || 'Database update failed');
      }

      setLeaveBalances(balances =>
        balances.map(b =>
          b.id === id
            ? {
                ...b,
                [field]: newValue,
                totalBalance: field === 'casualLeave' 
                  ? newValue + b.sickLeave + b.carryForwardLeave
                  : field === 'sickLeave'
                  ? b.casualLeave + newValue + b.carryForwardLeave
                  : b.casualLeave + b.sickLeave + newValue,
              }
            : b
        )
      );

      setEditingCell(null);
      setDraftValue("");
      toast({
        title: "Updated",
        description: `${field.replace(/([A-Z])/g, ' $1').trim()} updated to ${newValue}`,
      });
    } catch (error: any) {
      console.error("Error saving:", error);
      const errorMsg = error?.message || 'Unknown error';

      if (errorMsg.includes('column') || errorMsg.includes('does not exist')) {
        toast({
          title: "Database Setup Required",
          description: "Please run the SQL migration to add leave balance columns. Check RUN_THIS_SQL_NOW.md",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Update Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } finally {
      setSavingKey(null);
    }
  };

  const isSaveDisabled = (balance: LeaveBalance, field: 'casualLeave' | 'sickLeave' | 'carryForwardLeave') => {
    if (savingKey === `${balance.id}:${field}`) return true;
    if (!draftValue.trim()) return true;
    const parsed = Number(draftValue);
    if (Number.isNaN(parsed) || parsed < 0) return true;
    return Math.floor(parsed) === balance[field];
  };

  const handleExport = () => {
    const headers = ['Employee ID', 'Employee Name', 'Department', 'Designation', 'Email', 'Casual Leave', 'Sick Leave', 'Carry Forward Leave', 'Total Balance'];
    const rows = sortedBalances.map(b => [
      b.employeeId,
      b.employeeName,
      b.department,
      b.designation,
      b.email,
      b.casualLeave,
      b.sickLeave,
      b.carryForwardLeave,
      b.totalBalance,
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave-balances-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Exported",
      description: "Leave balances exported successfully",
    });
  };

  const totalCasual = sortedBalances.reduce((sum, b) => sum + b.casualLeave, 0);
  const totalSick = sortedBalances.reduce((sum, b) => sum + b.sickLeave, 0);
  const totalCarryForward = sortedBalances.reduce((sum, b) => sum + b.carryForwardLeave, 0);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Leave Balances</h2>
          <p className="text-muted-foreground mt-1">
            Real-time employee leave balance summary
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeaveBalances}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Employees</p>
                <p className="text-2xl font-bold mt-1"><CountUp to={sortedBalances.length} duration={2} separator="," /></p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Casual Leave Pool</p>
                <p className="text-2xl font-bold mt-1"><CountUp to={totalCasual} duration={2} separator="," /></p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sick Leave Pool</p>
                <p className="text-2xl font-bold mt-1"><CountUp to={totalSick} duration={2} separator="," /></p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Carry Forward Pool</p>
                <p className="text-2xl font-bold mt-1"><CountUp to={totalCarryForward} duration={2} separator="," /></p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Employee Leave Balances</CardTitle>
              <CardDescription className="mt-1">
                Manage and track leave balances with real-time updates
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, name, department, or designation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {searchTerm && (
              <p className="text-sm text-muted-foreground mt-2">
                Found {filteredBalances.length} result{filteredBalances.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('employeeId')}
                      className="flex items-center font-semibold"
                    >
                      Employee ID
                      {getSortIcon('employeeId')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('employeeName')}
                      className="flex items-center font-semibold"
                    >
                      Employee Details
                      {getSortIcon('employeeName')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('casualLeave')}
                      className="flex items-center font-semibold mx-auto"
                    >
                      Casual Leave
                      {getSortIcon('casualLeave')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('sickLeave')}
                      className="flex items-center font-semibold mx-auto"
                    >
                      Sick Leave
                      {getSortIcon('sickLeave')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('carryForwardLeave')}
                      className="flex items-center font-semibold mx-auto"
                    >
                      Carry Forward
                      {getSortIcon('carryForwardLeave')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('totalBalance')}
                      className="flex items-center font-semibold mx-auto"
                    >
                      Total Balance
                      {getSortIcon('totalBalance')}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">Loading leave balances...</p>
                      </TableCell>
                    </TableRow>
                  ) : sortedBalances.length > 0 ? (
                    sortedBalances.map((balance, index) => (
                      <motion.tr
                        key={balance.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="font-medium">
                          {balance.employeeId}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{balance.employeeName}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {balance.department}
                              </Badge>
                              <span>•</span>
                              <span>{balance.designation}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            {editingCell?.id === balance.id && editingCell?.field === 'casualLeave' ? (
                              <>
                                <Input
                                  autoFocus
                                  type="number"
                                  value={draftValue}
                                  onChange={(e) => setDraftValue(e.target.value)}
                                  className="h-7 w-16 text-center"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleSave(balance.id, 'casualLeave')}
                                  disabled={isSaveDisabled(balance, 'casualLeave')}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Badge variant="outline" className="min-w-[40px] justify-center font-semibold">
                                  {balance.casualLeave}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => startEdit(balance.id, 'casualLeave')}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            {editingCell?.id === balance.id && editingCell?.field === 'sickLeave' ? (
                              <>
                                <Input
                                  autoFocus
                                  type="number"
                                  value={draftValue}
                                  onChange={(e) => setDraftValue(e.target.value)}
                                  className="h-7 w-16 text-center"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleSave(balance.id, 'sickLeave')}
                                  disabled={isSaveDisabled(balance, 'sickLeave')}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Badge variant="outline" className="min-w-[40px] justify-center font-semibold">
                                  {balance.sickLeave}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => startEdit(balance.id, 'sickLeave')}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            {editingCell?.id === balance.id && editingCell?.field === 'carryForwardLeave' ? (
                              <>
                                <Input
                                  autoFocus
                                  type="number"
                                  value={draftValue}
                                  onChange={(e) => setDraftValue(e.target.value)}
                                  className="h-7 w-16 text-center"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleSave(balance.id, 'carryForwardLeave')}
                                  disabled={isSaveDisabled(balance, 'carryForwardLeave')}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Badge variant="outline" className="min-w-[40px] justify-center font-semibold">
                                  {balance.carryForwardLeave}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => startEdit(balance.id, 'carryForwardLeave')}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <Badge className="bg-safend-red hover:bg-safend-red/90 min-w-[50px] justify-center font-bold">
                              {balance.totalBalance}
                            </Badge>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <p className="text-muted-foreground">No employees found</p>
                      </TableCell>
                    </TableRow>
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
