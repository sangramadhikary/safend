'use client';
import { useState, useEffect, useMemo } from "react";
import { EmployeeSalaryDetailUI } from "../index";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabaseClient } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { applyDeductionsInPriority } from "@/services/supabase/PayrollDeductionService";
import {
  IndianRupee, Play, Eye, Send, Calendar, Users,
  Briefcase, UserCheck, CheckCircle, Search, Info,
  AlertTriangle, Trash2, AlertCircle, ChevronUp, ChevronDown, Pencil, RotateCcw,
} from "lucide-react";

// Types
interface PayrollRun {
  id: string;
  fromDate: string;
  toDate: string;
  type: "postwise" | "designationwise" | "personwise";
  typeLabel: string;
  selectionLabel: string;
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  status: "GENERATED" | "FINALIZED" | "SENT_TO_ACCOUNTS" | "APPROVED" | "PAID";
  generatedAt: string;
  employees: PayrollEmployee[];
  originalEmployees?: PayrollEmployee[]; // snapshot at generation — used to revert all edits
  warnings: string[];
}

interface AttendanceDetail {
  date: string;
  status: string;
  postName?: string;
  shiftKey?: string;
  checkIn?: string;
  checkOut?: string;
}

interface PayrollEmployee {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  post?: string;
  attendedDays: number;
  totalDays: number;
  baseSalary: number;
  earnedSalary: number;
  epf: number;
  esic: number;
  pt: number;
  loanEmi: number;
  uniformCharges: number;
  messCharges: number;
  penalty: number;
  totalDeductions: number;
  netSalary: number;
  // Flags
  hasNoAttendance: boolean;
  hasNoSalaryRate: boolean;
  attendanceIncomplete: boolean;
  salaryHeld?: boolean;
  // Detail data for info popovers
  attendanceDetails: AttendanceDetail[];
  loanDetails: { type: string; amount: number; loanId: string }[];
  messDetails: { postName: string; mealCount: number; totalCharge: number }[];
  penaltyDetails: { offense: string; amount: number; date: string }[];
}

interface EmployeeOption {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  post?: string;
}

// Post option type
interface PostOption {
  id: string;
  name: string;
  client: string;
}

// Info button component for showing details in a popover
// Uses modal={false} and portal container to work inside Dialogs
function InfoPopover({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted hover:bg-muted-foreground/20 ml-1 align-middle"
          title="View details"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-60 overflow-auto text-xs z-200" side="top" align="center" sideOffset={5}>
        <p className="font-semibold text-sm mb-2">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ProcessPayrollStep({ filter }: { filter: string }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [payrollType, setPayrollType] = useState<"" | "postwise" | "designationwise" | "personwise">("");
  const [selectedPost, setSelectedPost] = useState("");
  const [selectedDesignation, setSelectedDesignation] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [visualiseRun, setVisualiseRun] = useState<PayrollRun | null>(null);
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [confirmRunDialog, setConfirmRunDialog] = useState(false);
  const [confirmSendDialog, setConfirmSendDialog] = useState<string | null>(null);
  const [payrollsExpanded, setPayrollsExpanded] = useState(true);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ earnedSalary?: number; messCharges?: number; penalty?: number; loanEmi?: number; uniformCharges?: number }>({});
  const [selectedRunEmps, setSelectedRunEmps] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<"month" | "range" | "tilldate">("month");
  const [selectedMonth, setSelectedMonth] = useState(""); // YYYY-MM format
  const { toast } = useToast();

  // Set default month to current month
  useEffect(() => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(monthStr);
    // Also set fromDate/toDate from the default month
    const year = now.getFullYear();
    const month = now.getMonth();
    setFromDate(`${year}-${String(month + 1).padStart(2, '0')}-01`);
    const lastDay = new Date(year, month + 1, 0).getDate();
    setToDate(`${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`);
  }, []);

  // Load persisted payroll runs from Supabase on mount
  useEffect(() => {
    (async () => {
      setLoadingRuns(true);
      try {
        const { data, error } = await supabaseClient
          .from('payroll_runs')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setPayrollRuns(data.map((row: any) => ({
            id: row.id,
            fromDate: row.from_date,
            toDate: row.to_date,
            type: row.payroll_type,
            typeLabel: row.type_label,
            selectionLabel: row.selection_label,
            totalEmployees: row.total_employees,
            totalGross: row.total_gross,
            totalDeductions: row.total_deductions,
            totalNet: row.total_net,
            status: row.status,
            generatedAt: row.created_at,
            employees: row.employee_details || [],
            originalEmployees: row.original_employees || row.employee_details || [],
            warnings: row.warnings || [],
          })));
        }
      } catch (err) {
        console.error('Error loading payroll runs:', err);
      } finally {
        setLoadingRuns(false);
      }
    })();
  }, []);

  // Fetch posts and designations on mount
  useEffect(() => {
    (async () => {
      const { data: postData } = await supabaseClient
        .from('operational_posts')
        .select('id, post_name, client_name')
        .eq('status', 'active')
        .order('post_name', { ascending: true });
      setPosts((postData || []).map((p: any) => ({
        id: p.id,
        name: p.post_name || 'Unnamed Post',
        client: p.client_name || '',
      })));

      const { data: empData } = await supabaseClient
        .from('employees')
        .select('designation')
        .ilike('status', 'active');
      const uniqueDesignations = [...new Set((empData || []).map((e: any) => e.designation).filter(Boolean))].sort();
      setDesignations(uniqueDesignations);
    })();
  }, []);

  // Fetch employees when personwise is selected
  useEffect(() => {
    if (payrollType === "personwise") {
      fetchEmployees();
    }
  }, [payrollType]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
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
      setLoadingEmployees(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return emp.name.toLowerCase().includes(term) || emp.employeeId.toLowerCase().includes(term) || emp.designation.toLowerCase().includes(term);
  });

  const toggleEmployee = (id: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const selectAllEmployees = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map((e) => e.id));
    }
  };

  // ─── Validation ────────────────────────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (dateMode === "tilldate") return errors; // tilldate is auto-calculated
    if (!fromDate || !toDate) return errors;
    if (fromDate > toDate) errors.push("From Date must be before To Date.");
    return errors;
  }, [fromDate, toDate, dateMode]);

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    if (month) {
      const [y, m] = month.split('-').map(Number);
      setFromDate(`${y}-${String(m).padStart(2, '0')}-01`);
      const lastDay = new Date(y, m, 0).getDate();
      setToDate(`${y}-${String(m).padStart(2, '0')}-${lastDay}`);
    }
  };

  const canRunPayroll = () => {
    if (!payrollType) return false;
    if (dateMode !== "tilldate" && (!fromDate || !toDate)) return false;
    if (dateMode !== "tilldate" && fromDate > toDate) return false;
    if (dateMode === "tilldate" && payrollType !== "personwise") return false;
    if (payrollType === "postwise" && !selectedPost) return false;
    if (payrollType === "designationwise" && !selectedDesignation) return false;
    if (payrollType === "personwise" && selectedEmployees.length === 0) return false;
    return true;
  };

  const getSelectionLabel = (): string => {
    if (payrollType === "postwise") {
      const post = posts.find((p) => p.id === selectedPost);
      return post ? post.name : "";
    }
    if (payrollType === "designationwise") return selectedDesignation;
    if (payrollType === "personwise") return `${selectedEmployees.length} employee(s)`;
    return "";
  };

  // ─── Core Payroll Generation ───────────────────────────────────────────────
  const handleRunPayroll = async () => {
    if (!canRunPayroll()) return;
    setIsRunning(true);

    try {
      const warnings: string[] = [];

      // For "tilldate" mode: determine fromDate/toDate per employee (last paid → today)
      let effectiveFromDate = fromDate;
      let effectiveToDate = toDate;

      if (dateMode === "tilldate") {
        // We'll set a broad range and calculate per-employee below
        // Default: from 90 days ago to today (max lookback)
        const today = new Date().toISOString().split('T')[0];
        effectiveToDate = today;
        // fromDate will be determined per-employee based on their last payroll
        effectiveFromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setFromDate(effectiveFromDate);
        setToDate(effectiveToDate);
      } else {
        effectiveFromDate = fromDate;
        effectiveToDate = toDate;
      }

      // 1. Fetch employees based on payroll type
      let employeeQuery = supabaseClient
        .from('employees')
        .select('id, employee_id, name, designation, department, salary, monthly_salary, join_date')
        .ilike('status', 'active');

      if (payrollType === "designationwise") {
        employeeQuery = employeeQuery.ilike('designation', selectedDesignation);
      } else if (payrollType === "personwise") {
        employeeQuery = employeeQuery.in('id', selectedEmployees);
      } else if (payrollType === "postwise") {
        // Find employees assigned to this post via rota_assignments within the date range
        const { data: rotaEmployees } = await supabaseClient
          .from('rota_assignments')
          .select('employee_id, employee_code')
          .eq('post_id', selectedPost)
          .gte('rota_date', effectiveFromDate)
          .lte('rota_date', effectiveToDate);
        const { data: shiftEmployees } = await supabaseClient
          .from('shift_attendance')
          .select('employee_id, employee_code')
          .eq('post_id', selectedPost)
          .gte('attendance_date', effectiveFromDate)
          .lte('attendance_date', effectiveToDate);

        const uuidSet = new Set<string>();
        const codeSet = new Set<string>();
        (rotaEmployees || []).forEach((r: any) => {
          if (r.employee_id) uuidSet.add(r.employee_id);
          if (r.employee_code) codeSet.add(r.employee_code);
        });
        (shiftEmployees || []).forEach((r: any) => {
          if (r.employee_id) uuidSet.add(r.employee_id);
          if (r.employee_code) codeSet.add(r.employee_code);
        });

        const uuids = [...uuidSet];
        const codes = [...codeSet];

        if (uuids.length > 0 || codes.length > 0) {
          const filters: string[] = [];
          if (uuids.length > 0) filters.push(`id.in.(${uuids.join(',')})`);
          if (codes.length > 0) filters.push(`employee_id.in.(${codes.join(',')})`);
          employeeQuery = employeeQuery.or(filters.join(','));
        } else {
          toast({ title: "No Employees Found", description: "No employees assigned to this post via rota or attendance in the selected period.", variant: "destructive" });
          setIsRunning(false);
          return;
        }
      }

      const { data: empData, error: empError } = await employeeQuery.order('name', { ascending: true });
      if (empError) throw empError;

      if (!empData || empData.length === 0) {
        toast({ title: "No Employees Found", description: "No active employees match the selected criteria.", variant: "destructive" });
        setIsRunning(false);
        return;
      }

      // 2. Fetch post_salary_rates for salary lookup, and salary_rate_basis from operational_posts
      const { data: salaryRates } = await supabaseClient
        .from('post_salary_rates')
        .select('post_id, designation, monthly_salary');

      // salary_rate_basis tells us whether each post uses ÷26 or ÷calendar-days
      const { data: postBasisData } = await supabaseClient
        .from('operational_posts')
        .select('id, salary_rate_basis');
      const postBasisMap: Record<string, string> = {};
      (postBasisData || []).forEach((p: any) => {
        if (p.salary_rate_basis) postBasisMap[p.id] = p.salary_rate_basis;
      });

      // 3. Fetch attendance from shift_attendance — filtered by post for postwise mode
      let shiftAttQuery = supabaseClient
        .from('shift_attendance')
        .select('employee_id, employee_code, status, attendance_date, post_id, post_name, shift_key')
        .gte('attendance_date', effectiveFromDate)
        .lte('attendance_date', effectiveToDate)
        .neq('status', 'pending');

      // FIX #3: For postwise payroll, filter attendance to the selected post only
      if (payrollType === "postwise") {
        shiftAttQuery = shiftAttQuery.eq('post_id', selectedPost);
      }

      const { data: shiftAttendanceData } = await shiftAttQuery;

      // Fallback: attendance_records (only for non-postwise, since this table has no post_id)
      const employeeIds = empData.map((e: any) => e.employee_id || e.id);
      let attendanceRecordsData: any[] = [];
      if (payrollType !== "postwise") {
        const { data } = await supabaseClient
          .from('attendance_records')
          .select('employee_id, status, attendance_date')
          .in('employee_id', employeeIds)
          .gte('attendance_date', effectiveFromDate)
          .lte('attendance_date', effectiveToDate);
        attendanceRecordsData = data || [];
      }

      // 4. Fetch rota assignments to know expected shifts (for attendance completeness check)
      let rotaQuery = supabaseClient
        .from('rota_assignments')
        .select('employee_id, employee_code, rota_date, post_id')
        .gte('rota_date', effectiveFromDate)
        .lte('rota_date', effectiveToDate);
      if (payrollType === "postwise") {
        rotaQuery = rotaQuery.eq('post_id', selectedPost);
      }
      const { data: rotaData } = await rotaQuery;

      // 5. Fetch mess meal records for the period (FIX #6: date-filtered)
      const { data: messData } = await supabaseClient
        .from('mess_meal_records')
        .select('employee_id, employee_name, post_name, meal_count, total_charge, per_meal_cost, record_date')
        .gte('record_date', effectiveFromDate)
        .lte('record_date', effectiveToDate);

      // 6. Fetch penalties with financial amount for the period
      const { data: penaltyData } = await supabaseClient
        .from('penalties')
        .select('staff_id, staff_name, offense, financial_penalty_amount, violation_date, status')
        .eq('status', 'Financial Penalty Applied')
        .gte('violation_date', effectiveFromDate)
        .lte('violation_date', effectiveToDate);

      // 6b. Fetch active employee advances (loans + joining deposits) for EMI recovery
      const { data: advancesData } = await supabaseClient
        .from('employee_advances')
        .select('id, employee_id, employee_code, advance_type, installment_amount, balance_outstanding')
        .eq('status', 'active');

      // 7. Calculate days in the month (for earned salary denominator)
      // Formula: Earned = (Monthly Salary / Basis Days) × Duties Worked
      // Each post carries its own salary_rate_basis ('fixed26' → ÷26, 'calendar' → ÷actual days).
      // The fallback for posts with no basis set is the calendar-month days of payroll start.
      const startDate = new Date(effectiveFromDate);
      const endDate = new Date(effectiveToDate);
      const totalCalendarDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const monthOfPayroll = startDate.getMonth(); // 0-indexed
      const yearOfPayroll = startDate.getFullYear();
      const calendarDaysInMonth = new Date(yearOfPayroll, monthOfPayroll + 1, 0).getDate();

      /** Returns the per-day divisor for a given post. */
      const getDivisorForPost = (postId: string): number => {
        const basis = postBasisMap[postId];
        if (basis === 'fixed26') return 26;
        return calendarDaysInMonth; // calendar (default)
      };

      // 8. Build payroll for each employee
      const payrollEmployees: PayrollEmployee[] = empData.map((emp: any) => {
        const empCode = emp.employee_id || emp.id;

        // --- Get all attendance records for this employee ---
        const shiftRecords = (shiftAttendanceData || []).filter(
          (a: any) => a.employee_id === empCode || a.employee_code === empCode || a.employee_id === emp.id
        );
        const attendRecords = (attendanceRecordsData || []).filter(
          (a: any) => a.employee_id === empCode || a.employee_id === emp.id
        );
        const records = shiftRecords.length > 0 ? shiftRecords : attendRecords;

        // Expected shifts from rota (for completeness check only)
        const expectedRota = (rotaData || []).filter(
          (r: any) => r.employee_id === empCode || r.employee_code === empCode || r.employee_id === emp.id
        );
        const expectedShifts = expectedRota.length;
        const hasNoAttendance = records.length === 0;

        // Only warn if employee had rota assignments but no attendance was marked
        if (hasNoAttendance && expectedShifts > 0) {
          warnings.push(`${emp.name}: Has ${expectedShifts} rota assignments but no attendance marked — earned set to ₹0.`);
        }

        // Check if attendance appears incomplete
        const attendanceIncomplete = !hasNoAttendance && expectedShifts > 0 && records.length < expectedShifts * 0.5;
        if (attendanceIncomplete) {
          warnings.push(`${emp.name}: Attendance appears incomplete (${records.length} records vs ${expectedShifts} expected shifts).`);
        }

        // Attendance details for info popover
        const attendanceDetails: AttendanceDetail[] = records.map((a: any) => ({
          date: a.attendance_date,
          status: a.status,
          postName: a.post_name || undefined,
          shiftKey: a.shift_key || undefined,
        }));

        // --- Earned Salary Calculation ---
        let earnedSalary = 0;
        let baseSalary = 0;
        let hasNoSalaryRate = false;
        let totalDutiesWorked = 0;

        if (payrollType === "postwise") {
          // ─── POST-WISE: single post, single rate ────────────────────────
          if (salaryRates) {
            const postRate = salaryRates.find(
              (r: any) => r.post_id === selectedPost && r.designation?.toLowerCase() === (emp.designation || '').toLowerCase()
            );
            if (postRate) baseSalary = postRate.monthly_salary || 0;
          }
          if (baseSalary === 0) baseSalary = emp.monthly_salary || emp.salary || 0;
          if (baseSalary === 0 && salaryRates) {
            const rate = salaryRates.find((r: any) => r.designation?.toLowerCase() === (emp.designation || '').toLowerCase());
            if (rate) baseSalary = rate.monthly_salary || 0;
          }

          hasNoSalaryRate = baseSalary === 0;

          // Count duties at this post
          let dutiesWorked = 0;
          records.forEach((a: any) => {
            const status = (a.status || '').toLowerCase();
            if (status === 'present') dutiesWorked += 1;
            else if (status === 'half_day') dutiesWorked += 0.5;
          });
          totalDutiesWorked = hasNoAttendance ? 0 : dutiesWorked;

          const dailyRate = baseSalary > 0 ? baseSalary / getDivisorForPost(selectedPost) : 0;
          earnedSalary = Math.round(dailyRate * totalDutiesWorked);

        } else {
          // ─── DESIGNATION-WISE / PERSON-WISE: aggregate across posts ─────
          // Group attendance by post_id, calculate earned per-post, sum them
          const attendanceByPost: Record<string, { duties: number; postName: string }> = {};

          records.forEach((a: any) => {
            const status = (a.status || '').toLowerCase();
            const postId = a.post_id || '__unknown__';
            const postName = a.post_name || 'Unknown Post';
            if (!attendanceByPost[postId]) attendanceByPost[postId] = { duties: 0, postName };
            if (status === 'present') attendanceByPost[postId].duties += 1;
            else if (status === 'half_day') attendanceByPost[postId].duties += 0.5;
          });

          // For each post, get that post's rate and calculate earned
          let totalEarned = 0;
          let highestRate = 0;
          const postEntries = Object.entries(attendanceByPost);

          if (postEntries.length > 0 && !hasNoAttendance) {
            postEntries.forEach(([postId, { duties }]) => {
              let postRate = 0;
              // Look up post-specific rate for this designation
              if (salaryRates && postId !== '__unknown__') {
                const rate = salaryRates.find(
                  (r: any) => r.post_id === postId && r.designation?.toLowerCase() === (emp.designation || '').toLowerCase()
                );
                if (rate) postRate = rate.monthly_salary || 0;
              }
              // Fallback to employee's own salary
              if (postRate === 0) postRate = emp.monthly_salary || emp.salary || 0;
              // Fallback to any designation match
              if (postRate === 0 && salaryRates) {
                const rate = salaryRates.find((r: any) => r.designation?.toLowerCase() === (emp.designation || '').toLowerCase());
                if (rate) postRate = rate.monthly_salary || 0;
              }

              if (postRate > highestRate) highestRate = postRate;
              const postDivisor = getDivisorForPost(postId);
              const dailyRate = postRate > 0 ? postRate / postDivisor : 0;
              totalEarned += dailyRate * duties;
              totalDutiesWorked += duties;
            });
          }

          earnedSalary = Math.round(totalEarned);
          // "Base" shows the highest post rate (or employee salary) for display purposes
          baseSalary = highestRate || emp.monthly_salary || emp.salary || 0;
          if (baseSalary === 0 && salaryRates) {
            const rate = salaryRates.find((r: any) => r.designation?.toLowerCase() === (emp.designation || '').toLowerCase());
            if (rate) baseSalary = rate.monthly_salary || 0;
          }
          hasNoSalaryRate = baseSalary === 0;

          // If no shift_attendance records but has fallback attendance_records (no post_id)
          if (shiftRecords.length === 0 && attendRecords.length > 0) {
            // Fallback: use flat calculation with employee salary
            let dutiesWorked = 0;
            attendRecords.forEach((a: any) => {
              const status = (a.status || '').toLowerCase();
              if (status === 'present') dutiesWorked += 1;
              else if (status === 'half_day') dutiesWorked += 0.5;
            });
            totalDutiesWorked = dutiesWorked;
            // Fallback path has no post_id, so we use the calendar-month divisor
            const dailyRate = baseSalary > 0 ? baseSalary / calendarDaysInMonth : 0;
            earnedSalary = Math.round(dailyRate * totalDutiesWorked);
          }
        }

        if (hasNoSalaryRate) {
          warnings.push(`${emp.name}: No salary rate defined.`);
        }

        // --- Statutory Deductions ---
        const epf = Math.round(earnedSalary * 0.12);
        const esic = earnedSalary <= 21000 ? Math.round(earnedSalary * 0.0075) : 0;
        const pt = 0; // No Professional Tax in Odisha

        // --- Loan & Joining Deposit EMIs (from employee_advances) ---
        const empAdvances = (advancesData || []).filter(
          (a: any) => (a.employee_id === emp.id || a.employee_code === empCode) && (a.balance_outstanding || 0) > 0
        );
        // Scheduled EMI is capped at the remaining balance so we never over-recover.
        const scheduledLoan = empAdvances
          .filter((a: any) => a.advance_type === 'LOAN')
          .reduce((s: number, a: any) => s + Math.min(a.installment_amount || 0, a.balance_outstanding || 0), 0);
        const scheduledDeposit = empAdvances
          .filter((a: any) => a.advance_type === 'JOINING_DEPOSIT')
          .reduce((s: number, a: any) => s + Math.min(a.installment_amount || 0, a.balance_outstanding || 0), 0);
        const loanDetails = empAdvances.map((a: any) => ({
          type: a.advance_type,
          amount: Math.min(a.installment_amount || 0, a.balance_outstanding || 0),
          loanId: a.id,
        }));

        // --- Mess Charges (date-filtered at query level) ---
        const empMessRecords = (messData || []).filter(
          (m: any) => m.employee_id === empCode || m.employee_id === emp.id
        );
        const scheduledMess = empMessRecords.reduce((sum: number, m: any) => sum + (m.total_charge || 0), 0);
        const messDetails = empMessRecords.map((m: any) => ({
          postName: m.post_name || 'N/A',
          mealCount: m.meal_count || 0,
          totalCharge: m.total_charge || 0,
        }));

        // --- Penalty ---
        const empPenalties = (penaltyData || []).filter(
          (p: any) => p.staff_id === emp.id || p.staff_id === empCode
        );
        const scheduledPenalty = empPenalties.reduce((sum: number, p: any) => sum + (p.financial_penalty_amount || 0), 0);
        const penaltyDetails = empPenalties.map((p: any) => ({
          offense: p.offense || 'N/A',
          amount: p.financial_penalty_amount || 0,
          date: p.violation_date || '',
        }));

        // --- Apply deductions in priority: Statutory → Penalty → Mess → Loan/Deposit ---
        // Recovers what the earned salary allows; shortfalls carry forward; net floors at ₹0.
        const ded = applyDeductionsInPriority(earnedSalary, [
          { type: 'STATUTORY', label: 'PF/ESI/PT', amount: epf + esic + pt, priority: 10 },
          { type: 'PENALTY', label: 'Penalty', amount: scheduledPenalty, priority: 20 },
          { type: 'MESS', label: 'Mess', amount: scheduledMess, priority: 30 },
          { type: 'LOAN', label: 'Loan', amount: scheduledLoan, priority: 40 },
          { type: 'JOINING_DEPOSIT', label: 'Joining Deposit', amount: scheduledDeposit, priority: 40 },
        ]);
        const recovered = (t: string) => ded.applied.find((a) => a.type === t)?.recovered ?? 0;
        // Displayed deduction lines reflect what was actually recovered this cycle.
        const penalty = recovered('PENALTY');
        const messCharges = recovered('MESS');
        const loanEmi = recovered('LOAN');
        const uniformCharges = recovered('JOINING_DEPOSIT'); // joining deposit shown in the uniform/fees column

        // --- Totals ---
        const totalDeductions = ded.totalRecovered;
        const netSalary = ded.netAfter;

        return {
          id: emp.id,
          employeeId: empCode,
          name: emp.name || 'Unknown',
          designation: emp.designation || 'N/A',
          department: emp.department || 'N/A',
          post: payrollType === "postwise" ? getSelectionLabel() : undefined,
          attendedDays: totalDutiesWorked,
          totalDays: payrollType === "postwise" ? getDivisorForPost(selectedPost) : calendarDaysInMonth,
          baseSalary,
          earnedSalary,
          epf,
          esic,
          pt,
          loanEmi,
          uniformCharges,
          messCharges,
          penalty,
          totalDeductions,
          netSalary,
          hasNoAttendance,
          hasNoSalaryRate,
          attendanceIncomplete,
          attendanceDetails,
          loanDetails,
          messDetails,
          penaltyDetails,
        };
      });

      const totalGross = payrollEmployees.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = payrollEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = payrollEmployees.reduce((s, e) => s + e.netSalary, 0);

      const newRun: PayrollRun = {
        id: `RUN-${Date.now()}`,
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        type: payrollType as "postwise" | "designationwise" | "personwise",
        typeLabel: dateMode === "tilldate" ? "Full & Final" : payrollType === "postwise" ? "Post-wise" : payrollType === "designationwise" ? "Designation-wise" : "Person-wise",
        selectionLabel: getSelectionLabel(),
        totalEmployees: payrollEmployees.length,
        totalGross,
        totalDeductions,
        totalNet,
        status: "GENERATED",
        generatedAt: new Date().toISOString(),
        employees: payrollEmployees,
        originalEmployees: JSON.parse(JSON.stringify(payrollEmployees)), // deep copy snapshot
        warnings,
      };

      setPayrollRuns([newRun, ...payrollRuns]);

      // Persist to Supabase
      await supabaseClient.from('payroll_runs').insert({
        id: newRun.id,
        from_date: newRun.fromDate,
        to_date: newRun.toDate,
        payroll_type: newRun.type,
        type_label: newRun.typeLabel,
        selection_label: newRun.selectionLabel,
        total_employees: newRun.totalEmployees,
        total_gross: newRun.totalGross,
        total_deductions: newRun.totalDeductions,
        total_net: newRun.totalNet,
        status: newRun.status,
        employee_details: newRun.employees,
        original_employees: newRun.originalEmployees,
        warnings: newRun.warnings,
      });

      const warningCount = payrollEmployees.filter(e => e.hasNoSalaryRate || (e.hasNoAttendance && e.attendanceIncomplete)).length;
      if (warningCount > 0) {
        toast({
          title: "Payroll Generated with Warnings",
          description: `${payrollEmployees.length} employees processed. ${warningCount} have issues — review in Visualise.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Payroll Generated", description: `Payroll for ${payrollEmployees.length} employees generated successfully.` });
      }
    } catch (err: any) {
      console.error('Error generating payroll:', err);
      toast({ title: "Payroll Generation Failed", description: err?.message || "An error occurred while generating payroll.", variant: "destructive" });
    } finally {
      setIsRunning(false);
      setConfirmRunDialog(false);
    }
  };

  const handleSendToAccounts = async (runId: string) => {
    setPayrollRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, status: "SENT_TO_ACCOUNTS" } : r))
    );
    // Persist status change
    await supabaseClient.from('payroll_runs').update({ status: 'SENT_TO_ACCOUNTS' }).eq('id', runId);
    toast({ title: "Sent to Accounts", description: "Payroll has been sent to Accounts for payment approval." });
    setConfirmSendDialog(null);
  };

  const handleDeleteRun = async (runId: string) => {
    setPayrollRuns((prev) => prev.filter((r) => r.id !== runId));
    // Delete from DB — also remove any held_salaries linked to this run
    await supabaseClient.from('held_salaries').delete().eq('payroll_run_id', runId);
    await supabaseClient.from('payroll_runs').delete().eq('id', runId);
    toast({ title: "Deleted", description: "Payroll run and associated held salaries removed." });
  };

  const handleRevertToDraft = async (runId: string) => {
    const run = payrollRuns.find(r => r.id === runId);
    if (!run) return;

    // Restore original employees (reverses all edits: EPF/ESIC removal, holds, manual changes)
    const restored = run.originalEmployees || run.employees;
    const totalGross = restored.reduce((s, e) => s + e.earnedSalary, 0);
    const totalDeductions = restored.reduce((s, e) => s + e.totalDeductions, 0);
    const totalNet = restored.reduce((s, e) => s + e.netSalary, 0);

    setPayrollRuns((prev) =>
      prev.map((r) => r.id === runId ? {
        ...r,
        status: "GENERATED" as const,
        employees: restored,
        totalEmployees: restored.length,
        totalGross,
        totalDeductions,
        totalNet,
      } : r)
    );

    // Persist: revert status and restore original employee_details
    await supabaseClient.from('payroll_runs').update({
      status: 'GENERATED',
      employee_details: restored,
      total_employees: restored.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
    }).eq('id', runId);

    // Remove any held_salaries records that were created from this payroll run
    await supabaseClient.from('held_salaries').delete().eq('payroll_run_id', runId);

    toast({ title: "Reverted to Draft", description: "All finalization edits reversed. Payroll is back to its original generated state." });
  };

  const handleFinalizeRun = async (runId: string) => {
    setPayrollRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, status: "FINALIZED" as const } : r))
    );
    await supabaseClient.from('payroll_runs').update({ status: 'FINALIZED' }).eq('id', runId);
    toast({ title: "Payroll Finalized", description: "Payroll is now locked and ready to send to Accounts." });
    setVisualiseRun(null);
  };

  const handleBulkRemoveEpfEsic = async (runId: string) => {
    setPayrollRuns((prev) => prev.map((run) => {
      if (run.id !== runId) return run;
      const updatedEmployees = run.employees.map((emp) => {
        if (!selectedRunEmps.includes(emp.id)) return emp;
        const newTotalDeductions = emp.totalDeductions - emp.epf - emp.esic;
        const newNet = emp.earnedSalary - newTotalDeductions;
        return { ...emp, epf: 0, esic: 0, totalDeductions: newTotalDeductions, netSalary: Math.max(0, newNet) };
      });
      const totalGross = updatedEmployees.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = updatedEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = updatedEmployees.reduce((s, e) => s + e.netSalary, 0);
      return { ...run, employees: updatedEmployees, totalGross, totalDeductions, totalNet };
    }));
    // Update visualiseRun in-place if open
    setVisualiseRun((prev) => {
      if (!prev || prev.id !== runId) return prev;
      const updatedEmployees = prev.employees.map((emp) => {
        if (!selectedRunEmps.includes(emp.id)) return emp;
        const newTotalDeductions = emp.totalDeductions - emp.epf - emp.esic;
        const newNet = emp.earnedSalary - newTotalDeductions;
        return { ...emp, epf: 0, esic: 0, totalDeductions: newTotalDeductions, netSalary: Math.max(0, newNet) };
      });
      const totalGross = updatedEmployees.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = updatedEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = updatedEmployees.reduce((s, e) => s + e.netSalary, 0);
      return { ...prev, employees: updatedEmployees, totalGross, totalDeductions, totalNet };
    });
    // Persist
    const run = payrollRuns.find(r => r.id === runId);
    if (run) {
      const updatedEmployees = run.employees.map((emp) => {
        if (!selectedRunEmps.includes(emp.id)) return emp;
        const newTotalDeductions = emp.totalDeductions - emp.epf - emp.esic;
        const newNet = emp.earnedSalary - newTotalDeductions;
        return { ...emp, epf: 0, esic: 0, totalDeductions: newTotalDeductions, netSalary: Math.max(0, newNet) };
      });
      const totalDeductions = updatedEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = updatedEmployees.reduce((s, e) => s + e.netSalary, 0);
      await supabaseClient.from('payroll_runs').update({ employee_details: updatedEmployees, total_deductions: totalDeductions, total_net: totalNet }).eq('id', runId);
    }
    toast({ title: "EPF/ESIC Removed", description: `Removed EPF & ESIC deductions for ${selectedRunEmps.length} employee(s).` });
    setSelectedRunEmps([]);
  };

  const handleBulkHoldSalary = async (runId: string) => {
    const holdEmpIds = [...selectedRunEmps];
    // Mark selected employees as held — they won't be included when sending to accounts
    setPayrollRuns((prev) => prev.map((run) => {
      if (run.id !== runId) return run;
      const updatedEmployees = run.employees.map((emp) => {
        if (!holdEmpIds.includes(emp.id)) return emp;
        return { ...emp, salaryHeld: true };
      });
      // Recalculate totals excluding held employees
      const activeEmps = updatedEmployees.filter((e: any) => !e.salaryHeld);
      const totalGross = activeEmps.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = activeEmps.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = activeEmps.reduce((s, e) => s + e.netSalary, 0);
      return { ...run, employees: updatedEmployees, totalGross, totalDeductions, totalNet, totalEmployees: activeEmps.length };
    }));
    // Update visualiseRun
    setVisualiseRun((prev) => {
      if (!prev || prev.id !== runId) return prev;
      const updatedEmployees = prev.employees.map((emp) => {
        if (!holdEmpIds.includes(emp.id)) return emp;
        return { ...emp, salaryHeld: true };
      });
      const activeEmps = updatedEmployees.filter((e: any) => !e.salaryHeld);
      const totalGross = activeEmps.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = activeEmps.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = activeEmps.reduce((s, e) => s + e.netSalary, 0);
      return { ...prev, employees: updatedEmployees, totalGross, totalDeductions, totalNet, totalEmployees: activeEmps.length };
    });
    // Persist to payroll_runs
    const run = payrollRuns.find(r => r.id === runId);
    if (run) {
      const updatedEmployees = run.employees.map((emp) => {
        if (!holdEmpIds.includes(emp.id)) return emp;
        return { ...emp, salaryHeld: true };
      });
      const activeEmps = updatedEmployees.filter((e: any) => !e.salaryHeld);
      const totalNet = activeEmps.reduce((s, e) => s + e.netSalary, 0);
      await supabaseClient.from('payroll_runs').update({ employee_details: updatedEmployees, total_net: totalNet, total_employees: activeEmps.length }).eq('id', runId);

      // Insert into held_salaries table so they appear in the Held Salaries tab
      const heldRows = updatedEmployees
        .filter((e: any) => holdEmpIds.includes(e.id))
        .map((emp: any) => ({
          employee_id: emp.id,
          employee_name: emp.name,
          employee_code: emp.employeeId,
          amount: emp.netSalary,
          payroll_run_id: runId,
          period: `${run.fromDate} to ${run.toDate}`,
          designation: emp.designation,
          reason: '',
          held_by: 'HR',
          held_on: new Date().toISOString(),
          resolved: false,
        }));
      if (heldRows.length > 0) {
        await supabaseClient.from('held_salaries').insert(heldRows);
      }
    }
    toast({ title: "Salary Held", description: `${holdEmpIds.length} employee(s) salary marked as held. They will not be sent to Accounts.` });
    setSelectedRunEmps([]);
  };

  const handleSaveEmployeeEdit = (runId: string, empId: string) => {
    if (!editValues) return;
    setPayrollRuns((prev) => prev.map((run) => {
      if (run.id !== runId) return run;
      const updatedEmployees = run.employees.map((emp) => {
        if (emp.id !== empId) return emp;
        const newEarned = editValues.earnedSalary ?? emp.earnedSalary;
        const newMess = editValues.messCharges ?? emp.messCharges;
        const newPenalty = editValues.penalty ?? emp.penalty;
        const newLoan = editValues.loanEmi ?? emp.loanEmi;
        const newUniform = editValues.uniformCharges ?? emp.uniformCharges;
        const epf = Math.round(newEarned * 0.12);
        const esic = newEarned <= 21000 ? Math.round(newEarned * 0.0075) : 0;
        const totalDeductions = epf + esic + 0 + newLoan + newUniform + newMess + newPenalty;
        const netSalary = Math.max(0, newEarned - totalDeductions);
        return { ...emp, earnedSalary: newEarned, messCharges: newMess, penalty: newPenalty, loanEmi: newLoan, uniformCharges: newUniform, epf, esic, totalDeductions, netSalary };
      });
      const totalGross = updatedEmployees.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = updatedEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = updatedEmployees.reduce((s, e) => s + e.netSalary, 0);
      return { ...run, employees: updatedEmployees, totalGross, totalDeductions, totalNet };
    }));
    // Also update the visualiseRun in the dialog
    setVisualiseRun((prev) => {
      if (!prev || prev.id !== runId) return prev;
      const updatedEmployees = prev.employees.map((emp) => {
        if (emp.id !== empId) return emp;
        const newEarned = editValues.earnedSalary ?? emp.earnedSalary;
        const newMess = editValues.messCharges ?? emp.messCharges;
        const newPenalty = editValues.penalty ?? emp.penalty;
        const newLoan = editValues.loanEmi ?? emp.loanEmi;
        const newUniform = editValues.uniformCharges ?? emp.uniformCharges;
        const epf = Math.round(newEarned * 0.12);
        const esic = newEarned <= 21000 ? Math.round(newEarned * 0.0075) : 0;
        const totalDeductions = epf + esic + 0 + newLoan + newUniform + newMess + newPenalty;
        const netSalary = Math.max(0, newEarned - totalDeductions);
        return { ...emp, earnedSalary: newEarned, messCharges: newMess, penalty: newPenalty, loanEmi: newLoan, uniformCharges: newUniform, epf, esic, totalDeductions, netSalary };
      });
      const totalGross = updatedEmployees.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = updatedEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = updatedEmployees.reduce((s, e) => s + e.netSalary, 0);
      return { ...prev, employees: updatedEmployees, totalGross, totalDeductions, totalNet };
    });
    setEditingEmpId(null);
    setEditValues({});
    // Persist to DB
    const run = payrollRuns.find(r => r.id === runId);
    if (run) {
      const updatedEmployees = run.employees.map((emp) => {
        if (emp.id !== empId) return emp;
        const newEarned = editValues.earnedSalary ?? emp.earnedSalary;
        const newMess = editValues.messCharges ?? emp.messCharges;
        const newPenalty = editValues.penalty ?? emp.penalty;
        const newLoan = editValues.loanEmi ?? emp.loanEmi;
        const newUniform = editValues.uniformCharges ?? emp.uniformCharges;
        const epf = Math.round(newEarned * 0.12);
        const esic = newEarned <= 21000 ? Math.round(newEarned * 0.0075) : 0;
        const totalDeductions = epf + esic + 0 + newLoan + newUniform + newMess + newPenalty;
        const netSalary = Math.max(0, newEarned - totalDeductions);
        return { ...emp, earnedSalary: newEarned, messCharges: newMess, penalty: newPenalty, loanEmi: newLoan, uniformCharges: newUniform, epf, esic, totalDeductions, netSalary };
      });
      const totalGross = updatedEmployees.reduce((s, e) => s + e.earnedSalary, 0);
      const totalDeductions = updatedEmployees.reduce((s, e) => s + e.totalDeductions, 0);
      const totalNet = updatedEmployees.reduce((s, e) => s + e.netSalary, 0);
      supabaseClient.from('payroll_runs').update({ employee_details: updatedEmployees, total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet }).eq('id', runId);
    }
    toast({ title: "Saved", description: "Employee payroll updated." });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { className: string; label: string }> = {
      GENERATED: { className: "bg-gray-100 text-gray-800 border-gray-200", label: "Draft" },
      FINALIZED: { className: "bg-blue-100 text-blue-800 border-blue-200", label: "Finalized" },
      SENT_TO_ACCOUNTS: { className: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Sent to Accounts" },
      APPROVED: { className: "bg-green-100 text-green-800 border-green-200", label: "Approved" },
      PAID: { className: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Paid" },
    };
    const s = map[status];
    if (s) return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Payroll Generation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Payroll</CardTitle>
          <CardDescription>
            Select date range & type to generate payroll. Once generated, review and send to Accounts for payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Payroll Type (moved first so Till Date option can react to it) */}
          <div>
            <label className="text-sm font-medium mb-1 block">Payroll Type</label>
            <Select value={payrollType} onValueChange={(v) => { setPayrollType(v as any); setSelectedPost(""); setSelectedDesignation(""); setSelectedEmployees([]); if (v !== "personwise" && dateMode === "tilldate") setDateMode("month"); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select payroll generation type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postwise">
                  <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Post-wise</span>
                </SelectItem>
                <SelectItem value="designationwise">
                  <span className="flex items-center gap-2"><UserCheck className="h-4 w-4" /> Designation-wise</span>
                </SelectItem>
                <SelectItem value="personwise">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Employee-wise</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period Selection Mode */}
          <div>
            <label className="text-sm font-medium mb-2 block">Period</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={dateMode === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => { setDateMode("month"); if (selectedMonth) handleMonthChange(selectedMonth); }}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" /> Month
              </Button>
              <Button
                type="button"
                variant={dateMode === "range" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateMode("range")}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" /> Date Range
              </Button>
              {payrollType === "personwise" && (
                <Button
                  type="button"
                  variant={dateMode === "tilldate" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateMode("tilldate")}
                  className={dateMode === "tilldate" ? "bg-amber-600 hover:bg-amber-700" : ""}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" /> Till Date (Full & Final)
                </Button>
              )}
            </div>
          </div>

          {/* Month selector */}
          {dateMode === "month" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> Select Month
                </label>
                <Input type="month" value={selectedMonth} onChange={(e) => handleMonthChange(e.target.value)} />
              </div>
              <div className="flex items-end">
                <p className="text-sm text-muted-foreground">
                  Period: {fromDate && new Date(fromDate).toLocaleDateString('en-IN')} — {toDate && new Date(toDate).toLocaleDateString('en-IN')}
                </p>
              </div>
            </div>
          )}

          {/* Date range inputs */}
          {dateMode === "range" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> From Date
                </label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> To Date
                </label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          )}

          {/* Till Date info */}
          {dateMode === "tilldate" && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Full & Final Settlement</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Calculates salary from the last paid date to today for each selected employee. 
                This is used for final settlement when an employee is leaving or terminated.
              </p>
            </div>
          )}

          {/* Validation warnings */}
          {validationErrors.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-200 space-y-0.5">
                {validationErrors.map((err, i) => <p key={i}>{err}</p>)}
              </div>
            </div>
          )}

          {/* Conditional: Post selection */}
          {payrollType === "postwise" && (
            <div>
              <label className="text-sm font-medium mb-1 block">Select Post</label>
              <Select value={selectedPost} onValueChange={setSelectedPost}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose operational post" />
                </SelectTrigger>
                <SelectContent>
                  {posts.map((post) => (
                    <SelectItem key={post.id} value={post.id}>
                      {post.name} — {post.client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Conditional: Designation selection */}
          {payrollType === "designationwise" && (
            <div>
              <label className="text-sm font-medium mb-1 block">Select Designation</label>
              <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose designation" />
                </SelectTrigger>
                <SelectContent>
                  {designations.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Conditional: Person-wise employee selection */}
          {payrollType === "personwise" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Select Employees</label>
                <Badge variant="outline" className="text-xs">
                  {selectedEmployees.length} selected
                </Badge>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {loadingEmployees ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="border rounded-lg">
                  <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30">
                    <Checkbox
                      checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                      onCheckedChange={selectAllEmployees}
                    />
                    <span className="text-sm font-medium">
                      Select All ({filteredEmployees.length})
                    </span>
                  </div>
                  <ScrollArea className="h-[200px]">
                    {filteredEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0"
                        onClick={() => toggleEmployee(emp.id)}
                      >
                        <Checkbox checked={selectedEmployees.includes(emp.id)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.employeeId} · {emp.designation}</p>
                        </div>
                      </div>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <div className="text-center py-6 text-sm text-muted-foreground">No employees found</div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* FIX #13: Run Payroll Button — opens confirmation */}
          <div className="pt-2">
            <Button
              onClick={() => setConfirmRunDialog(true)}
              disabled={!canRunPayroll() || isRunning}
              className="w-full md:w-auto flex items-center gap-2"
              size="lg"
            >
              <Play className="h-4 w-4" />
              {isRunning ? "Generating Payroll..." : "Run Payroll"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Payroll Runs */}
      {(payrollRuns.length > 0 || loadingRuns) && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setPayrollsExpanded(!payrollsExpanded)}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Generated Payrolls</CardTitle>
                <CardDescription>Review generated payrolls and send to Accounts for payment</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                {payrollsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {payrollsExpanded && (
          <CardContent>
            {loadingRuns ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Selection</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-right">Net Payable (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium text-sm">
                      {new Date(run.fromDate).toLocaleDateString('en-IN')} — {new Date(run.toDate).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{run.typeLabel}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{run.selectionLabel}</TableCell>
                    <TableCell className="text-center">
                      {run.totalEmployees}
                      {run.warnings.length > 0 && (
                        <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          {run.warnings.length} ⚠
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">₹{run.totalNet.toLocaleString('en-IN')}</TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {run.status === "GENERATED" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                              onClick={() => setVisualiseRun(run)}
                            >
                              <Eye className="h-4 w-4" /> Finalize
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteRun(run.id)}
                              title="Delete this run"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {run.status === "FINALIZED" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                              onClick={() => setVisualiseRun(run)}
                            >
                              <Eye className="h-4 w-4" /> View
                            </Button>
                            <Button
                              size="sm"
                              className="flex items-center gap-1"
                              onClick={() => setConfirmSendDialog(run.id)}
                            >
                              <Send className="h-4 w-4" /> Send to Accounts
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-orange-600 hover:bg-orange-50"
                              onClick={() => handleRevertToDraft(run.id)}
                              title="Revert to Draft"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {(run.status === "SENT_TO_ACCOUNTS" || run.status === "APPROVED" || run.status === "PAID") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => setVisualiseRun(run)}
                          >
                            <Eye className="h-4 w-4" /> View
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent>
          )}
        </Card>
      )}

      {/* FIX #13: Confirmation Dialog before running payroll */}
      <Dialog open={confirmRunDialog} onOpenChange={setConfirmRunDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Confirm Payroll Generation</DialogTitle>
            <DialogDescription>
              Please review the details before generating payroll.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Period</span>
                <span className="font-medium">{fromDate && new Date(fromDate).toLocaleDateString('en-IN')} — {toDate && new Date(toDate).toLocaleDateString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium capitalize">{payrollType || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Selection</span>
                <span className="font-medium">{getSelectionLabel() || '—'}</span>
              </div>
            </div>
            {validationErrors.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  {validationErrors.map((err, i) => <p key={i}>{err}</p>)}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRunDialog(false)}>Cancel</Button>
            <Button onClick={handleRunPayroll} disabled={isRunning} className="flex items-center gap-1">
              <Play className="h-4 w-4" /> {isRunning ? "Generating..." : "Generate Payroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FIX #14: Confirmation Dialog before sending to accounts */}
      <Dialog open={!!confirmSendDialog} onOpenChange={() => setConfirmSendDialog(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Send to Accounts?</DialogTitle>
            <DialogDescription>
              This will send the payroll to the Accounts team for payment approval. Please ensure you've reviewed the Visualise report first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSendDialog(null)}>Cancel</Button>
            <Button onClick={() => confirmSendDialog && handleSendToAccounts(confirmSendDialog)} className="flex items-center gap-1">
              <Send className="h-4 w-4" /> Confirm & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize / Visualise Dialog */}
      <Dialog open={!!visualiseRun} onOpenChange={() => { setVisualiseRun(null); setEditingEmpId(null); setEditValues({}); setSelectedRunEmps([]); }}>
        <DialogContent className="sm:max-w-[95vw] md:max-w-[1400px] max-h-[92vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" /> {visualiseRun?.status === "GENERATED" ? "Finalize Payroll" : "Payroll Details"}
            </DialogTitle>
            <DialogDescription>
              {visualiseRun?.typeLabel} — {visualiseRun?.selectionLabel} | {visualiseRun && new Date(visualiseRun.fromDate).toLocaleDateString('en-IN')} to {visualiseRun && new Date(visualiseRun.toDate).toLocaleDateString('en-IN')}
            </DialogDescription>
          </DialogHeader>

          {visualiseRun && (
            <div className="space-y-4">
              {/* Warnings Banner */}
              {visualiseRun.warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">{visualiseRun.warnings.length} Warning{visualiseRun.warnings.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 max-h-24 overflow-auto">
                    {visualiseRun.warnings.map((w, i) => <p key={i}>• {w}</p>)}
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                  <p className="text-xs text-muted-foreground">Total Employees</p>
                  <p className="text-xl font-bold">{visualiseRun.totalEmployees}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
                  <p className="text-xs text-muted-foreground">Gross Salary</p>
                  <p className="text-xl font-bold">₹{visualiseRun.totalGross.toLocaleString('en-IN')}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900">
                  <p className="text-xs text-muted-foreground">Total Deductions</p>
                  <p className="text-xl font-bold">₹{visualiseRun.totalDeductions.toLocaleString('en-IN')}</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
                  <p className="text-xs text-muted-foreground">Net Payable</p>
                  <p className="text-xl font-bold">₹{visualiseRun.totalNet.toLocaleString('en-IN')}</p>
                </div>
              </div>

              {/* Bulk action bar */}
              {selectedRunEmps.length > 0 && visualiseRun.status === "GENERATED" && (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{selectedRunEmps.length} selected</span>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleBulkRemoveEpfEsic(visualiseRun.id)}>
                    Remove EPF/ESIC
                  </Button>
                  <Button size="sm" variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => handleBulkHoldSalary(visualiseRun.id)}>
                    Hold Salary
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedRunEmps([])}>Clear</Button>
                </div>
              )}

              {/* Employee-wise Breakdown */}
              <ScrollArea className="h-[50vh] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {visualiseRun.status === "GENERATED" && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedRunEmps.length === visualiseRun.employees.length && visualiseRun.employees.length > 0}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedRunEmps(visualiseRun.employees.map(e => e.id));
                              else setSelectedRunEmps([]);
                            }}
                          />
                        </TableHead>
                      )}
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Attendance</TableHead>
                      <TableHead className="text-right">Base (₹)</TableHead>
                      <TableHead className="text-right">Earned (₹)</TableHead>
                      <TableHead className="text-right">EPF (₹)</TableHead>
                      <TableHead className="text-right">ESIC (₹)</TableHead>
                      <TableHead className="text-right">PT (₹)</TableHead>
                      <TableHead className="text-right">Loan (₹)</TableHead>
                      <TableHead className="text-right">Uniform (₹)</TableHead>
                      <TableHead className="text-right">Mess (₹)</TableHead>
                      <TableHead className="text-right">Penalty (₹)</TableHead>
                      <TableHead className="text-right font-semibold">Net (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visualiseRun.employees.map((emp) => (
                      <TableRow key={emp.id} className={cn(
                        emp.hasNoSalaryRate || emp.attendanceIncomplete ? "bg-amber-50/50 dark:bg-amber-950/10" : "",
                        selectedRunEmps.includes(emp.id) ? "bg-blue-50/50 dark:bg-blue-950/10" : "",
                        emp.salaryHeld ? "opacity-50 line-through" : ""
                      )}>
                        {visualiseRun.status === "GENERATED" && (
                          <TableCell>
                            <Checkbox
                              checked={selectedRunEmps.includes(emp.id)}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedRunEmps(prev => [...prev, emp.id]);
                                else setSelectedRunEmps(prev => prev.filter(id => id !== emp.id));
                              }}
                              disabled={!!emp.salaryHeld}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{emp.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">({emp.employeeId})</span>
                            {emp.salaryHeld && (
                              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">HELD</Badge>
                            )}
                            {(emp.hasNoSalaryRate || emp.attendanceIncomplete) && (
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                            )}
                            {/* Employee info popover */}
                            <InfoPopover title="Employee Details">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-500">
                                    {emp.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold">{emp.name}</p>
                                    <p className="text-muted-foreground">{emp.employeeId}</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-1 pt-1 border-t">
                                  <div><span className="text-muted-foreground">Designation:</span></div>
                                  <div><span className="font-medium">{emp.designation}</span></div>
                                  <div><span className="text-muted-foreground">Department:</span></div>
                                  <div><span className="font-medium">{emp.department}</span></div>
                                  {emp.post && <>
                                    <div><span className="text-muted-foreground">Post:</span></div>
                                    <div><span className="font-medium">{emp.post}</span></div>
                                  </>}
                                </div>
                              </div>
                            </InfoPopover>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <span className={emp.hasNoAttendance ? "text-amber-600 font-medium" : ""}>
                            {emp.attendedDays}/{emp.totalDays}
                          </span>
                          <InfoPopover title="Attendance Details">
                            {emp.hasNoAttendance ? (
                              <div className="p-2 bg-amber-50 rounded text-amber-800">
                                <p className="font-medium">⚠ No attendance records found</p>
                                <p className="mt-1">Earned salary is ₹0. Mark attendance in Operations → Attendance before running payroll.</p>
                              </div>
                            ) : emp.attendanceDetails.length > 0 ? (
                              <div className="space-y-1 max-h-40 overflow-auto">
                                {emp.attendanceDetails.map((a, i) => (
                                  <div key={i} className="flex justify-between border-b border-dashed pb-1">
                                    <span>{new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                    <Badge variant="outline" className={`text-[10px] ${a.status === 'present' ? 'text-green-700' : a.status === 'absent' ? 'text-red-700' : 'text-amber-700'}`}>
                                      {a.status}
                                    </Badge>
                                    {a.postName && <span className="text-muted-foreground truncate max-w-[100px]">{a.postName}</span>}
                                    {a.shiftKey && <span className="text-muted-foreground">{a.shiftKey}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">No records.</p>
                            )}
                          </InfoPopover>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {emp.hasNoSalaryRate ? <span className="text-amber-600">₹0 ⚠</span> : `₹${emp.baseSalary.toLocaleString('en-IN')}`}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {visualiseRun.status === "GENERATED" && editingEmpId === emp.id ? (
                            <Input type="number" className="h-7 w-20 text-right text-xs ml-auto" defaultValue={emp.earnedSalary} onChange={(e) => setEditValues(v => ({ ...v, earnedSalary: Number(e.target.value) || 0 }))} />
                          ) : `₹${emp.earnedSalary.toLocaleString('en-IN')}`}
                        </TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          ₹{emp.epf.toLocaleString('en-IN')}
                          <InfoPopover title="EPF Calculation">
                            <p>12% of Earned Salary</p>
                            <p className="mt-1">₹{emp.earnedSalary.toLocaleString('en-IN')} × 0.12 = ₹{emp.epf.toLocaleString('en-IN')}</p>
                          </InfoPopover>
                        </TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          ₹{emp.esic.toLocaleString('en-IN')}
                          <InfoPopover title="ESIC Calculation">
                            {emp.earnedSalary <= 21000 ? (
                              <>
                                <p>0.75% of Earned Salary (applicable as earned ≤ ₹21,000)</p>
                                <p className="mt-1">₹{emp.earnedSalary.toLocaleString('en-IN')} × 0.0075 = ₹{emp.esic.toLocaleString('en-IN')}</p>
                              </>
                            ) : <p>Not applicable — earned salary exceeds ₹21,000 threshold.</p>}
                          </InfoPopover>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">₹0</TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          {visualiseRun.status === "GENERATED" && editingEmpId === emp.id ? (
                            <Input type="number" className="h-7 w-20 text-right text-xs ml-auto" defaultValue={emp.loanEmi} onChange={(e) => setEditValues(v => ({ ...v, loanEmi: Number(e.target.value) || 0 }))} />
                          ) : emp.loanEmi > 0 ? `₹${emp.loanEmi.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          {visualiseRun.status === "GENERATED" && editingEmpId === emp.id ? (
                            <Input type="number" className="h-7 w-20 text-right text-xs ml-auto" defaultValue={emp.uniformCharges} onChange={(e) => setEditValues(v => ({ ...v, uniformCharges: Number(e.target.value) || 0 }))} />
                          ) : emp.uniformCharges > 0 ? `₹${emp.uniformCharges.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          {visualiseRun.status === "GENERATED" && editingEmpId === emp.id ? (
                            <Input type="number" className="h-7 w-20 text-right text-xs ml-auto" defaultValue={emp.messCharges} onChange={(e) => setEditValues(v => ({ ...v, messCharges: Number(e.target.value) || 0 }))} />
                          ) : emp.messCharges > 0 ? `₹${emp.messCharges.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          {visualiseRun.status === "GENERATED" && editingEmpId === emp.id ? (
                            <Input type="number" className="h-7 w-20 text-right text-xs ml-auto" defaultValue={emp.penalty} onChange={(e) => setEditValues(v => ({ ...v, penalty: Number(e.target.value) || 0 }))} />
                          ) : emp.penalty > 0 ? `₹${emp.penalty.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          ₹{emp.netSalary.toLocaleString('en-IN')}
                          {visualiseRun.status === "GENERATED" && (
                            editingEmpId === emp.id ? (
                              <Button variant="ghost" size="sm" className="ml-1 h-6 w-6 p-0 text-green-600" onClick={() => handleSaveEmployeeEdit(visualiseRun.id, emp.id)} title="Save">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="ml-1 h-6 w-6 p-0 text-muted-foreground hover:text-blue-600" onClick={() => { setEditingEmpId(emp.id); setEditValues({}); }} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Footer totals */}
              <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg border">
                <div className="text-sm text-muted-foreground">
                  Generated on {new Date(visualiseRun.generatedAt).toLocaleString('en-IN')}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Net Payable</p>
                  <p className="text-2xl font-bold">₹{visualiseRun.totalNet.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setVisualiseRun(null); setEditingEmpId(null); setEditValues({}); setSelectedRunEmps([]); }}>Close</Button>
            {visualiseRun?.status === "GENERATED" && (
              <Button onClick={() => handleFinalizeRun(visualiseRun.id)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-4 w-4" /> Finalize Payroll
              </Button>
            )}
            {visualiseRun?.status === "FINALIZED" && (
              <Button onClick={() => { setConfirmSendDialog(visualiseRun.id); setVisualiseRun(null); }} className="flex items-center gap-1">
                <Send className="h-4 w-4" /> Send to Accounts for Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
