'use client';
import { useState, useEffect } from "react";
import { SalaryCalculationProps } from "./index";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Save, X, IndianRupee, Users, Briefcase, AlertCircle, Search, CalendarDays, CalendarRange } from "lucide-react";
import { activePostDesignations, type DesignationEntry } from "@/modules/shared/constants/serviceTypes";
import { CONVENTIONAL_BASIS_DAYS } from "@/lib/invoice/rateBasis";

/** Get actual number of days in a given YYYY-MM month string. */
function daysInMonth(monthStr: string): number {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

type DayBasis = 'fixed26' | 'calendar';
const DAY_BASIS_STORAGE_KEY = 'payroll:postwise-salary:day-basis';

// ===========================================================================
// Main Component
// ===========================================================================

export function SalaryCalculation({ filter }: SalaryCalculationProps) {
  const [activeTab, setActiveTab] = useState("slips");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Salary Management</h2>
        <p className="text-muted-foreground">View salary slips and define post-wise salary rates</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="slips" className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4" />
            Salary Slips
          </TabsTrigger>
          <TabsTrigger value="postwise" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Post-wise Salary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slips" className="mt-4">
          <SalarySlipsTab />
        </TabsContent>

        <TabsContent value="postwise" className="mt-4">
          <PostWiseSalaryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// Tab 1: Salary Slips
// ===========================================================================

interface EmployeeListItem {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
}

function SalarySlipsTab() {
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
    return emp.name.toLowerCase().includes(term) || emp.employeeId.toLowerCase().includes(term) || emp.designation.toLowerCase().includes(term) || emp.department.toLowerCase().includes(term);
  });

  if (selectedEmployee) {
    return <EmployeeSlipView employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salary Slips</CardTitle>
        <CardDescription>Search for an employee and click to view their generated salary slips</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, ID, designation, or department..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">{searchTerm ? "No employees match your search." : "No active employees found."}</div>
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
                <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEmployee(emp)}>
                  <TableCell className="font-medium">{emp.employeeId}</TableCell>
                  <TableCell>{emp.name}</TableCell>
                  <TableCell>{emp.designation}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-safend-red">View Slips</Button></TableCell>
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
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <div>
          <h3 className="text-lg font-bold">{employee.name}</h3>
          <p className="text-sm text-muted-foreground">{employee.employeeId} · {employee.designation} · {employee.department}</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated Salary Slips</CardTitle>
          <CardDescription>Salary slips are generated when payroll is processed. Once processed, slips appear here for download.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <IndianRupee className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No salary slips generated yet</p>
            <p className="text-sm mt-1">Slips will appear here after payroll is processed for this employee.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Tab 2: Post-wise Salary
// ===========================================================================

// NOTE: this tab is a near-duplicate of payroll-steps/PostWiseSalaryStep.tsx,
// which is the one actually routed (via PayrollSalaryModule). Kept in sync so a
// revival does not reintroduce the stale service-type list.

function PostWiseSalaryTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [rates, setRates] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [draftSalary, setDraftSalary] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Per-day divisor basis: fixed 26-day month vs actual calendar days.
  // Display-only preference — monthly_salary stays the value of record.
  const [dayBasis, setDayBasis] = useState<DayBasis>('calendar');
  const { toast } = useToast();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(DAY_BASIS_STORAGE_KEY) : null;
    if (stored === 'fixed26' || stored === 'calendar') setDayBasis(stored);
  }, []);

  const handleDayBasisChange = (basis: DayBasis) => {
    setDayBasis(basis);
    if (typeof window !== 'undefined') window.localStorage.setItem(DAY_BASIS_STORAGE_KEY, basis);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: postData, error: postErr } = await supabaseClient
        .from('operational_posts')
        .select('id, post_name, client_name, service_instances, status')
        .eq('status', 'active')
        .order('client_name', { ascending: true });
      if (postErr) throw postErr;

      const { data: rateData, error: rateErr } = await supabaseClient
        .from('post_salary_rates')
        .select('post_id, designation, monthly_salary');
      if (rateErr) throw rateErr;

      const ratesMap: Record<string, Record<string, number>> = {};
      (rateData || []).forEach((r: any) => {
        if (!ratesMap[r.post_id]) ratesMap[r.post_id] = {};
        ratesMap[r.post_id][r.designation] = Number(r.monthly_salary) || 0;
      });

      setPosts(postData || []);
      setRates(ratesMap);
    } catch (err) {
      console.error('Error fetching post salary data:', err);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  // Splits manpower into one designation per distinct role staffed (Driver,
  // Cook, Electrician, ...) instead of collapsing them into a single
  // "Manpower" row. See activePostDesignations for details.
  const getPostDesignations = (post: any): DesignationEntry[] =>
    activePostDesignations(post.service_instances);

  const handleSave = async (postId: string, designation: string) => {
    const parsed = Number(draftSalary);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast({ title: "Invalid", description: "Enter a valid salary amount", variant: "destructive" });
      return;
    }
    const key = `${postId}|${designation}`;
    setSavingKey(key);
    try {
      const { error } = await supabaseClient
        .from('post_salary_rates')
        .upsert({ post_id: postId, designation, monthly_salary: parsed, updated_at: new Date().toISOString() }, { onConflict: 'post_id,designation' });
      if (error) throw error;
      setRates((prev) => ({ ...prev, [postId]: { ...(prev[postId] || {}), [designation]: parsed } }));
      toast({ title: "Salary Set", description: `${designation}: ₹${parsed.toLocaleString('en-IN')}/month (₹${Math.round(parsed / days).toLocaleString('en-IN')}/day)` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save rate", variant: "destructive" });
    } finally {
      setSavingKey(null);
      setEditingCell(null);
      setDraftSalary("");
    }
  };

  const postsWithMissing = posts.filter((post) => {
    const designations = getPostDesignations(post);
    return designations.some((d) => !(rates[post.id]?.[d.label] > 0));
  });

  const calendarDays = daysInMonth(new Date().toISOString().slice(0, 7));
  const days = dayBasis === 'fixed26' ? CONVENTIONAL_BASIS_DAYS : calendarDays;

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <div className="flex items-center gap-2 shrink-0 rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => handleDayBasisChange('fixed26')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              dayBasis === 'fixed26' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Divide monthly salary by a fixed 26-day month"
          >
            <CalendarRange className="h-3.5 w-3.5" /> 26 Days
          </button>
          <button
            type="button"
            onClick={() => handleDayBasisChange('calendar')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              dayBasis === 'calendar' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Divide monthly salary by the actual days in this calendar month"
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendar Month
          </button>
        </div>
      </div>

      {postsWithMissing.length > 0 && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">{postsWithMissing.length} post{postsWithMissing.length > 1 ? 's have' : ' has'} missing salary rates</p>
            <p className="text-amber-700 dark:text-amber-300 mt-0.5">Operations cannot prepare rota or mark attendance for designations whose salary is not defined. Set the monthly salary for every designation at each post below.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No active operational posts found. Posts appear here after work orders are started.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const designations = getPostDesignations(post);
            if (designations.length === 0) return null;
            return (
              <Card key={post.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-safend-red/10 shrink-0"><Briefcase className="h-4 w-4 text-safend-red" /></div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{post.post_name}</CardTitle>
                      <CardDescription className="truncate">{post.client_name}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Designation</TableHead>
                        <TableHead className="text-right">Monthly Salary (₹)</TableHead>
                        <TableHead className="text-right">Per Day (₹) — {days} days</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {designations.map(({ key: desigKey, label: desig }) => {
                        const cellKey = `${post.id}|${desig}`;
                        const salary = rates[post.id]?.[desig] || 0;
                        const perDay = salary > 0 ? Math.round(salary / days) : 0;
                        const isDefined = salary > 0;
                        const isEditing = editingCell === cellKey;
                        return (
                          <TableRow key={desigKey} className={!isDefined ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {desig}
                                {!isDefined && <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-100 text-[10px]">Not Set</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <Input autoFocus type="number" value={draftSalary} onChange={(e) => setDraftSalary(e.target.value)} className="h-8 w-32 text-right ml-auto" onKeyDown={(e) => { if (e.key === 'Enter') handleSave(post.id, desig); if (e.key === 'Escape') { setEditingCell(null); setDraftSalary(""); } }} />
                              ) : (
                                <span className="font-semibold">{isDefined ? `₹${salary.toLocaleString('en-IN')}` : '—'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{perDay > 0 ? `₹${perDay.toLocaleString('en-IN')}` : '—'}</TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => handleSave(post.id, desig)} disabled={savingKey === cellKey}><Save className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => { setEditingCell(null); setDraftSalary(""); }}><X className="h-4 w-4" /></Button>
                                </div>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => { setEditingCell(cellKey); setDraftSalary(salary > 0 ? String(salary) : ""); }}>
                                  <Pencil className="h-4 w-4 mr-1" />{isDefined ? 'Edit' : 'Set Rate'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
