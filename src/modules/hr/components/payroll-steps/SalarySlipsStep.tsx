'use client';
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/integrations/supabase/client";
import { Search, IndianRupee, Download } from "lucide-react";

interface EmployeeListItem {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
}

interface EmployeePayslip {
  id: string;
  month: string;
  basic_salary: number;
  allowances: number;
  overtime_pay: number;
  deductions: number;
  net_salary: number;
  payment_status: string;
  payment_date: string | null;
  file_url: string | null;
}

export function SalarySlipsStep() {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeListItem | null>(null);

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('employees')
        .select('id, employee_id, name, designation, department')
        .ilike('status', 'active')
        .order('name', { ascending: true });
      if (error) throw error;
      setEmployees((data || []).map((emp: any) => ({
        id: emp.id,
        employeeId: emp.employee_id || emp.id,
        name: emp.name || 'Unknown',
        designation: emp.designation || 'N/A',
        department: emp.department || 'N/A',
      })));
    } catch (err) {
      console.error('Error fetching employees:', err);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = employees.filter((emp) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      emp.name.toLowerCase().includes(term) ||
      emp.employeeId.toLowerCase().includes(term) ||
      emp.designation.toLowerCase().includes(term) ||
      emp.department.toLowerCase().includes(term)
    );
  });

  if (selectedEmployee) {
    return <EmployeeSlipView employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Salary Slips</CardTitle>
        <CardDescription>
          Search for an employee and click to view their generated salary slips.
          Slips are auto-generated after payroll is processed each month.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, designation, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchTerm ? "No employees match your search." : "No active employees found."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedEmployee(emp)}
                >
                  <TableCell className="font-medium">{emp.employeeId}</TableCell>
                  <TableCell>{emp.name}</TableCell>
                  <TableCell>{emp.designation}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-safend-red">
                      View Slips
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeSlipView({ employee, onBack }: { employee: EmployeeListItem; onBack: () => void }) {
  const [slips, setSlips] = useState<EmployeePayslip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSlips();
  }, [employee.employeeId]);

  const fetchSlips = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('employee_payslips')
        .select('id, month, basic_salary, allowances, overtime_pay, deductions, net_salary, payment_status, payment_date, file_url')
        .eq('employee_id', employee.employeeId)
        .order('month', { ascending: false });

      if (error) throw error;
      setSlips(data || []);
    } catch (err) {
      console.error('Error fetching payslips:', err);
      setSlips([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">Pending</Badge>;
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">Paid</Badge>;
      case 'hold':
        return <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100">Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <div>
          <h3 className="text-lg font-bold">{employee.name}</h3>
          <p className="text-sm text-muted-foreground">
            {employee.employeeId} · {employee.designation} · {employee.department}
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated Salary Slips</CardTitle>
          <CardDescription>
            Salary slips are generated when payroll is processed. Once processed, slips appear here for download.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : slips.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IndianRupee className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">No salary slips generated yet</p>
              <p className="text-sm mt-1">Slips will appear here after payroll is processed for this employee.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Allowances</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slips.map((slip) => (
                  <TableRow key={slip.id}>
                    <TableCell className="font-medium">{slip.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(slip.basic_salary)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(slip.allowances)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(slip.overtime_pay)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(slip.deductions)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(slip.net_salary)}</TableCell>
                    <TableCell>{getStatusBadge(slip.payment_status)}</TableCell>
                    <TableCell className="text-right">
                      {slip.file_url ? (
                        <Button variant="outline" size="sm" className="flex items-center gap-1" asChild>
                          <a href={slip.file_url} target="_blank" rel="noopener noreferrer" download>
                            <Download className="h-4 w-4" /> Download
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
