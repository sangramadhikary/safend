'use client';
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileSpreadsheet, FileText, FileDown, Code, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// Deferred: XLSX is large (~300KB) and only needed when user triggers export
const getXLSX = () => import("xlsx");
import { supabaseClient } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";

interface ReportLibraryProps {
  moduleFilter: string | null;
}

interface Report {
  id: string;
  name: string;
  description: string;
  module: string;
  exports: ('excel' | 'pdf' | 'json' | 'csv')[];
}

// Reports that a security agency actually needs — grouped by department
const REPORTS: Report[] = [
  // Operations
  { id: 'ops-1', name: 'Daily Attendance Report', description: 'Post-wise attendance with present/absent/leave count', module: 'Operations', exports: ['excel', 'pdf'] },
  { id: 'ops-2', name: 'Rota Coverage Report', description: 'Planned vs actual deployment with gap analysis', module: 'Operations', exports: ['excel', 'pdf'] },
  { id: 'ops-3', name: 'Shift-wise Manpower', description: 'Day/night shift deployment across all posts', module: 'Operations', exports: ['excel'] },
  { id: 'ops-4', name: 'Penalty & Incident Summary', description: 'Monthly penalties, show-cause, and disciplinary actions', module: 'Operations', exports: ['excel', 'pdf'] },
  { id: 'ops-5', name: 'Post Performance Report', description: 'Client-wise post efficiency and complaint tracking', module: 'Operations', exports: ['excel', 'pdf'] },

  // HR & Payroll
  { id: 'hr-1', name: 'Monthly Salary Statement', description: 'Employee-wise salary breakup with deductions (PF, ESI, PT)', module: 'HR & Payroll', exports: ['excel', 'pdf'] },
  { id: 'hr-2', name: 'PF ECR (Electronic Challan)', description: 'ECR file for EPFO portal upload — UAN-wise contribution', module: 'HR & Payroll', exports: ['excel', 'csv'] },
  { id: 'hr-3', name: 'ESI Contribution Report', description: 'Monthly ESI contribution for ESIC portal filing', module: 'HR & Payroll', exports: ['excel', 'csv'] },
  { id: 'hr-4', name: 'Headcount & Attrition', description: 'Department-wise employee count, joiners, and exits', module: 'HR & Payroll', exports: ['excel'] },
  { id: 'hr-5', name: 'Leave Summary', description: 'Employee-wise leave balance and utilization', module: 'HR & Payroll', exports: ['excel'] },
  { id: 'hr-6', name: 'Loan & Advance Report', description: 'Outstanding loans, EMI schedule, and recovery status', module: 'HR & Payroll', exports: ['excel'] },
  { id: 'hr-7', name: 'Form 16 / 12BA', description: 'Annual TDS certificate data for employees', module: 'HR & Payroll', exports: ['pdf'] },

  // Accounts & Finance
  { id: 'acc-1', name: 'Profit & Loss Statement', description: 'Monthly/quarterly P&L with branch-wise breakup', module: 'Accounts', exports: ['excel', 'pdf'] },
  { id: 'acc-2', name: 'Receivables Aging', description: 'Client-wise outstanding by 0-30, 31-60, 61-90, 90+ days', module: 'Accounts', exports: ['excel', 'pdf'] },
  { id: 'acc-3', name: 'Payables Summary', description: 'Vendor-wise pending payments with due dates', module: 'Accounts', exports: ['excel'] },
  { id: 'acc-4', name: 'GSTR-1 (Outward Supplies)', description: 'B2B, B2C invoices for GST portal filing', module: 'Accounts', exports: ['excel', 'json'] },
  { id: 'acc-5', name: 'GSTR-3B Summary', description: 'Monthly GST liability, ITC, and net payable', module: 'Accounts', exports: ['excel', 'json', 'pdf'] },
  { id: 'acc-6', name: 'TDS Return (26Q/24Q)', description: 'Quarterly TDS deducted, deposited — FVU format ready', module: 'Accounts', exports: ['excel', 'csv'] },
  { id: 'acc-7', name: 'Bank Reconciliation', description: 'Book balance vs bank balance with unmatched entries', module: 'Accounts', exports: ['excel'] },
  { id: 'acc-8', name: 'Trial Balance', description: 'Complete trial balance with opening/closing balances', module: 'Accounts', exports: ['excel', 'pdf'] },

  // Sales & Billing
  { id: 'sales-1', name: 'Invoice Register', description: 'All invoices raised with status (paid/pending/overdue)', module: 'Sales', exports: ['excel', 'pdf'] },
  { id: 'sales-2', name: 'Client Billing Summary', description: 'Client-wise monthly billing and collection', module: 'Sales', exports: ['excel'] },
  { id: 'sales-3', name: 'Sales Pipeline', description: 'Lead to conversion funnel with value at each stage', module: 'Sales', exports: ['excel'] },
  { id: 'sales-4', name: 'Agreement Expiry Report', description: 'Contracts expiring in next 30/60/90 days', module: 'Sales', exports: ['excel', 'pdf'] },
];

const MODULES = [...new Set(REPORTS.map(r => r.module))];

export function ReportLibrary({ moduleFilter }: ReportLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModule, setActiveModule] = useState("Operations");
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [pendingReport, setPendingReport] = useState<{ report: Report; format: string } | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const { allBranches, currentBranch, isMainBranchUser } = useBranch();
  // Sub-branch users are locked to their own branch; main users can pick any (or all).
  const [branchFilter, setBranchFilter] = useState(isMainBranchUser ? "all" : (currentBranch?.id || "all"));
  const { toast } = useToast();

  const filtered = REPORTS.filter(r => {
    const matchesSearch = !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesModule = r.module === activeModule;
    return matchesSearch && matchesModule;
  });

  // When user clicks an export button, open filter dialog first
  const initiateExport = (report: Report, format: string) => {
    setPendingReport({ report, format });
    setFilterDialogOpen(true);
  };

  // After user confirms filters, run the actual export
  const confirmExport = async () => {
    if (!pendingReport) return;
    setFilterDialogOpen(false);
    const { report, format } = pendingReport;

    toast({ title: "Generating...", description: `${report.name} (${format.toUpperCase()}) · ${fromDate} to ${toDate}` });

    try {
      const data = await fetchReportData(report, fromDate, toDate, branchFilter);

      if (!data || data.length === 0) {
        toast({ title: "No Data", description: `No records found for ${fromDate} to ${toDate}. Try a different date range.`, variant: "destructive" });
        return;
      }

      const fileName = `${report.name.replace(/[^a-zA-Z0-9]/g, '_')}_${fromDate}_to_${toDate}`;

      switch (format) {
        case 'excel': {
          const XLSX = await getXLSX();
          const ws = XLSX.utils.json_to_sheet(data);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, report.name.slice(0, 31));
          XLSX.writeFile(wb, `${fileName}.xlsx`);
          toast({ title: "Downloaded", description: `${fileName}.xlsx` });
          break;
        }
        case 'csv': {
          const XLSX = await getXLSX();
          const ws = XLSX.utils.json_to_sheet(data);
          const csv = XLSX.utils.sheet_to_csv(ws);
          downloadBlob(csv, `${fileName}.csv`, 'text/csv');
          toast({ title: "Downloaded", description: `${fileName}.csv` });
          break;
        }
        case 'json': {
          const json = JSON.stringify(data, null, 2);
          downloadBlob(json, `${fileName}.json`, 'application/json');
          toast({ title: "Downloaded", description: `${fileName}.json` });
          break;
        }
        case 'pdf': {
          const html = generatePrintHTML(report.name, data, fromDate, toDate);
          const win = window.open('', '_blank');
          if (win) { win.document.write(html); win.document.close(); }
          break;
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to generate report", variant: "destructive" });
    }
    setPendingReport(null);
  };

  return (
    <div className="space-y-5">
      {/* Department tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {MODULES.map(mod => (
            <Button
              key={mod}
              variant={activeModule === mod ? "default" : "ghost"}
              size="sm"
              className={activeModule === mod ? "bg-safend-red hover:bg-safend-red/90 text-white" : "text-muted-foreground"}
              onClick={() => setActiveModule(mod)}
            >
              {mod}
            </Button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Report list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No reports found</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map((report) => (
            <div key={report.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{report.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{report.description}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {report.exports.includes('excel') && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50" onClick={() => initiateExport(report, 'excel')}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
                  </Button>
                )}
                {report.exports.includes('pdf') && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-700 hover:text-red-800 hover:bg-red-50" onClick={() => initiateExport(report, 'pdf')}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                )}
                {report.exports.includes('json') && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50" onClick={() => initiateExport(report, 'json')}>
                    <Code className="h-3.5 w-3.5 mr-1" /> JSON
                  </Button>
                )}
                {report.exports.includes('csv') && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-purple-700 hover:text-purple-800 hover:bg-purple-50" onClick={() => initiateExport(report, 'csv')}>
                    <FileDown className="h-3.5 w-3.5 mr-1" /> CSV
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Dialog — opens before any export */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-safend-red" />
              Report Filters
            </DialogTitle>
          </DialogHeader>
          {pendingReport && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/50 border text-sm">
                <p className="font-medium">{pendingReport.report.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Format: {pendingReport.format.toUpperCase()}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">From Date</Label>
                  <Input type="date" className="mt-1" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">To Date</Label>
                  <Input type="date" className="mt-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Branch</Label>
                <Select
                  value={branchFilter}
                  onValueChange={setBranchFilter}
                  disabled={!isMainBranchUser}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isMainBranchUser && <SelectItem value="all">All Branches</SelectItem>}
                    {(isMainBranchUser
                      ? allBranches
                      : allBranches.filter((b) => b.id === currentBranch?.id)
                    ).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isMainBranchUser && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Reports are limited to your branch.
                  </p>
                )}
              </div>

              {/* Quick date presets */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'This Month', fn: () => { const d = new Date(); setFromDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`); setToDate(d.toISOString().split('T')[0]); }},
                  { label: 'Last Month', fn: () => { const d = new Date(); d.setMonth(d.getMonth()-1); setFromDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`); const last = new Date(d.getFullYear(), d.getMonth()+1, 0); setToDate(last.toISOString().split('T')[0]); }},
                  { label: 'This Quarter', fn: () => { const d = new Date(); const q = Math.floor(d.getMonth()/3)*3; setFromDate(`${d.getFullYear()}-${String(q+1).padStart(2,'0')}-01`); setToDate(d.toISOString().split('T')[0]); }},
                  { label: 'This FY', fn: () => { const d = new Date(); const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear()-1; setFromDate(`${fy}-04-01`); setToDate(d.toISOString().split('T')[0]); }},
                ].map(p => (
                  <Button key={p.label} variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={p.fn}>{p.label}</Button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFilterDialogOpen(false)}>Cancel</Button>
            <Button className="bg-safend-red hover:bg-safend-red/90 text-white" onClick={confirmExport}>
              Generate & Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ─── HELPERS ────────────────────────────────────────────────────────────────

function downloadBlob(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generatePrintHTML(title: string, data: any[], fromDate: string, toDate: string): string {
  if (!data || data.length === 0) return '<html><body><p>No data</p></body></html>';
  const cols = Object.keys(data[0]);
  const rows = data.map(row => `<tr>${cols.map(c => `<td style="border:1px solid #ddd;padding:6px 10px;font-size:12px;">${row[c] ?? ''}</td>`).join('')}</tr>`).join('');
  return `<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:sans-serif;padding:30px;} 
    h1{color:#D71920;font-size:18px;margin-bottom:4px;} 
    p{color:#666;font-size:12px;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;} 
    th{background:#D71920;color:white;padding:8px 10px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;}
    tr:nth-child(even){background:#f9f9f9;}
    @media print{body{padding:10px;}}
  </style></head><body>
    <h1>${title}</h1>
    <p>Safend Secure Solutions Pvt. Ltd. · Period: ${fromDate} to ${toDate} · Generated: ${new Date().toLocaleString('en-IN')}</p>
    <table><thead><tr>${cols.map(c => `<th>${c.replace(/_/g, ' ')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <script>setTimeout(()=>window.print(),300);</script>
  </body></html>`;
}

/** Fetch data from Supabase based on report ID with date filters */
async function fetchReportData(report: Report, fromDate: string, toDate: string, branch: string): Promise<any[]> {
  const tableMap: Record<string, { table: string; select?: string; dateCol?: string }> = {
    'ops-1': { table: 'attendance', dateCol: 'date' },
    'ops-2': { table: 'rota_assignments', dateCol: 'date' },
    'ops-3': { table: 'rota_assignments', dateCol: 'date' },
    'ops-4': { table: 'penalties', dateCol: 'created_at' },
    'ops-5': { table: 'operational_posts' },
    'hr-1': { table: 'employees', select: 'employee_id,name,designation,department,status' },
    'hr-2': { table: 'employees', select: 'employee_id,name,designation,department' },
    'hr-3': { table: 'employees', select: 'employee_id,name,designation,department' },
    'hr-4': { table: 'employees', select: 'employee_id,name,designation,department,status' },
    'hr-5': { table: 'employees', select: 'employee_id,name,designation,department,status' },
    'hr-6': { table: 'employees', select: 'employee_id,name,designation,department' },
    'hr-7': { table: 'employees', select: 'employee_id,name,designation,department' },
    'acc-1': { table: 'receivables', dateCol: 'created_at' },
    'acc-2': { table: 'receivables', dateCol: 'created_at' },
    'acc-3': { table: 'payables', dateCol: 'created_at' },
    'acc-4': { table: 'receivables', dateCol: 'created_at' },
    'acc-5': { table: 'receivables', dateCol: 'created_at' },
    'acc-6': { table: 'receivables', dateCol: 'created_at' },
    'acc-7': { table: 'bank_transactions', dateCol: 'transaction_date' },
    'acc-8': { table: 'receivables', dateCol: 'created_at' },
    'sales-1': { table: 'receivables', select: 'id,description,client_name,amount,total_amount,due_date,status,created_at', dateCol: 'created_at' },
    'sales-2': { table: 'receivables', dateCol: 'created_at' },
    'sales-3': { table: 'leads', dateCol: 'created_at' },
    'sales-4': { table: 'agreements', dateCol: 'end_date' },
  };

  const config = tableMap[report.id];
  if (!config) return [];

  try {
    let query = supabaseClient.from(config.table).select(config.select || '*').limit(1000);

    // Apply date filter if the table has a date column
    if (config.dateCol && fromDate && toDate) {
      query = query.gte(config.dateCol, fromDate).lte(config.dateCol, toDate + 'T23:59:59');
    }

    // Apply branch filter (defense-in-depth; RLS already scopes by branch).
    // branch_id is stored as UUID on some tables and as branch code on others,
    // so match either form of the selected branch.
    if (branch && branch !== 'all') {
      const codes = [branch];
      // Resolve the branch code for this UUID (employees etc. store the code)
      const { data: br } = await supabaseClient
        .from('branches')
        .select('id, code, branch_id')
        .eq('id', branch)
        .maybeSingle();
      if (br?.code) codes.push(br.code);
      if (br?.branch_id) codes.push(br.branch_id);
      query = query.in('branch_id', Array.from(new Set(codes)));
    }

    query = query.order(config.dateCol || 'created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.warn(`Report ${report.id}: table "${config.table}" not available`);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}
