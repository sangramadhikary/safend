'use client';
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
// Deferred: XLSX is large (~300KB) and only needed when user triggers import/export
const getXLSX = () => import("xlsx");
import { addHREmployee, type HREmployee } from "@/services/supabase/HREmployeeService";
import { useBranch } from "@/contexts/BranchContext";

interface EmployeeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Template columns matching the employee form fields
const TEMPLATE_COLUMNS = [
  "Employee ID", "Name", "Email", "Phone", "Department", "Designation",
  "Join Date (DD/MM/YYYY)", "Employment Type", "Status",
  "Gender", "Date of Birth (DD/MM/YYYY)", "Blood Group",
  "Religion", "Nationality", "Caste", "Marital Status",
  "Height (cm)", "Weight (kg)", "Monthly Salary",
  "Aadhar Number", "PAN Number",
  "Address", "City", "State", "Pincode",
  "Bank Account Number", "Bank Name", "IFSC Code",
  "Emergency Contact Name", "Emergency Contact Phone", "Emergency Contact Relation"
];

// Example row for the template
const EXAMPLE_ROW = [
  "EMP0001", "Rajesh Kumar", "rajesh.kumar@company.com", "9876543210", "Operations", "Unarmed Guard",
  "15/01/2025", "Full-Time", "Active",
  "Male", "12/05/1992", "B+",
  "Hindu", "Indian", "", "Married",
  "170", "65", "12000",
  "123456789012", "ABCDE1234F",
  "Plot 45, Sector 62", "Noida", "Uttar Pradesh", "201301",
  "1234567890123", "State Bank of India", "SBIN0001234",
  "Priya Kumar", "9988776655", "Spouse"
];

type ImportStatus = "idle" | "preview" | "importing" | "done";

interface ParsedEmployee {
  row: number;
  data: Partial<HREmployee>;
  valid: boolean;
  errors: string[];
}

export function EmployeeImportDialog({ open, onOpenChange }: EmployeeImportDialogProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [parsedData, setParsedData] = useState<ParsedEmployee[]>([]);
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { currentBranch } = useBranch();

  const handleDownloadTemplate = async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();
    const wsData = [TEMPLATE_COLUMNS, EXAMPLE_ROW];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = TEMPLATE_COLUMNS.map((col) => ({
      wch: Math.max(col.length + 2, 18)
    }));

    // Add data validation for constrained columns (Excel dropdown lists)
    // Note: xlsx library has limited validation support, so we add a validation sheet
    const validationData = [
      ["Employment Type", "Status", "Gender", "Blood Group", "Marital Status"],
      ["Full-Time", "Active", "Male", "A+", "Single"],
      ["Part-Time", "Inactive", "Female", "A-", "Married"],
      ["Contract", "On Leave", "Other", "B+", "Divorced"],
      ["Temporary", "Terminated", "", "B-", "Widowed"],
      ["Intern", "", "", "O+", ""],
      ["", "", "", "O-", ""],
      ["", "", "", "AB+", ""],
      ["", "", "", "AB-", ""],
    ];
    const vsWs = XLSX.utils.aoa_to_sheet(validationData);
    vsWs['!cols'] = validationData[0].map(() => ({ wch: 16 }));

    XLSX.utils.book_append_sheet(wb, ws, "Employee Template");
    XLSX.utils.book_append_sheet(wb, vsWs, "Valid Values (Reference)");
    XLSX.writeFile(wb, "Employee_Import_Template.xlsx");

    toast({ title: "Template Downloaded", description: "Fill in the template and upload to import employees. See 'Valid Values' sheet for allowed dropdown options." });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv"
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      toast({ title: "Invalid File", description: "Please upload an Excel (.xlsx, .xls) or CSV file", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await getXLSX();
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          toast({ title: "Empty File", description: "The file has no data rows. Please fill in employee data below the header row.", variant: "destructive" });
          return;
        }

        // Skip header row, parse each data row
        const parsed: ParsedEmployee[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row || row.length === 0 || !row[0]) continue; // skip empty rows

          const errors: string[] = [];
          const warnings: string[] = [];

          // Normalize all fields
          const employeeId = normalizeEmployeeId(String(row[0] || ""));
          const name = String(row[1] || "").trim().replace(/^\s+/, ''); // strip leading spaces
          const email = String(row[2] || "").trim();
          const phone = normalizePhone(String(row[3] || ""));
          const department = String(row[4] || "").trim();
          const designation = String(row[5] || "").trim();
          const joinDateRaw = String(row[6] || "").trim();
          const employmentType = String(row[7] || "Full-Time").trim() as "Contract" | "Full-Time" | "Part-Time" | "Temporary" | "Intern";
          const empStatus = normalizeStatus(String(row[8] || "Active"));
          const gender = (() => {
            const g = String(row[9] || "").trim().toLowerCase();
            return (g === "male" || g === "female" || g === "other" ? g : "other") as "male" | "female" | "other";
          })();
          const dobRaw = String(row[10] || "").trim();
          const bloodGroup = normalizeBloodGroup(String(row[11] || ""));
          const religion = String(row[12] || "").trim();
          const nationality = String(row[13] || "Indian").trim();
          const caste = String(row[14] || "").trim();
          const maritalStatus = (() => {
            const m = String(row[15] || "").trim().toLowerCase();
            return (m === "single" || m === "married" || m === "divorced" || m === "widowed" ? m : undefined) as "single" | "married" | "divorced" | "widowed" | undefined;
          })();
          const height = row[16] ? Number(row[16]) : undefined;
          const weight = row[17] ? Number(row[17]) : undefined;
          const monthlySalary = row[18] ? Number(row[18]) : undefined;
          const aadharNumber = normalizeAadhar(String(row[19] || ""));
          const panNumber = String(row[20] || "").trim().toUpperCase();
          const address = String(row[21] || "").trim();
          const city = String(row[22] || "").trim();
          const state = String(row[23] || "").trim();
          const pincode = String(row[24] || "").trim();
          const bankAccount = String(row[25] || "").trim();
          const bankName = String(row[26] || "").trim();
          const ifscCode = String(row[27] || "").trim().toUpperCase();
          const emergencyContactName = String(row[28] || "").trim();
          const emergencyContactPhone = String(row[29] || "").trim();
          const emergencyContactRelation = String(row[30] || "").trim();

          // Validations — only critical fields are errors, rest are warnings
          if (!employeeId) errors.push("Employee ID is required");
          if (!name) errors.push("Name is required");
          if (!designation && !department) errors.push("Designation or Department is required");
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) warnings.push("Invalid email");
          if (phone && phone.length < 10) warnings.push("Phone too short");
          if (aadharNumber && aadharNumber.length !== 12) warnings.push("Aadhar not 12 digits");
          if (panNumber && panNumber.length > 0 && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(panNumber)) warnings.push("Invalid PAN");
          if (pincode && pincode.length > 0 && !/^\d{6}$/.test(pincode)) warnings.push("Invalid pincode");

          // Parse dates (lenient)
          let joinDate = "";
          if (joinDateRaw) {
            joinDate = parseDate(joinDateRaw);
            if (!joinDate) warnings.push("Could not parse join date");
          }

          let dateOfBirth = "";
          if (dobRaw) {
            dateOfBirth = parseDate(dobRaw);
            if (!dateOfBirth) warnings.push("Could not parse DOB");
          }

          parsed.push({
            row: i + 1,
            valid: errors.length === 0, // only hard errors block import
            errors: [...errors, ...warnings.map(w => `⚠ ${w}`)],
            data: {
              employeeId,
              name, email, phone, department,
              designation: designation || department || 'Unarmed Guard', // fallback
              joinDate, employmentType, status: empStatus,
              gender, dateOfBirth, bloodGroup,
              religion, nationality, caste, maritalStatus,
              height, weight, monthlySalary,
              aadharNumber, panNumber,
              address, city, state, pincode,
              bankAccount, bankName, ifscCode,
              emergencyContactName, emergencyContactPhone, emergencyContactRelation,
            }
          });
        }

        setParsedData(parsed);
        setStatus("preview");
      } catch (err) {
        toast({ title: "Parse Error", description: "Failed to read the file. Please check the format.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ title: "No Valid Data", description: "No valid rows to import. Please fix errors and try again.", variant: "destructive" });
      return;
    }

    // Check for duplicate employee IDs within the upload
    const ids = validRows.map(r => r.data.employeeId?.toUpperCase());
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      toast({ title: "Duplicate Employee IDs", description: `Duplicate IDs found: ${[...new Set(duplicates)].join(', ')}`, variant: "destructive" });
      return;
    }

    setStatus("importing");
    let success = 0;
    let failed = 0;

    for (const row of validRows) {
      try {
        const result = await addHREmployee({
          employeeId: row.data.employeeId || '',
          ...row.data,
          avatar: "",
          photoUrl: "",
          branchId: currentBranch?.code || currentBranch?.id,
        } as Omit<HREmployee, 'id'>);

        if (result.success) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setImportResults({ success, failed });
    setStatus("done");
    toast({
      title: "Import Complete",
      description: `${success} employees imported successfully${failed > 0 ? `, ${failed} failed` : ''}`
    });

    // Audit log the import
    if (success > 0) {
      const { auditActions } = await import('@/utils/auditLog');
      void auditActions.employeesImported(success);
    }
  };

  const handleClose = () => {
    setStatus("idle");
    setParsedData([]);
    setImportResults({ success: 0, failed: 0 });
    setFileName("");
    onOpenChange(false);
  };

  const validCount = parsedData.filter(r => r.valid).length;
  const errorCount = parsedData.filter(r => !r.valid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Import Employees</DialogTitle>
          <DialogDescription>
            {status === "idle" && "Download the template, fill in employee data, then upload to import"}
            {status === "preview" && `Preview: ${validCount} valid, ${errorCount} with errors from ${fileName}`}
            {status === "importing" && "Importing employees..."}
            {status === "done" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Download Template & Upload */}
        {status === "idle" && (
          <div className="space-y-6 py-4">
            {/* Step 1 */}
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-safend-red text-white text-sm font-bold shrink-0">1</div>
              <div className="flex-1">
                <h4 className="font-medium">Download Template</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Download the Excel template with column headers and one example row. Fill in your employee data following the format.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" /> Download Template (.xlsx)
                </Button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-safend-red text-white text-sm font-bold shrink-0">2</div>
              <div className="flex-1">
                <h4 className="font-medium">Upload Filled File</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload your filled Excel or CSV file. We'll validate the data before importing.
                </p>
                <div className="mt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Upload File
                  </Button>
                </div>
              </div>
            </div>

            {/* Tips */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Tips:</strong> Keep the header row as-is. Employee ID format: EMP0001. Dates should be DD/MM/YYYY. Status: Active/Inactive/On Leave/Terminated. Employment Type: Full-Time/Part-Time/Contract. Gender: Male/Female/Other. Aadhar: 12 digits. PAN: ABCDE1234F. Remove the example row before uploading.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Step 2: Preview */}
        {status === "preview" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {validCount} valid
              </Badge>
              {errorCount > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="h-3 w-3 mr-1" /> {errorCount} errors
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-auto">Only valid rows will be imported</span>
            </div>

            <ScrollArea className="h-[350px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[50px]">Row</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((item) => (
                    <TableRow key={item.row} className={!item.valid ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{item.row}</TableCell>
                      <TableCell className="font-mono text-sm">{item.data.employeeId || '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{item.data.name || '—'}</TableCell>
                      <TableCell className="text-sm">{item.data.designation || '—'}</TableCell>
                      <TableCell className="text-sm">{item.data.status || '—'}</TableCell>
                      <TableCell>
                        {item.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="text-xs text-red-600">{item.errors.join(', ')}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* Step 3: Importing */}
        {status === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-safend-red mb-4" />
            <p className="font-medium">Importing {validCount} employees...</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait, this may take a moment</p>
          </div>
        )}

        {/* Step 4: Done */}
        {status === "done" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="p-3 rounded-full bg-green-50 dark:bg-green-950/30 mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <p className="font-semibold text-lg">Import Complete</p>
            <div className="flex items-center gap-4 mt-3">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-sm px-3 py-1">
                {importResults.success} imported
              </Badge>
              {importResults.failed > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-sm px-3 py-1">
                  {importResults.failed} failed
                </Badge>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {status === "idle" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {status === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setStatus("idle"); setParsedData([]); setFileName(""); }}>Back</Button>
              <Button onClick={handleImport} disabled={validCount === 0}>
                <Upload className="h-4 w-4 mr-2" /> Import {validCount} Employee{validCount !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {status === "done" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Parse DD/MM/YYYY, M/D/YYYY, or Excel serial number to YYYY-MM-DD.
 * Handles mixed date formats intelligently:
 * - If first part > 12, it must be DD/MM/YYYY
 * - If second part > 12, it must be MM/DD/YYYY (US format)
 * - Strips trailing text like "2nd-04/03/2024" — takes only the first date
 * - Handles "May 4,2026" text dates
 */
function parseDate(raw: string): string {
  if (!raw || raw === '0') return "";

  // Strip any trailing notes like "2nd-04/03/2024" or "2nd:5/9/2023"
  // Take only the first date-like portion
  const cleaned = raw.replace(/\s{2,}.*$/, '').replace(/\s+2nd.*$/i, '').trim();

  // Try text month format: "May 4,2026" or "May 4, 2026"
  const textMonthMatch = cleaned.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (textMonthMatch) {
    const monthNames: Record<string, number> = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
      nov: 11, november: 11, dec: 12, december: 12,
    };
    const month = monthNames[textMonthMatch[1].toLowerCase()];
    if (month) {
      const day = parseInt(textMonthMatch[2]);
      const year = parseInt(textMonthMatch[3]);
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Try splitting by / - or .
  const parts = cleaned.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0]);
    let month = parseInt(parts[1]);
    const year = parseInt(parts[2]) < 100 ? parseInt(parts[2]) + 2000 : parseInt(parts[2]);

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      // Not a valid numeric date
    } else if (year >= 1900 && year <= 2100) {
      // Disambiguate DD/MM/YYYY vs M/D/YYYY
      if (day > 12 && month <= 12) {
        // day > 12 means first is definitely day (DD/MM/YYYY)
        // already correct
      } else if (month > 12 && day <= 12) {
        // month > 12 means it's actually M/D/YYYY (US format)
        [day, month] = [month, day];
      } else if (day <= 12 && month <= 12) {
        // Ambiguous — assume M/D/YYYY for this CSV (US format dominant)
        // because the CSV uses M/D/YYYY for most entries
        [day, month] = [month, day];
      }

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // Try Excel serial number
  const serial = Number(cleaned);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // Try ISO format or any parseable date string
  const isoDate = new Date(cleaned);
  if (!isNaN(isoDate.getTime()) && isoDate.getFullYear() > 1900) {
    return isoDate.toISOString().split('T')[0];
  }
  return "";
}

/**
 * Normalize an Employee ID:
 * - If it's a plain number (1, 2, 3...) → convert to EMP0001, EMP0002...
 * - If it already has EMP prefix, keep it
 * - Pad to at least 4 digits
 */
function normalizeEmployeeId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Already in correct format
  if (/^EMP\d{3,}$/i.test(trimmed)) return trimmed.toUpperCase();

  // Plain number — convert to EMP format
  const num = parseInt(trimmed);
  if (!isNaN(num) && num > 0) {
    return `EMP${String(num).padStart(4, '0')}`;
  }

  // Has some prefix but not EMP — try to extract number
  const match = trimmed.match(/(\d+)/);
  if (match) {
    return `EMP${String(parseInt(match[1])).padStart(4, '0')}`;
  }

  return trimmed;
}

/**
 * Normalize status: ACTIVE → Active, INACTIVE → Inactive, etc.
 */
function normalizeStatus(raw: string): "Active" | "Inactive" | "Terminated" | "On Leave" {
  const s = raw.trim().toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'inactive') return 'Inactive';
  if (s === 'terminated') return 'Terminated';
  if (s === 'on leave' || s === 'onleave' || s === 'on_leave') return 'On Leave';
  return 'Active';
}

/**
 * Normalize blood group: "O +ve" → "O+", "B +ve" → "B+", "A+" → "A+", etc.
 */
function normalizeBloodGroup(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Remove "ve" suffix and normalize spacing
  return trimmed
    .replace(/\s*\+\s*ve\s*/i, '+')
    .replace(/\s*-\s*ve\s*/i, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * Normalize phone: remove invalid "0" values, strip non-digits except +
 */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '0') return '';
  return trimmed.replace(/[^0-9+]/g, '');
}

/**
 * Normalize Aadhar: remove spaces, keep only digits
 */
function normalizeAadhar(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s/g, '');
}
