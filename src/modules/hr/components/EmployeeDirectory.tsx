'use client';
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { EmployeeDirectoryProps } from "./index";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileSpreadsheet, Search, Upload, UserPlus,
  Users, Eye, Edit,
  Briefcase, UserCheck, UserX, Clock,
  Shield, MoreVertical, AlertTriangle, Ban,
  IdCard, UserMinus, GraduationCap, Receipt,
  LayoutGrid, List, TrendingUp, CalendarDays, UserRound,
  ChevronLeft, ChevronRight, SlidersHorizontal,
} from "lucide-react";
import { EmployeeForm } from "./employee/EmployeeForm";
import { EmployeeProfileModal } from "./employee/EmployeeProfileModal";
import { EmployeeImportDialog } from "./employee/EmployeeImportDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { BrandLoader } from "@/components/ui/brand-loader";
import { uploadProfilePicture } from "@/lib/r2-storage";
import {
  addHREmployee,
  updateHREmployee,
  generateEmployeeId,
  type HREmployee,
} from "@/services/supabase/HREmployeeService";
import { supabaseClient } from "@/integrations/supabase/client";
import { useEmployeeDirectory } from "../hooks/useEmployeeDirectory";
import type { AdvancedSearchFilters } from "../hooks/useEmployeeDirectory";

// Legacy interface for compatibility
export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
  joinDate: string;
  avatar: string;
  phoneNumber?: string;
  phone?: string;
  address?: string;
  photoUrl?: string;
  employeeId?: string;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "Active":
      return { color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800", icon: UserCheck, dot: "bg-emerald-500" };
    case "Inactive":
      return { color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800", icon: UserX, dot: "bg-red-500" };
    case "On Leave":
      return { color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800", icon: Clock, dot: "bg-amber-500" };
    case "Suspended":
      return { color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800", icon: Ban, dot: "bg-purple-500" };
    case "Terminated":
      return { color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800", icon: Shield, dot: "bg-rose-600" };
    case "Absconded":
      return { color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800", icon: AlertTriangle, dot: "bg-orange-500" };
    default:
      return { color: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-400 dark:border-gray-800", icon: Users, dot: "bg-gray-500" };
  }
};

// ── TEMPORARY: quick status-fix actions in the employee card 3-dot menu ──────
// Lets HR correct a wrongly-recorded status without going through the full
// deboarding flow. Remove this block (and its dropdown group below) once the
// status data has been cleaned up.
const QUICK_FIX_STATUSES = [
  {
    value: 'Suspended' as const,
    icon: Ban,
    tone: 'text-purple-600 focus:text-purple-600 focus:bg-purple-50 dark:focus:bg-purple-950/30',
  },
  {
    value: 'Terminated' as const,
    icon: Shield,
    tone: 'text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/30',
  },
  {
    value: 'Absconded' as const,
    icon: AlertTriangle,
    tone: 'text-orange-600 focus:text-orange-600 focus:bg-orange-50 dark:focus:bg-orange-950/30',
  },
  {
    value: 'Active' as const,
    icon: UserCheck,
    tone: 'text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 dark:focus:bg-emerald-950/30',
  },
];

const getDepartmentColor = (dept: string) => {
  const colors: Record<string, string> = {
    Operations: 'bg-blue-500', Admin: 'bg-purple-500', HR: 'bg-pink-500',
    Sales: 'bg-green-500', Finance: 'bg-yellow-500', IT: 'bg-cyan-500', Accounts: 'bg-orange-500',
  };
  return colors[dept] || 'bg-gray-500';
};

// ── Reimbursement form state ──────────────────────────────────────────────────
interface ReimbursementForm {
  amount: string;
  category: string;
  description: string;
  receiptUrl: string;
}

const REIMBURSEMENT_CATEGORIES = [
  'Travel & Conveyance',
  'Uniform / Equipment',
  'Medical / First Aid',
  'Training & Certification',
  'Communication',
  'Miscellaneous',
];

const PIE_COLORS = ['#D71920', '#1a1a1a', '#e94b50', '#4b4b4b', '#f28e91', '#808080'];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function MetricPieChart({
  title,
  data,
  activeKey,
  onSelect,
}: {
  title: string;
  data: { label: string; key: string; count: number }[];
  activeKey?: string | null;
  onSelect: (key: string) => void;
}) {
  const shown = data.filter((d) => d.count > 0);
  const total = shown.reduce((s, d) => s + d.count, 0);
  const chartConfig: ChartConfig = shown.reduce((acc, d, i) => {
    acc[d.label] = { label: d.label, color: PIE_COLORS[i % PIE_COLORS.length] };
    return acc;
  }, {} as ChartConfig);
  return (
    <Card className={`shadow-none transition-all ${activeKey ? 'ring-2 ring-safend-red' : 'hover:shadow-md'}`}>
      <CardContent className="p-4">
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
        {total === 0 ? (
          <div className="h-[130px] flex items-center justify-center text-xs text-muted-foreground">No data</div>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="w-full h-[110px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                <Pie data={shown} dataKey="count" nameKey="label" innerRadius={26} outerRadius={50} paddingAngle={2} strokeWidth={2} className="cursor-pointer"
                  onClick={(slice: any) => { if (slice?.payload?.key) onSelect(slice.payload.key); }}>
                  {shown.map((d, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      fillOpacity={activeKey && activeKey !== d.key ? 0.3 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
              {shown.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => onSelect(d.key)}
                  className={`flex items-center gap-1 text-[9px] rounded px-1 py-0.5 transition-colors hover:bg-muted ${activeKey === d.key ? 'bg-muted font-semibold' : ''}`}
                >
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground truncate">{d.label}</span>
                  <span className="ml-auto font-medium">{d.count}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function EmployeeDirectory({ filter }: EmployeeDirectoryProps) {
  // ─── Performance-optimized data fetching via BFF ──────────────────────────
  const {
    employees,
    stats: bffStats,
    isLoading,
    letterFilter,
    setLetterFilter,
    searchResults,
    search,
    advancedSearch,
    clearAdvancedSearch,
    refreshStats,
    refreshEmployees,
  } = useEmployeeDirectory();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(filter === "All Employees" ? "all" : filter);

  // Trigger BFF search when search term changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setIsAdvancedActive(false);
    search(value);
  }, [search]);

  const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<HREmployee | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileEmployee, setProfileEmployee] = useState<HREmployee | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [chartFilter, setChartFilter] = useState<{ type: string; value: string } | null>(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvancedSearchFilters>({});
  const [isAdvancedActive, setIsAdvancedActive] = useState(false);

  const advancedFilterCount = useMemo(() => Object.values(advFilters).reduce((count, value) => {
    if (Array.isArray(value)) return count + value.length;
    return count + (value ? 1 : 0);
  }, 0), [advFilters]);

  const toggleAdvancedStatus = useCallback((status: string) => {
    setAdvFilters((current) => {
      const statuses = current.statuses || [];
      return {
        ...current,
        statuses: statuses.includes(status)
          ? statuses.filter((item) => item !== status)
          : [...statuses, status],
      };
    });
  }, []);

  const setJoinDatePreset = useCallback((days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setAdvFilters((current) => ({
      ...current,
      joinFrom: from.toISOString().split('T')[0],
      joinTo: to.toISOString().split('T')[0],
    }));
  }, []);

  // Derive letterCounts from BFF stats
  const letterCounts = bffStats?.letterCounts || {};

  // ── 3-dot menu action dialogs ─────────────────────────────────────────────
  const [deboardTarget, setDeboardTarget] = useState<HREmployee | null>(null);
  const [deboardForm, setDeboardForm] = useState({
    reason: '' as 'resignation' | 'termination' | 'absconding' | 'contract_end' | 'retirement' | '',
    lastWorkingDate: '',
    noticePeriodServed: false,
    exitInterviewDone: false,
    uniformReturned: false,
    idCardReturned: false,
    equipmentReturned: false,
    accessRevoked: false,
    siteHandoverDone: false,
    pfFormSubmitted: false,
    esiFormSubmitted: false,
    gratuityApplicable: false,
    fnfInitiated: false,
    relievingLetterIssued: false,
    remarks: '',
  });
  const [deboardLoading, setDeboardLoading] = useState(false);
  const [reimbursementTarget, setReimbursementTarget] = useState<HREmployee | null>(null);
  const [reimbursementForm, setReimbursementForm] = useState<ReimbursementForm>({
    amount: '', category: REIMBURSEMENT_CATEGORIES[0], description: '', receiptUrl: '',
  });
  const [reimbursementLoading, setReimbursementLoading] = useState(false);
  // TEMPORARY: id of the employee whose status is being quick-fixed
  const [quickStatusBusyId, setQuickStatusBusyId] = useState<string | null>(null);

  const { toast } = useToast();
  const { currentBranch } = useBranch();

  const clearAdvancedFilters = useCallback(() => {
    setAdvFilters({});
    if (isAdvancedActive) clearAdvancedSearch();
    setIsAdvancedActive(false);
    setShowAdvancedSearch(false);
  }, [clearAdvancedSearch, isAdvancedActive]);

  const applyAdvancedFilters = useCallback(() => {
    const invalidRange = (from?: string, to?: string) => Boolean(from && to && Number(from) > Number(to));
    if (advFilters.joinFrom && advFilters.joinTo && advFilters.joinFrom > advFilters.joinTo) {
      toast({ title: "Invalid joining dates", description: "Joined From must be before Joined To.", variant: "destructive" });
      return;
    }
    if (invalidRange(advFilters.ageFrom, advFilters.ageTo) ||
        invalidRange(advFilters.heightFrom, advFilters.heightTo) ||
        invalidRange(advFilters.weightFrom, advFilters.weightTo) ||
        invalidRange(advFilters.salaryFrom, advFilters.salaryTo)) {
      toast({ title: "Invalid range", description: "Each minimum value must be less than or equal to its maximum value.", variant: "destructive" });
      return;
    }
    if (advancedFilterCount === 0) {
      toast({ title: "Select a filter", description: "Choose at least one advanced search option." });
      return;
    }

    setSearchTerm('');
    setStatusFilter('all');
    setChartFilter(null);
    advancedSearch(advFilters);
    setIsAdvancedActive(true);
    setShowAdvancedSearch(false);
  }, [advFilters, advancedFilterCount, advancedSearch, toast]);

  // Derive stats from BFF response (pre-computed server-side)
  const stats = useMemo(() => ({
    active: bffStats?.statusCounts?.['Active'] || 0,
    inactive: bffStats?.statusCounts?.['Inactive'] || 0,
    onLeave: bffStats?.statusCounts?.['On Leave'] || 0,
    terminated: bffStats?.statusCounts?.['Terminated'] || 0,
    total: bffStats?.total || 0,
    fullTime: 0,
    partTime: 0,
    contract: 0,
    departments: bffStats?.departmentCounts || {},
  }), [bffStats]);

  // Alphabet navigation helpers
  const availableLetters = useMemo(() => ALPHABET.filter(l => (letterCounts[l] || 0) > 0), [letterCounts]);
  
  const goToNextLetter = useCallback(() => {
    const currentIdx = availableLetters.indexOf(letterFilter);
    if (currentIdx < availableLetters.length - 1) {
      setLetterFilter(availableLetters[currentIdx + 1]);
    }
  }, [letterFilter, availableLetters, setLetterFilter]);

  const goToPrevLetter = useCallback(() => {
    const currentIdx = availableLetters.indexOf(letterFilter);
    if (currentIdx > 0) {
      setLetterFilter(availableLetters[currentIdx - 1]);
    }
  }, [letterFilter, availableLetters, setLetterFilter]);

  // Departments derived from BFF stats (must be above early returns to respect Rules of Hooks)
  const departments = useMemo(() => Object.keys(bffStats?.departmentCounts || {}), [bffStats]);

  // Use search results from BFF when searching, otherwise use letter-based employees
  const sourceEmployees = searchResults !== null ? searchResults : employees;

  const filteredEmployees = sourceEmployees.filter((emp) => {
    const matchesStatus = statusFilter === "all" || emp.status?.toLowerCase() === statusFilter.toLowerCase();

    // Chart click filter
    let matchesChart = true;
    if (chartFilter) {
      const getTenureYears = (jd: string) => Math.floor((Date.now() - new Date(jd).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      const getAge = (dob: string | undefined) => dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

      switch (chartFilter.type) {
        case 'tenure': {
          const years = emp.joinDate ? getTenureYears(emp.joinDate) : -1;
          if (chartFilter.value === '<1') matchesChart = years >= 0 && years < 1;
          else if (chartFilter.value === '1-3') matchesChart = years >= 1 && years <= 3;
          else if (chartFilter.value === '3-5') matchesChart = years >= 3 && years <= 5;
          else if (chartFilter.value === '5-10') matchesChart = years >= 5 && years <= 10;
          else if (chartFilter.value === '10+') matchesChart = years > 10;
          break;
        }
        case 'age': {
          const age = getAge(emp.dateOfBirth);
          if (!age) { matchesChart = false; break; }
          if (chartFilter.value === '18-25') matchesChart = age >= 18 && age <= 25;
          else if (chartFilter.value === '26-35') matchesChart = age >= 26 && age <= 35;
          else if (chartFilter.value === '36-45') matchesChart = age >= 36 && age <= 45;
          else if (chartFilter.value === '46-55') matchesChart = age >= 46 && age <= 55;
          else if (chartFilter.value === '55+') matchesChart = age > 55;
          break;
        }
        case 'height': {
          const h = emp.height || 0;
          if (chartFilter.value === '<155') matchesChart = h > 0 && h < 155;
          else if (chartFilter.value === '155-165') matchesChart = h >= 155 && h <= 165;
          else if (chartFilter.value === '165-175') matchesChart = h >= 165 && h <= 175;
          else if (chartFilter.value === '175+') matchesChart = h > 175;
          else if (chartFilter.value === 'unknown') matchesChart = !h;
          break;
        }
        case 'weight': {
          const w = emp.weight || 0;
          if (chartFilter.value === '<50') matchesChart = w > 0 && w < 50;
          else if (chartFilter.value === '50-60') matchesChart = w >= 50 && w <= 60;
          else if (chartFilter.value === '60-70') matchesChart = w >= 60 && w <= 70;
          else if (chartFilter.value === '70-80') matchesChart = w >= 70 && w <= 80;
          else if (chartFilter.value === '80+') matchesChart = w > 80;
          else if (chartFilter.value === 'unknown') matchesChart = !w;
          break;
        }
        case 'department': {
          const dept = emp.department || 'Unassigned';
          matchesChart = dept === chartFilter.value;
          break;
        }
      }
    }

    // Alphabetical filter is now applied server-side (letterFilter)

    return matchesStatus && matchesChart;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // ── Progressive rendering: show first 15 instantly, load rest after idle ──
  const INITIAL_BATCH = 15;
  const BATCH_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const progressiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset visible count when the employee list changes (new letter, new filter, etc.)
  useEffect(() => {
    setVisibleCount(INITIAL_BATCH);
    // After first paint with 15 cards, progressively reveal the rest
    if (filteredEmployees.length > INITIAL_BATCH) {
      progressiveTimerRef.current = setTimeout(() => {
        setVisibleCount(filteredEmployees.length);
      }, 100); // 100ms delay — imperceptible but lets the first 15 paint first
    }
    return () => {
      if (progressiveTimerRef.current) clearTimeout(progressiveTimerRef.current);
    };
  }, [filteredEmployees.length, letterFilter, statusFilter, chartFilter]);

  // The visible slice of employees for rendering
  const visibleEmployees = filteredEmployees.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEmployees.length;

  // Manual "Show More" for users who scroll fast before the timer fires
  const handleShowMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + BATCH_SIZE, filteredEmployees.length));
  }, [filteredEmployees.length]);

  const handleAddEmployee = () => { setSelectedEmployee(null); setIsEmployeeFormOpen(true); };
  const handleEditEmployee = (employee: HREmployee) => { setSelectedEmployee(employee); setIsEmployeeFormOpen(true); };
  const handleViewProfile = (employee: HREmployee) => { setProfileEmployee(employee); setShowProfileModal(true); };

  // ── Print ID Card ──────────────────────────────────────────────────────────
  const handlePrintIdCard = (employee: HREmployee) => {
    const win = window.open('', '_blank', 'width=400,height=280');
    if (!win) { toast({ title: "Pop-up blocked", description: "Allow pop-ups for this site to print ID cards.", variant: "destructive" }); return; }

    const photo = employee.photoUrl || employee.avatar || '';
    const joined = employee.joinDate ? new Date(employee.joinDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    win.document.write(`
<!DOCTYPE html><html><head><title>ID Card — ${employee.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#f0f0f0; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { width:340px; border-radius:16px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.18); background:#fff; }
  .header { background:linear-gradient(135deg,#D71920 0%,#a01015 100%); padding:18px 20px 14px; display:flex; align-items:center; gap:12px; }
  .logo-text { color:#fff; font-size:18px; font-weight:700; letter-spacing:0.5px; }
  .logo-sub  { color:rgba(255,255,255,0.75); font-size:10px; margin-top:1px; }
  .body { display:flex; gap:16px; padding:18px 20px; }
  .photo { width:76px; height:90px; border-radius:10px; object-fit:cover; border:3px solid #D71920; flex-shrink:0; background:#eee; }
  .photo-placeholder { width:76px; height:90px; border-radius:10px; border:3px solid #D71920; flex-shrink:0; background:#f5f5f5; display:flex; align-items:center; justify-content:center; font-size:26px; color:#D71920; font-weight:700; }
  .info { flex:1; }
  .name { font-size:15px; font-weight:700; color:#111; line-height:1.3; }
  .desig { font-size:11px; color:#D71920; font-weight:600; margin-top:3px; text-transform:uppercase; letter-spacing:0.4px; }
  .dept  { font-size:11px; color:#666; margin-top:1px; }
  .divider { border:none; border-top:1px solid #f0f0f0; margin:10px 0; }
  .row  { display:flex; justify-content:space-between; font-size:10px; margin-bottom:4px; }
  .lbl  { color:#999; }
  .val  { color:#222; font-weight:600; }
  .footer { background:#1a1a1a; color:rgba(255,255,255,0.5); font-size:9px; text-align:center; padding:8px; letter-spacing:0.3px; }
  @media print { body { background:#fff; } .card { box-shadow:none; } }
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <div class="logo-text">SAFEND</div>
      <div class="logo-sub">SECURE SOLUTIONS PVT. LTD.</div>
    </div>
  </div>
  <div class="body">
    ${photo
      ? `<img class="photo" src="${photo}" alt="${employee.name}" />`
      : `<div class="photo-placeholder">${(employee.name || 'E').charAt(0).toUpperCase()}</div>`
    }
    <div class="info">
      <div class="name">${employee.name || '—'}</div>
      <div class="desig">${employee.designation || '—'}</div>
      <div class="dept">${employee.department || '—'}</div>
      <hr class="divider"/>
      <div class="row"><span class="lbl">Employee ID</span><span class="val">${employee.employeeId || '—'}</span></div>
      <div class="row"><span class="lbl">Joined</span><span class="val">${joined}</span></div>
      ${employee.phone ? `<div class="row"><span class="lbl">Phone</span><span class="val">${employee.phone}</span></div>` : ''}
    </div>
  </div>
  <div class="footer">AUTHORISED PERSONNEL ONLY · SAFEND SECURE SOLUTIONS PVT. LTD.</div>
</div>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),800);}</script>
</body></html>`);
    win.document.close();
    toast({ title: "ID Card", description: `Printing ID card for ${employee.name}` });
  };

  // ── Deboard employee ───────────────────────────────────────────────────────

  // ── TEMPORARY: quick status fix ────────────────────────────────────────────
  // Writes the status directly (no deboarding checklist / notification).
  // Remove together with QUICK_FIX_STATUSES once statuses are cleaned up.
  const handleQuickStatusFix = async (employee: HREmployee, newStatus: HREmployee['status']) => {
    if (!employee.id) {
      toast({ title: "Cannot update", description: "This employee record has no database ID.", variant: "destructive" });
      return;
    }
    if (employee.status === newStatus) return;

    setQuickStatusBusyId(employee.id);
    try {
      const result = await updateHREmployee(employee.id, { status: newStatus });
      if (result.success) {
        refreshEmployees();
        refreshStats();
        toast({
          title: `Status updated — ${newStatus}`,
          description: `${employee.name} (${employee.employeeId || '—'}) changed from ${employee.status} to ${newStatus}.`,
        });
      } else {
        toast({ title: "Error", description: result.error || "Failed to update status", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update status", variant: "destructive" });
    } finally {
      setQuickStatusBusyId(null);
    }
  };

  // Reboard employee (re-activate)
  const handleReboard = async (employee: HREmployee) => {
    if (!employee.id) return;
    const result = await updateHREmployee(employee.id, { status: 'Active' });
    if (result.success) {
      // Refresh data from BFF to reflect the change
      refreshEmployees();
      toast({ title: "Employee Reboarded", description: `${employee.name} has been reactivated as Active.` });
    } else {
      toast({ title: "Error", description: result.error || "Failed to reboard", variant: "destructive" });
    }
  };

  const handleDeboard = async () => {
    if (!deboardTarget?.id || !deboardForm.reason) return;
    setDeboardLoading(true);
    try {
      const statusMap: Record<string, string> = {
        resignation: 'Terminated', termination: 'Terminated',
        absconding: 'Inactive', contract_end: 'Terminated', retirement: 'Terminated',
        client_complaint: 'Terminated', medical_unfit: 'Terminated',
        failed_verification: 'Terminated', site_closure: 'Terminated', death: 'Terminated',
      };
      const newStatus = statusMap[deboardForm.reason] || 'Terminated';
      const result = await updateHREmployee(deboardTarget.id, {
        status: newStatus as any,
      });
      if (result.success) {
        // Log deboard event
        try {
          await supabaseClient.from('notifications').insert({
            type: 'EMPLOYEE_DEBOARDED',
            title: `Employee Deboarded - ${deboardTarget.name}`,
            message: `${deboardTarget.name} (${deboardTarget.employeeId}) has been deboarded. Reason: ${deboardForm.reason}. Last working date: ${deboardForm.lastWorkingDate || 'N/A'}.`,
            target_role: 'hr',
            status: 'unread',
            entity_type: 'employee',
            entity_id: deboardTarget.id ?? deboardTarget.employeeId,
          });
        } catch { /* non-critical */ }
        // Refresh data from BFF to reflect the change
        refreshEmployees();
        toast({ title: "Employee Deboarded", description: `${deboardTarget.name} has been successfully deboarded.` });
      } else {
        toast({ title: "Error", description: result.error || "Failed to deboard", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Deboarding failed", variant: "destructive" });
    } finally {
      setDeboardLoading(false);
      setDeboardTarget(null);
      setDeboardForm({ reason: '', lastWorkingDate: '', noticePeriodServed: false, exitInterviewDone: false, uniformReturned: false, idCardReturned: false, equipmentReturned: false, accessRevoked: false, siteHandoverDone: false, pfFormSubmitted: false, esiFormSubmitted: false, gratuityApplicable: false, fnfInitiated: false, relievingLetterIssued: false, remarks: '' });
    }
  };

  // ── Complete Training ──────────────────────────────────────────────────────
  const handleCompleteTraining = async (employee: HREmployee) => {
    try {
      const { error } = await supabaseClient.from('notifications').insert({
        type: 'TRAINING_COMPLETION_REQUEST',
        title: `Training Completion — ${employee.name}`,
        message: `HR has marked training as complete for ${employee.name} (${employee.employeeId}), ${employee.designation}. Please verify and update training records.`,
        target_role: 'hr',
        status: 'unread',
        entity_type: 'employee',
        entity_id: employee.id ?? employee.employeeId,
      });
      if (error) throw error;
    } catch { /* non-critical — notification table may not exist yet */ }
    toast({
      title: "Training Marked Complete",
      description: `Training completion recorded for ${employee.name}. HR team has been notified.`,
    });
  };

  // ── Request Reimbursement ──────────────────────────────────────────────────
  const handleSubmitReimbursement = async () => {
    if (!reimbursementTarget) return;
    const amount = parseFloat(reimbursementForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid amount greater than 0.", variant: "destructive" });
      return;
    }
    if (!reimbursementForm.description.trim()) {
      toast({ title: "Description required", description: "Please describe what the reimbursement is for.", variant: "destructive" });
      return;
    }

    setReimbursementLoading(true);
    try {
      // Insert into payables table so Accounts sees it as a pending payable
      // Column set must match the payables schema exactly — there are no
      // `employee_name` or `type` columns, so the payee goes in vendor_name
      // (same shape ManagePayables uses for Reimbursements) and the origin
      // marker goes in notes. status must be lowercase to satisfy
      // payables_status_check and the `.eq('status', 'pending')` dashboards.
      const { error: payableErr } = await supabaseClient.from('payables').insert({
        category: 'Reimbursements',
        description: `Reimbursement — ${reimbursementForm.category}: ${reimbursementForm.description}`,
        vendor_name: reimbursementTarget.name,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        total_amount: amount,
        amount,
        status: 'pending',
        notes: `EMPLOYEE_REIMBURSEMENT | Employee: ${reimbursementTarget.name} (${reimbursementTarget.employeeId}) | Type: ${reimbursementForm.category}`,
        branch_id: reimbursementTarget.branchId ?? null,
      });
      if (payableErr) console.error('[Reimbursement] payables insert:', payableErr.message);

      // Notify Accounts
      await supabaseClient.from('notifications').insert({
        type: 'REIMBURSEMENT_REQUEST',
        title: `Reimbursement Request — ${reimbursementTarget.name}`,
        message: `HR has submitted a reimbursement request of ₹${amount.toLocaleString('en-IN')} for ${reimbursementTarget.name} (${reimbursementTarget.employeeId}). Category: ${reimbursementForm.category}. Reason: ${reimbursementForm.description}.`,
        target_role: 'accounts',
        status: 'unread',
        entity_type: 'employee',
        entity_id: reimbursementTarget.id ?? reimbursementTarget.employeeId,
      });

      toast({
        title: "Reimbursement Requested",
        description: `₹${amount.toLocaleString('en-IN')} reimbursement for ${reimbursementTarget.name} sent to Accounts.`,
      });
      setReimbursementTarget(null);
      setReimbursementForm({ amount: '', category: REIMBURSEMENT_CATEGORIES[0], description: '', receiptUrl: '' });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit reimbursement", variant: "destructive" });
    } finally {
      setReimbursementLoading(false);
    }
  };

  const handleSaveEmployee = async (employeeData: any) => {
    try {
      const empId = selectedEmployee?.employeeId || employeeData.employeeId || (await generateEmployeeId());
      let photoUrl = employeeData.passportPhotoUrl || selectedEmployee?.photoUrl || selectedEmployee?.avatar;
      if (employeeData.passportPhotoFile) {
        const photoResult = await uploadProfilePicture(employeeData.passportPhotoFile, empId);
        if (photoResult.success && photoResult.url) photoUrl = photoResult.url;
      }

      const mappedData: Partial<HREmployee> & Record<string, any> = {
        employeeId: empId,
        name: employeeData.name,
        email: employeeData.email,
        phone: employeeData.phone,
        alternatePhone: employeeData.alternatePhone,
        gender: employeeData.gender,
        dateOfBirth: employeeData.dateOfBirth,
        maritalStatus: employeeData.maritalStatus,
        bloodGroup: employeeData.bloodGroup,
        religion: employeeData.religion,
        nationality: employeeData.nationality,
        caste: employeeData.caste,
        height: employeeData.height ? parseFloat(employeeData.height) : undefined,
        weight: employeeData.weight ? parseFloat(employeeData.weight) : undefined,
        department: employeeData.department,
        designation: employeeData.designation,
        joinDate: employeeData.joinDate,
        employmentType: employeeData.employmentType,
        status: employeeData.status,
        address: employeeData.currentAddress || employeeData.address,
        city: employeeData.currentCity || employeeData.city,
        state: employeeData.currentState || employeeData.state,
        pincode: employeeData.currentPostalCode || employeeData.pincode,
        bankAccount: employeeData.accountNumber || employeeData.bankAccount,
        bankName: employeeData.bankName,
        ifscCode: employeeData.ifscCode,
        panNumber: employeeData.panNumber,
        aadharNumber: employeeData.aadharNumber,
        emergencyContactName: employeeData.emergencyContactName,
        emergencyContactPhone: employeeData.emergencyContactPhone,
        emergencyContactRelation: employeeData.emergencyContactRelation,
        photoUrl,
        avatar: photoUrl,
        workLocation: employeeData.workLocation,
        // Stamp the employee with the user's current branch code (employees.branch_id references branches.branch_id which is the code)
        branchId: selectedEmployee?.branchId || employeeData.branchId || currentBranch?.code || currentBranch?.id,
      };

      if (selectedEmployee?.id) {
        const result = await updateHREmployee(selectedEmployee.id, mappedData);
        if (result.success) toast({ title: "Employee Updated", description: `${employeeData.name} has been updated` });
        else toast({ title: "Error", description: result.error || "Failed to update employee", variant: "destructive" });
      } else {
        const result = await addHREmployee(mappedData as Omit<HREmployee, 'id'>);
        if (result.success) toast({ title: "Employee Added", description: `${employeeData.name} has been added successfully` });
        else toast({ title: "Error", description: result.error || "Failed to add employee", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save employee", variant: "destructive" });
    }
    setIsEmployeeFormOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <BrandLoader size="lg" message="Loading employees..." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ═══════ Status Filter Badges ═══════ */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter(statusFilter === 'Active' ? 'all' : 'Active')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${statusFilter === 'Active' ? 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-card border-border hover:bg-muted'}`}>
          <UserCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-lg font-bold text-emerald-700">{bffStats?.statusCounts?.['Active'] || 0}</span>
          <span className="text-xs text-muted-foreground">Active</span>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'Inactive' ? 'all' : 'Inactive')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${statusFilter === 'Inactive' ? 'ring-2 ring-gray-500 bg-gray-50 border-gray-300' : 'bg-card border-border hover:bg-muted'}`}>
          <UserX className="h-4 w-4 text-gray-500" />
          <span className="text-lg font-bold text-gray-700">{bffStats?.statusCounts?.['Inactive'] || 0}</span>
          <span className="text-xs text-muted-foreground">Resigned</span>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'Terminated' ? 'all' : 'Terminated')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${statusFilter === 'Terminated' ? 'ring-2 ring-red-500 bg-red-50 border-red-200' : 'bg-card border-border hover:bg-muted'}`}>
          <Shield className="h-4 w-4 text-red-500" />
          <span className="text-lg font-bold text-red-700">{bffStats?.statusCounts?.['Terminated'] || 0}</span>
          <span className="text-xs text-muted-foreground">Terminated</span>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'Absconded' ? 'all' : 'Absconded')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${statusFilter === 'Absconded' ? 'ring-2 ring-orange-500 bg-orange-50 border-orange-200' : 'bg-card border-border hover:bg-muted'}`}>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <span className="text-lg font-bold text-orange-700">{bffStats?.statusCounts?.['Absconded'] || 0}</span>
          <span className="text-xs text-muted-foreground">Absconded</span>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'Suspended' ? 'all' : 'Suspended')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${statusFilter === 'Suspended' ? 'ring-2 ring-purple-500 bg-purple-50 border-purple-200' : 'bg-card border-border hover:bg-muted'}`}>
          <Ban className="h-4 w-4 text-purple-500" />
          <span className="text-lg font-bold text-purple-700">{bffStats?.statusCounts?.['Suspended'] || 0}</span>
          <span className="text-xs text-muted-foreground">Suspended</span>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'On Leave' ? 'all' : 'On Leave')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${statusFilter === 'On Leave' ? 'ring-2 ring-yellow-500 bg-yellow-50 border-yellow-200' : 'bg-card border-border hover:bg-muted'}`}>
          <Clock className="h-4 w-4 text-yellow-500" />
          <span className="text-lg font-bold text-yellow-700">{bffStats?.statusCounts?.['On Leave'] || 0}</span>
          <span className="text-xs text-muted-foreground">On Leave</span>
        </button>
        {statusFilter !== 'all' && (
          <button onClick={() => setStatusFilter('all')} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted transition-all">
            ✕ Clear filter
          </button>
        )}
      </div>

      {/* ═══════ Charts ═══════ */}
      <div>
        {chartFilter && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <Badge variant="secondary" className="gap-1.5 text-xs">
              Filtered: {chartFilter.type} = {chartFilter.value}
              <button onClick={() => setChartFilter(null)} className="ml-1 hover:text-red-600 font-bold">x</button>
            </Badge>
            <span className="text-xs text-muted-foreground">{filteredEmployees.length} employees</span>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Tenure — bar chart using pre-computed BFF data */}
            {(() => {
              const tenureBuckets = bffStats?.tenureBuckets || {};
              const data = [
                { label: '<1 yr', key: '<1', count: tenureBuckets['<1'] || 0 },
                { label: '1-3 yr', key: '1-3', count: tenureBuckets['1-3'] || 0 },
                { label: '3-5 yr', key: '3-5', count: tenureBuckets['3-5'] || 0 },
                { label: '5-10 yr', key: '5-10', count: tenureBuckets['5-10'] || 0 },
                { label: '10+ yr', key: '10+', count: tenureBuckets['10+'] || 0 },
              ];
              const chartConfig: ChartConfig = { count: { label: 'Employees', color: '#1a1a1a' } };
              return (
                <Card className={`shadow-none cursor-pointer transition-all ${chartFilter?.type === 'tenure' ? 'ring-2 ring-black' : 'hover:shadow-md'}`}>
                  <CardContent className="p-4">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Tenure</h4>
                    <ChartContainer config={chartConfig} className="w-full h-[130px]">
                      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 4, top: 0, bottom: 0 }}
                        onClick={(e: any) => { if (e?.activeLabel) { const b = data.find(x => x.label === e.activeLabel); if (b) setChartFilter({ type: 'tenure', value: b.key }); } }}>
                        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={44} tick={{ fontSize: 10 }} />
                        <XAxis type="number" hide />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="#1a1a1a" radius={[0, 4, 4, 0]} barSize={14} className="cursor-pointer" />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Age — pie chart using pre-computed BFF data */}
            {(() => {
              const ageBuckets = bffStats?.ageBuckets || {};
              const ageData = [
                { label: '18-25', key: '18-25', count: ageBuckets['18-25'] || 0 },
                { label: '26-35', key: '26-35', count: ageBuckets['26-35'] || 0 },
                { label: '36-45', key: '36-45', count: ageBuckets['36-45'] || 0 },
                { label: '46-55', key: '46-55', count: ageBuckets['46-55'] || 0 },
                { label: '55+', key: '55+', count: ageBuckets['55+'] || 0 },
              ];
              const toggleFilter = (type: string, value: string) =>
                setChartFilter(prev => (prev?.type === type && prev?.value === value ? null : { type, value }));
              return (
                <MetricPieChart title="Age" data={ageData} activeKey={chartFilter?.type === 'age' ? chartFilter.value : null} onSelect={(k) => toggleFilter('age', k)} />
              );
            })()}

            {/* Department — pie chart using pre-computed BFF data */}
            {(() => {
              const deptCounts = bffStats?.departmentCounts || {};
              const deptData = Object.entries(deptCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([label, count]) => ({ label, key: label, count }));
              const toggleFilter = (type: string, value: string) =>
                setChartFilter(prev => (prev?.type === type && prev?.value === value ? null : { type, value }));
              return (
                <MetricPieChart title="Department" data={deptData} activeKey={chartFilter?.type === 'department' ? chartFilter.value : null} onSelect={(k) => toggleFilter('department', k)} />
              );
            })()}
          </div>
        </div>

      {/* ═══════ Search, Filters & Actions Bar ═══════ */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="relative flex-1 w-full max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, email, mobile..."
            className="h-10 pl-9 pr-10"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isAdvancedActive ? "default" : "ghost"}
                  size="icon"
                  className={`absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 ${isAdvancedActive ? 'bg-safend-red hover:bg-safend-red/90 text-white' : ''}`}
                  onClick={() => setShowAdvancedSearch(true)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Advanced Search</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex gap-2 ml-auto">
          {/* View Toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden h-10">
            <button
              className={`px-3 h-full flex items-center gap-1.5 text-sm transition-colors ${viewMode === 'card' ? 'bg-safend-red text-white' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              className={`px-3 h-full flex items-center gap-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-safend-red text-white' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setShowImportDialog(true)}>
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import Employees</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isAdvancedActive && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-safend-red/20 bg-safend-red/5 px-3 py-2">
          <SlidersHorizontal className="h-4 w-4 text-safend-red" />
          <span className="text-sm font-medium">{advancedFilterCount} advanced filter{advancedFilterCount === 1 ? '' : 's'} active</span>
          <span className="text-xs text-muted-foreground">{filteredEmployees.length} matching employees</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={clearAdvancedFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* ═══════ Employee Card View ═══════ */}
      {viewMode === 'card' && (
        <>
          {filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-muted/50 rounded-full mb-4">
                <Users className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h4 className="text-lg font-semibold mb-1">No Employees Found</h4>
              <p className="text-muted-foreground text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleEmployees.map((employee) => {
                const statusConfig = getStatusConfig(employee.status);
                const joinedDate = employee.joinDate ? new Date(employee.joinDate) : null;
                const tenure = joinedDate ? Math.floor((Date.now() - joinedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
                const tenureLabel = tenure !== null ? (tenure < 1 ? '<1 yr' : `${tenure} yr${tenure > 1 ? 's' : ''}`) : null;
                const age = employee.dateOfBirth ? Math.floor((Date.now() - new Date(employee.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
                return (
                  <Card key={employee.id} className="group relative overflow-hidden hover:shadow-xl hover:border-safend-red/30 hover:-translate-y-1 hover:scale-[1.02] transition-all duration-200 cursor-pointer" onClick={() => handleViewProfile(employee)}>
                    <div className="flex">
                      {/* Left — passport photo with 7:9 aspect ratio */}
                      <div className="relative w-[120px] shrink-0 bg-muted m-3 rounded-lg overflow-hidden" style={{ aspectRatio: '7/9' }}>
                        {employee.avatar || employee.photoUrl ? (
                          <img
                            src={employee.avatar || employee.photoUrl}
                            alt={employee.name}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-safend-red/10 text-safend-red">
                            <UserRound className="h-14 w-14" strokeWidth={1.5} />
                          </div>
                        )}
                      </div>

                      {/* Right — information */}
                      <div className="flex-1 min-w-0 p-4">
                        {/* 3-dot menu (top-right) */}
                        <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">More actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => handleViewProfile(employee)}>
                                <Eye className="h-4 w-4 text-safend-red" />
                                <span>View Profile</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => handleEditEmployee(employee)}>
                                <Edit className="h-4 w-4 text-blue-600" />
                                <span>Edit</span>
                              </DropdownMenuItem>

                              {/* Print ID Card — only for active employees */}
                              {employee.status?.toLowerCase() === 'active' && (
                                <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => handlePrintIdCard(employee)}>
                                  <IdCard className="h-4 w-4 text-blue-600" />
                                  <span>Print ID Card</span>
                                </DropdownMenuItem>
                              )}

                              {/* Complete Training — only for active employees */}
                              {employee.status?.toLowerCase() === 'active' && (
                                <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => handleCompleteTraining(employee)}>
                                  <GraduationCap className="h-4 w-4 text-emerald-600" />
                                  <span>Complete Training</span>
                                </DropdownMenuItem>
                              )}

                              {/* Request Reimbursement — only for active/on-leave employees */}
                              {['active', 'on leave'].includes(employee.status?.toLowerCase()) && (
                                <DropdownMenuItem
                                  className="gap-2.5 cursor-pointer"
                                  onClick={() => {
                                    setReimbursementTarget(employee);
                                    setReimbursementForm({ amount: '', category: REIMBURSEMENT_CATEGORIES[0], description: '', receiptUrl: '' });
                                  }}
                                >
                                  <Receipt className="h-4 w-4 text-amber-600" />
                                  <span>Request Reimbursement</span>
                                </DropdownMenuItem>
                              )}

                              {/* ── TEMPORARY: quick status fix ───────────── */}
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
                                Quick Status Fix (temp)
                              </DropdownMenuLabel>
                              {QUICK_FIX_STATUSES
                                .filter((s) => s.value.toLowerCase() !== employee.status?.toLowerCase())
                                .map(({ value, icon: StatusIcon, tone }) => (
                                  <DropdownMenuItem
                                    key={value}
                                    className={`gap-2.5 cursor-pointer ${tone}`}
                                    disabled={quickStatusBusyId === employee.id}
                                    onClick={() => handleQuickStatusFix(employee, value)}
                                  >
                                    <StatusIcon className="h-4 w-4" />
                                    <span>Mark {value}</span>
                                  </DropdownMenuItem>
                                ))}

                              <DropdownMenuSeparator />

                              {/* Deboard or Reboard based on status */}
                              {['terminated', 'inactive'].includes(employee.status?.toLowerCase()) ? (
                                <DropdownMenuItem
                                  className="gap-2.5 cursor-pointer text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                                  onClick={() => handleReboard(employee)}
                                >
                                  <UserCheck className="h-4 w-4" />
                                  <span>Reboard Employee</span>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="gap-2.5 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                                  onClick={() => setDeboardTarget(employee)}
                                >
                                  <UserMinus className="h-4 w-4" />
                                  <span>Deboard Employee</span>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Header */}
                        <div className="pr-7">
                          <h4 className="text-[15px] font-bold leading-tight truncate group-hover:text-safend-red transition-colors">{employee.name}</h4>
                          <p className="text-xs font-medium text-muted-foreground truncate mt-0.5">{employee.designation || '-'}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="flex items-center gap-1 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getDepartmentColor(employee.department)}`} />
                              <span className="text-[11px] text-muted-foreground truncate">{employee.department}</span>
                            </span>
                            <Badge variant="outline" className={`text-[10px] font-medium px-1.5 py-0 shrink-0 ${statusConfig.color}`}>{employee.status}</Badge>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3 pt-3 border-t">
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">ID</p>
                            <p className="text-[13px] font-semibold font-mono mt-0.5 truncate">{employee.employeeId || '-'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tenure</p>
                            <p className="text-[13px] font-semibold mt-0.5 truncate">{tenureLabel || '-'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Age</p>
                            <p className="text-[13px] font-semibold mt-0.5 truncate">{age ? `${age} yrs` : '-'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Height</p>
                            <p className="text-[13px] font-semibold mt-0.5 truncate">{employee.height ? `${employee.height} cm` : '-'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Gender</p>
                            <p className="text-[13px] font-semibold mt-0.5 truncate capitalize">{employee.gender || '-'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Location</p>
                            <p className="text-[13px] font-semibold mt-0.5 truncate">{employee.workLocation || employee.city || '-'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {/* Show More button for progressive loading */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={handleShowMore} className="text-xs">
                Show more ({filteredEmployees.length - visibleCount} remaining)
              </Button>
            </div>
          )}
          {filteredEmployees.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">Showing {visibleEmployees.length} of {filteredEmployees.length} employees for &ldquo;{letterFilter}&rdquo;</p>
          )}
        </>
      )}

      {/* ═══════ Employee List/Table View ═══════ */}
      {viewMode === 'list' && (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-muted/50 rounded-full mb-4">
                <Users className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h4 className="text-lg font-semibold mb-1">No Employees Found</h4>
              <p className="text-muted-foreground text-sm mb-4">
                {searchTerm || statusFilter !== 'all' || isAdvancedActive
                  ? 'Try adjusting your search or filters'
                  : 'Add your first employee to get started'}
              </p>
              {!searchTerm && statusFilter === 'all' && !isAdvancedActive && (
                <p className="text-xs text-muted-foreground">Use the Onboarding tab to add new employees</p>
              )}
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[280px]">Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map((employee) => {
                  const statusConfig = getStatusConfig(employee.status);
                  return (
                    <TableRow
                      key={employee.id}
                      className="group cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => handleViewProfile(employee)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border">
                            <AvatarImage src={employee.avatar || employee.photoUrl} alt={employee.name} className="object-cover" />
                            <AvatarFallback className="bg-safend-red/10 text-safend-red font-semibold text-sm">
                              {employee.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate group-hover:text-safend-red transition-colors">{employee.name}</p>
                            <p className="text-xs text-muted-foreground truncate font-mono">{employee.employeeId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${getDepartmentColor(employee.department)}`} />
                          <span className="text-sm">{employee.department || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{employee.designation || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {employee.joinDate ? new Date(employee.joinDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs font-medium ${statusConfig.color}`}>
                          {employee.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-safend-red" onClick={() => handleViewProfile(employee)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-blue-600" onClick={() => handleEditEmployee(employee)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {/* Show More button for progressive loading in list view */}
            {hasMore && (
              <div className="flex justify-center py-3 border-t">
                <Button variant="outline" size="sm" onClick={handleShowMore} className="text-xs">
                  Show more ({filteredEmployees.length - visibleCount} remaining)
                </Button>
              </div>
            )}
            </>
          )}
        </CardContent>
        {filteredEmployees.length > 0 && (
          <div className="border-t px-6 py-3 flex justify-between items-center text-xs text-muted-foreground">
            <span>Showing {visibleEmployees.length} of {filteredEmployees.length} employees for &ldquo;{letterFilter}&rdquo;</span>
            <span>Click on a row to view full profile</span>
          </div>
        )}
      </Card>
      )}

      {/* ═══════ Bottom Alphabetical Filter Bar ═══════ */}
      {(() => {
        const hasPrev = availableLetters.indexOf(letterFilter) > 0;
        const hasNext = availableLetters.indexOf(letterFilter) < availableLetters.length - 1;
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              {ALPHABET.map(letter => {
                const count = letterCounts[letter] || 0;
                const hasEmployees = count > 0;
                const isActive = letterFilter === letter;
                return (
                  <button
                    key={letter}
                    onClick={() => hasEmployees && setLetterFilter(letter)}
                    disabled={!hasEmployees}
                    className={`w-8 h-8 rounded text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-safend-red text-white shadow-xs scale-110'
                        : hasEmployees
                          ? 'bg-muted hover:bg-safend-red/10 hover:text-safend-red text-foreground cursor-pointer'
                          : 'bg-muted/40 text-muted-foreground/30 cursor-not-allowed'
                    }`}
                    title={hasEmployees ? `${letter} — ${count} employee${count > 1 ? 's' : ''}` : `No employees starting with ${letter}`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToPrevLetter} disabled={!hasPrev} className="h-7 px-3 text-xs">
                <ChevronLeft className="h-3 w-3 mr-1" />Prev
              </Button>
              <span className="text-sm font-bold text-safend-red min-w-[20px] text-center">{letterFilter}</span>
              <Button variant="outline" size="sm" onClick={goToNextLetter} disabled={!hasNext} className="h-7 px-3 text-xs">
                Next<ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ── Modals & Dialogs ─────────────────────────────────────────────────── */}
      <EmployeeProfileModal open={showProfileModal} onOpenChange={setShowProfileModal} employee={profileEmployee} />
      <EmployeeImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />
      <EmployeeForm
        isOpen={isEmployeeFormOpen}
        onClose={() => { setIsEmployeeFormOpen(false); setSelectedEmployee(null); }}
        onSave={handleSaveEmployee}
        employee={selectedEmployee ? {
          id: selectedEmployee.employeeId,
          name: selectedEmployee.name,
          email: selectedEmployee.email,
          department: selectedEmployee.department,
          designation: selectedEmployee.designation,
          status: selectedEmployee.status,
          joinDate: selectedEmployee.joinDate,
          avatar: selectedEmployee.avatar || '/placeholder.svg',
          phoneNumber: selectedEmployee.phone,
          address: selectedEmployee.currentAddress,
        } : null}
      />

      {/* Deboard Employee Modal */}
      <Dialog open={!!deboardTarget} onOpenChange={(open) => { if (!open) { setDeboardTarget(null); setDeboardForm({ reason: '', lastWorkingDate: '', noticePeriodServed: false, exitInterviewDone: false, uniformReturned: false, idCardReturned: false, equipmentReturned: false, accessRevoked: false, siteHandoverDone: false, pfFormSubmitted: false, esiFormSubmitted: false, gratuityApplicable: false, fnfInitiated: false, relievingLetterIssued: false, remarks: '' }); } }}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <UserMinus className="h-5 w-5" />
              Deboard Employee
            </DialogTitle>
            <DialogDescription>
              Complete the exit process for <strong>{deboardTarget?.name}</strong> ({deboardTarget?.employeeId}).
              Ensure all compliance requirements are met before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Reason & Last Working Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Reason for Exit <span className="text-red-500">*</span></Label>
                <Select value={deboardForm.reason || undefined} onValueChange={(v) => setDeboardForm(f => ({ ...f, reason: v as any }))}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent position="popper" className="z-9999">
                    <SelectItem value="resignation">Resignation (Voluntary)</SelectItem>
                    <SelectItem value="termination">Termination (Misconduct / Disciplinary)</SelectItem>
                    <SelectItem value="absconding">Absconding (No Show / Unauthorized Absence)</SelectItem>
                    <SelectItem value="client_complaint">Client Complaint / Removal Request</SelectItem>
                    <SelectItem value="medical_unfit">Medically Unfit for Duty</SelectItem>
                    <SelectItem value="failed_verification">Failed Police Verification / Background Check</SelectItem>
                    <SelectItem value="contract_end">Contract Period Ended</SelectItem>
                    <SelectItem value="site_closure">Site / Post Closure</SelectItem>
                    <SelectItem value="retirement">Retirement (Superannuation)</SelectItem>
                    <SelectItem value="death">Death in Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Last Working Date</Label>
                <Input type="date" value={deboardForm.lastWorkingDate} onChange={(e) => setDeboardForm(f => ({ ...f, lastWorkingDate: e.target.value }))} />
              </div>
            </div>

            {/* Asset Recovery */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Asset Recovery & Site Handover</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.uniformReturned} onCheckedChange={() => setDeboardForm(f => ({ ...f, uniformReturned: !f.uniformReturned }))} />
                  <span className="text-sm">Uniform Returned</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.idCardReturned} onCheckedChange={() => setDeboardForm(f => ({ ...f, idCardReturned: !f.idCardReturned }))} />
                  <span className="text-sm">ID Card Returned</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.equipmentReturned} onCheckedChange={() => setDeboardForm(f => ({ ...f, equipmentReturned: !f.equipmentReturned }))} />
                  <span className="text-sm">Equipment Returned (Torch, Baton, Radio)</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.accessRevoked} onCheckedChange={() => setDeboardForm(f => ({ ...f, accessRevoked: !f.accessRevoked }))} />
                  <span className="text-sm">Access / Keys Revoked</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.siteHandoverDone} onCheckedChange={() => setDeboardForm(f => ({ ...f, siteHandoverDone: !f.siteHandoverDone }))} />
                  <span className="text-sm">Site Handover Completed</span>
                </div>
              </div>
            </div>

            {/* Compliance & Statutory */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Statutory Compliance (PF / ESI / Gratuity)</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.pfFormSubmitted} onCheckedChange={() => setDeboardForm(f => ({ ...f, pfFormSubmitted: !f.pfFormSubmitted }))} />
                  <span className="text-sm">PF Form 19/10C Submitted</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.esiFormSubmitted} onCheckedChange={() => setDeboardForm(f => ({ ...f, esiFormSubmitted: !f.esiFormSubmitted }))} />
                  <span className="text-sm">ESI Detachment Done</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.gratuityApplicable} onCheckedChange={() => setDeboardForm(f => ({ ...f, gratuityApplicable: !f.gratuityApplicable }))} />
                  <span className="text-sm">Gratuity Applicable (5+ yrs)</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.fnfInitiated} onCheckedChange={() => setDeboardForm(f => ({ ...f, fnfInitiated: !f.fnfInitiated }))} />
                  <span className="text-sm">F&F Settlement Initiated</span>
                </div>
              </div>
            </div>

            {/* HR Process */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">HR Process</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.noticePeriodServed} onCheckedChange={() => setDeboardForm(f => ({ ...f, noticePeriodServed: !f.noticePeriodServed }))} />
                  <span className="text-sm">Notice Period Served / Waived</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.exitInterviewDone} onCheckedChange={() => setDeboardForm(f => ({ ...f, exitInterviewDone: !f.exitInterviewDone }))} />
                  <span className="text-sm">Exit Interview Conducted</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={deboardForm.relievingLetterIssued} onCheckedChange={() => setDeboardForm(f => ({ ...f, relievingLetterIssued: !f.relievingLetterIssued }))} />
                  <span className="text-sm">Relieving Letter Issued</span>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Remarks / Notes</Label>
              <Textarea rows={2} placeholder="Any additional notes about the exit..." value={deboardForm.remarks} onChange={(e) => setDeboardForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeboardTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeboard}
              disabled={deboardLoading || !deboardForm.reason}
            >
              {deboardLoading ? 'Processing...' : 'Confirm Deboarding'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reimbursement request dialog */}
      <Dialog open={!!reimbursementTarget} onOpenChange={(open) => { if (!open) setReimbursementTarget(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-600" />
              Request Reimbursement
            </DialogTitle>
            <DialogDescription>
              Submit a reimbursement to Accounts for <strong>{reimbursementTarget?.name}</strong> ({reimbursementTarget?.employeeId}).
              Accounts will be notified and a pending payable will be created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="reimb-amount">Amount (₹) <span className="text-red-500">*</span></Label>
              <Input
                id="reimb-amount"
                type="number"
                min="1"
                placeholder="e.g. 1500"
                value={reimbursementForm.amount}
                onChange={(e) => setReimbursementForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reimb-category">Category <span className="text-red-500">*</span></Label>
              <Select
                value={reimbursementForm.category}
                onValueChange={(v) => setReimbursementForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger id="reimb-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REIMBURSEMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reimb-desc">Description <span className="text-red-500">*</span></Label>
              <Textarea
                id="reimb-desc"
                rows={3}
                placeholder="Briefly describe the expense and reason for reimbursement..."
                value={reimbursementForm.description}
                onChange={(e) => setReimbursementForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReimbursementTarget(null)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleSubmitReimbursement}
              disabled={reimbursementLoading}
            >
              {reimbursementLoading ? 'Submitting…' : 'Send to Accounts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Advanced Search Dialog ═══════ */}
      <Dialog open={showAdvancedSearch} onOpenChange={setShowAdvancedSearch}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[1140px]">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-safend-red" />
              Advanced Employee Search
            </DialogTitle>
            <DialogDescription>
              Combine any options below. Multiple selected statuses are matched together.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 lg:grid-cols-2">
            {/* ─ Left Column ─ */}
            <div className="space-y-4">
            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-semibold">Role and department</h3>
                <p className="text-xs text-muted-foreground">Find employees by where and how they work.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select
                    value={advFilters.department || 'any'}
                    onValueChange={(value) => setAdvFilters((current) => ({ ...current, department: value === 'any' ? '' : value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any department</SelectItem>
                      {departments.map((department) => (
                        <SelectItem key={department} value={department}>{department}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-designation">Designation contains</Label>
                  <Input
                    id="adv-designation"
                    placeholder="e.g. Guard, Supervisor"
                    value={advFilters.designation || ''}
                    onChange={(event) => setAdvFilters((current) => ({ ...current, designation: event.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status (select one or more)</Label>
                <div className="flex flex-wrap gap-2">
                  {['Active', 'Inactive', 'On Leave', 'Terminated', 'Absconded', 'Suspended'].map((status) => {
                    const selected = advFilters.statuses?.includes(status);
                    return (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className={selected ? 'bg-safend-red hover:bg-safend-red/90' : ''}
                        onClick={() => toggleAdvancedStatus(status)}
                      >
                        {status}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-semibold">Personal details</h3>
                <p className="text-xs text-muted-foreground">Use demographic and age options.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <div className="grid grid-cols-4 gap-1 rounded-md border p-1">
                    {[['', 'Any'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']].map(([value, label]) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={(advFilters.gender || '') === value ? 'secondary' : 'ghost'}
                        className="h-8 px-2"
                        onClick={() => setAdvFilters((current) => ({ ...current, gender: value }))}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Religion</Label>
                  <Select
                    value={advFilters.religion || 'any'}
                    onValueChange={(value) => setAdvFilters((current) => ({ ...current, religion: value === 'any' ? '' : value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Any religion" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any religion</SelectItem>
                      {['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'].map((religion) => (
                        <SelectItem key={religion} value={religion}>{religion}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quick age ranges</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '18–25', from: '18', to: '25' },
                    { label: '26–35', from: '26', to: '35' },
                    { label: '36–45', from: '36', to: '45' },
                    { label: '46–55', from: '46', to: '55' },
                    { label: '55+', from: '55', to: '' },
                  ].map((range) => {
                    const selected = advFilters.ageFrom === range.from && (advFilters.ageTo || '') === range.to;
                    return (
                      <Button
                        key={range.label}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className={selected ? 'bg-safend-red hover:bg-safend-red/90' : ''}
                        onClick={() => setAdvFilters((current) => ({ ...current, ageFrom: range.from, ageTo: range.to }))}
                      >
                        {range.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-age-from">Minimum age</Label>
                  <Input id="adv-age-from" type="number" min="18" max="100" placeholder="18" value={advFilters.ageFrom || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, ageFrom: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-age-to">Maximum age</Label>
                  <Input id="adv-age-to" type="number" min="18" max="100" placeholder="60" value={advFilters.ageTo || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, ageTo: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border p-4">
              <div><h3 className="text-sm font-semibold">Smart employee filters</h3><p className="text-xs text-muted-foreground">Birthday, today&apos;s deployment, profile health, medical and education.</p></div>
              <div className="space-y-2"><Label className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-safend-red" />Birthday</Label><div className="flex flex-wrap gap-2">{[['', 'Any birthday'], ['today', 'Birthday today'], ['month', 'This month']].map(([value, label]) => <Button key={label} type="button" size="sm" variant={(advFilters.birthday || '') === value ? 'default' : 'outline'} className={(advFilters.birthday || '') === value ? 'bg-safend-red' : ''} onClick={() => setAdvFilters(c => ({ ...c, birthday: value as AdvancedSearchFilters['birthday'] }))}>{label}</Button>)}</div></div>
              <div className="space-y-2"><Label className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-safend-red" />Today&apos;s post deployment</Label><div className="flex flex-wrap gap-2">{[['', 'Any'], ['posted', 'Posted today'], ['not_posted', 'Not posted today']].map(([value, label]) => <Button key={label} type="button" size="sm" variant={(advFilters.postedToday || '') === value ? 'default' : 'outline'} onClick={() => setAdvFilters(c => ({ ...c, postedToday: value as AdvancedSearchFilters['postedToday'] }))}>{label}</Button>)}</div></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label>Profile</Label><Select value={advFilters.profile || 'any'} onValueChange={v => setAdvFilters(c => ({ ...c, profile: v === 'any' ? '' : v as 'complete' | 'incomplete' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any profile</SelectItem><SelectItem value="complete">Complete profile</SelectItem><SelectItem value="incomplete">Incomplete profile</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Medical</Label><Select value={advFilters.medical || 'any'} onValueChange={v => setAdvFilters(c => ({ ...c, medical: v === 'any' ? '' : v as 'declared' | 'none' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any medical status</SelectItem><SelectItem value="declared">Condition declared</SelectItem><SelectItem value="none">No condition declared</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="flex gap-1"><GraduationCap className="h-4 w-4" />Education</Label><Select value={advFilters.education || 'any'} onValueChange={v => setAdvFilters(c => ({ ...c, education: v === 'any' ? '' : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any education</SelectItem>{['Below 10th','10th Pass','12th Pass','ITI','Diploma','Graduate','Postgraduate'].map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </section>
            </div>
            {/* ─ Right Column ─ */}
            <div className="space-y-4">
            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-semibold">Joining period</h3>
                <p className="text-xs text-muted-foreground">Choose a preset or enter exact dates.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setJoinDatePreset(30)}>Last 30 days</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setJoinDatePreset(90)}>Last 3 months</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setJoinDatePreset(180)}>Last 6 months</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setJoinDatePreset(365)}>Last 1 year</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-join-from">Joined from</Label>
                  <Input id="adv-join-from" type="date" value={advFilters.joinFrom || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, joinFrom: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-join-to">Joined to</Label>
                  <Input id="adv-join-to" type="date" value={advFilters.joinTo || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, joinTo: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-semibold">Physical and salary ranges</h3>
                <p className="text-xs text-muted-foreground">All range endpoints are optional.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-height-from">Height min (cm)</Label>
                  <Input id="adv-height-from" type="number" min="0" placeholder="150" value={advFilters.heightFrom || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, heightFrom: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-height-to">Height max (cm)</Label>
                  <Input id="adv-height-to" type="number" min="0" placeholder="190" value={advFilters.heightTo || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, heightTo: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-weight-from">Weight min (kg)</Label>
                  <Input id="adv-weight-from" type="number" min="0" placeholder="50" value={advFilters.weightFrom || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, weightFrom: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-weight-to">Weight max (kg)</Label>
                  <Input id="adv-weight-to" type="number" min="0" placeholder="90" value={advFilters.weightTo || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, weightTo: event.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-salary-from">Monthly salary min (₹)</Label>
                  <Input id="adv-salary-from" type="number" min="0" placeholder="10000" value={advFilters.salaryFrom || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, salaryFrom: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-salary-to">Monthly salary max (₹)</Label>
                  <Input id="adv-salary-to" type="number" min="0" placeholder="50000" value={advFilters.salaryTo || ''} onChange={(event) => setAdvFilters((current) => ({ ...current, salaryTo: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-semibold">Profile completeness</h3>
                <p className="text-xs text-muted-foreground">Locate records with required contact or photo data.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Profile photo</Label>
                  <Select value={advFilters.photo || 'any'} onValueChange={(value) => setAdvFilters((current) => ({ ...current, photo: value === 'any' ? '' : value as 'with' | 'without' }))}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">With or without photo</SelectItem>
                      <SelectItem value="with">Has profile photo</SelectItem>
                      <SelectItem value="without">Missing profile photo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Contact availability</Label>
                  <Select value={advFilters.contact || 'any'} onValueChange={(value) => setAdvFilters((current) => ({ ...current, contact: value === 'any' ? '' : value as 'phone' | 'email' | 'both' }))}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any contact details</SelectItem>
                      <SelectItem value="phone">Has mobile number</SelectItem>
                      <SelectItem value="email">Has email address</SelectItem>
                      <SelectItem value="both">Has mobile and email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-4 sm:justify-between">
            <Button variant="ghost" onClick={clearAdvancedFilters}>Clear all</Button>
            <div className="flex items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">{advancedFilterCount} selected</span>
              <Button variant="outline" onClick={() => setShowAdvancedSearch(false)}>Cancel</Button>
              <Button className="bg-safend-red text-white hover:bg-safend-red/90" onClick={applyAdvancedFilters}>
                <Search className="mr-2 h-4 w-4" />
                Search employees
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
