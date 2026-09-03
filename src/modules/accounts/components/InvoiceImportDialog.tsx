'use client';
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
// Deferred: XLSX is large (~300KB) and only needed when user triggers import/export
const getXLSX = () => import("xlsx");
import { supabaseClient } from "@/integrations/supabase/client";
import { getBranchScope } from "@/utils/branchScope";

interface InvoiceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

/**
 * Template header matches Vyapar's "Sale Report" export columns exactly, so a raw
 * Vyapar export can be uploaded as-is. Columns are matched by name (not position),
 * and the header row is auto-detected, so extra title/"Banks"/Total rows that
 * Vyapar adds are handled automatically.
 */
const TEMPLATE_COLUMNS = [
  "Date",
  "Invoice No",
  "Party Name",
  "GSTIN",
  "Party Phone No.",
  "Total Amount",
  "Received/Paid Amount",
  "Balance Due",
  "Due Date",
  "Status",
  "Description",
];

const EXAMPLE_ROW = [
  "01/04/2026",
  "1055",
  "Gainwell Commosales Pvt. Ltd.",
  "21AAFCG8736M1ZB",
  "9437330266",
  44235,
  44235,
  0,
  "08/04/2026",
  "Paid",
  "This invoice is being issued for the month of March 2026.",
];

// Maps a normalised Vyapar header to our internal field key.
const HEADER_ALIASES: Record<string, string> = {
  "date": "date",
  "invoice no": "invoiceNo",
  "invoice number": "invoiceNo",
  "party name": "partyName",
  "gstin": "gstin",
  "party phone no.": "phone",
  "party phone no": "phone",
  "phone": "phone",
  "total amount": "totalAmount",
  "received/paid amount": "receivedAmount",
  "balance due": "balanceDue",
  "due date": "dueDate",
  "status": "status",
  "description": "description",
};

type ImportStatus = "idle" | "preview" | "importing" | "done";

interface ParsedInvoice {
  row: number;
  valid: boolean;
  errors: string[];
  data: {
    reference_number: string;
    invoice_date: string;
    client_name: string;
    description: string;
    total_amount: number;
    received_amount: number;
    balance_due: number;
    due_date: string | null;
    status: "pending" | "received" | "overdue" | "cancelled";
    notes: string | null;
  };
}

export function InvoiceImportDialog({ open, onOpenChange, onImported }: InvoiceImportDialogProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [parsedData, setParsedData] = useState<ParsedInvoice[]>([]);
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDownloadTemplate = async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, EXAMPLE_ROW]);
    ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, ws, "Sale Report");
    XLSX.writeFile(wb, "Invoice_Import_Template.xlsx");
    toast({ title: "Template Downloaded", description: "Columns match the Sale Report — you can also upload a raw export directly." });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls") && !file.name.endsWith(".csv")) {
      toast({ title: "Invalid File", description: "Please upload an Excel (.xlsx, .xls) or CSV file.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await getXLSX();
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        // Prefer a "Sale Report" sheet if present (Vyapar), else the first sheet.
        const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes("sale")) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false });

        // Find the header row (the one containing "Party Name").
        const headerIdx = rows.findIndex((r) =>
          Array.isArray(r) && r.some((c) => String(c ?? "").trim().toLowerCase() === "party name")
        );
        if (headerIdx === -1) {
          toast({ title: "Header Not Found", description: 'Could not find a "Party Name" column. Please use the template or a Sale Report export.', variant: "destructive" });
          return;
        }

        // Build a field -> column index map from the header row.
        const headerRow = rows[headerIdx] as any[];
        const col: Record<string, number> = {};
        headerRow.forEach((cell, idx) => {
          const key = HEADER_ALIASES[String(cell ?? "").trim().toLowerCase()];
          if (key && col[key] === undefined) col[key] = idx;
        });

        if (col.partyName === undefined || col.totalAmount === undefined) {
          toast({ title: "Missing Columns", description: 'The file must include at least "Party Name" and "Total Amount".', variant: "destructive" });
          return;
        }

        const get = (row: any[], key: string) => (col[key] !== undefined ? row[col[key]] : undefined);

        const parsed: ParsedInvoice[] = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.every((c) => c === undefined || c === null || String(c).trim() === "")) continue;

          const client_name = String(get(row, "partyName") ?? "").trim();
          // Skip Vyapar totals/footer rows (no party name).
          if (!client_name) continue;

          const errors: string[] = [];
          const reference_number = String(get(row, "invoiceNo") ?? "").trim();
          const invoice_date = parseDate(String(get(row, "date") ?? "").trim());
          const gstin = String(get(row, "gstin") ?? "").trim();
          const phone = String(get(row, "phone") ?? "").trim();
          const total_amount = parseAmount(get(row, "totalAmount"));
          const received_amount = parseAmount(get(row, "receivedAmount"));
          const balance_due = parseAmount(get(row, "balanceDue"));
          const due_date = parseDate(String(get(row, "dueDate") ?? "").trim());
          const statusText = String(get(row, "status") ?? "").trim();
          const description = String(get(row, "description") ?? "").trim();

          if (!total_amount || total_amount <= 0) errors.push("Total Amount must be greater than 0");

          const notesParts: string[] = [];
          if (gstin) notesParts.push(`GSTIN: ${gstin}`);
          if (phone) notesParts.push(`Phone: ${phone}`);
          if (statusText) notesParts.push(`Status: ${statusText}`);

          parsed.push({
            row: i + 1,
            valid: errors.length === 0,
            errors,
            data: {
              reference_number,
              invoice_date,
              client_name,
              description: description || `Sale — ${client_name}`,
              total_amount,
              received_amount,
              balance_due,
              due_date: due_date || null,
              status: mapStatus(statusText, balance_due, total_amount),
              notes: notesParts.length ? notesParts.join(" | ") : null,
            },
          });
        }

        if (parsed.length === 0) {
          toast({ title: "No Rows Found", description: "No invoice rows were detected below the header.", variant: "destructive" });
          return;
        }

        setParsedData(parsed);
        setStatus("preview");
      } catch {
        toast({ title: "Parse Error", description: "Failed to read the file. Please check the format.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    const validRows = parsedData.filter((r) => r.valid);
    if (validRows.length === 0) {
      toast({ title: "No Valid Data", description: "No valid rows to import. Please fix errors and try again.", variant: "destructive" });
      return;
    }

    setStatus("importing");
    const scope = getBranchScope();
    const branch_id = scope.id || scope.code || null;

    const payload = validRows.map((r) => ({
      category: "Invoices",
      description: r.data.description,
      client_name: r.data.client_name,
      // Vyapar only exports the GST-inclusive total (no taxable/GST split),
      // so we store the total as the amount with no separate tax line.
      amount: r.data.total_amount,
      gst_amount: 0,
      total_amount: r.data.total_amount,
      due_date: r.data.due_date,
      reference_number: r.data.reference_number || null,
      notes: r.data.notes,
      status: r.data.status,
      // Preserve the original Vyapar invoice date (shown as "Invoice Date").
      ...(r.data.invoice_date ? { created_at: `${r.data.invoice_date}T00:00:00.000Z` } : {}),
      ...(branch_id ? { branch_id } : {}),
    }));

    let success = 0;
    let failed = 0;
    const CHUNK = 50;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      const { data, error } = await supabaseClient.from("receivables").insert(chunk).select("id");
      if (error) {
        failed += chunk.length;
      } else {
        success += data?.length ?? chunk.length;
      }
    }

    setImportResults({ success, failed });
    setStatus("done");
    onImported?.();
    toast({
      title: "Import Complete",
      description: `${success} invoice(s) imported${failed > 0 ? `, ${failed} failed` : ""}.`,
    });
  };

  const handleClose = () => {
    setStatus("idle");
    setParsedData([]);
    setImportResults({ success: 0, failed: 0 });
    setFileName("");
    onOpenChange(false);
  };

  const validCount = parsedData.filter((r) => r.valid).length;
  const errorCount = parsedData.filter((r) => !r.valid).length;
  const inr = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

  const statusBadge = (s: ParsedInvoice["data"]["status"]) => {
    const map: Record<string, string> = {
      received: "bg-green-50 text-green-700 border-green-200",
      overdue: "bg-red-50 text-red-700 border-red-200",
      pending: "bg-amber-50 text-amber-700 border-amber-200",
      cancelled: "bg-gray-50 text-gray-600 border-gray-200",
    };
    return <Badge variant="outline" className={`capitalize ${map[s]}`}>{s}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[820px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Import Invoices</DialogTitle>
          <DialogDescription>
            {status === "idle" && "Upload a Sale Report export, or use the matching template."}
            {status === "preview" && `Preview: ${validCount} valid, ${errorCount} with errors from ${fileName}`}
            {status === "importing" && "Importing invoices..."}
            {status === "done" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <div className="space-y-6 py-4">
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-safend-red text-white text-sm font-bold shrink-0">1</div>
              <div className="flex-1">
                <h4 className="font-medium">Export the Sale Report (or download the template)</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Export your Sale Report to Excel from your billing software. You can upload that file directly. The template mirrors its columns if you'd rather fill it in manually.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" /> Download Template (.xlsx)
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-safend-red text-white text-sm font-bold shrink-0">2</div>
              <div className="flex-1">
                <h4 className="font-medium">Upload File</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload the Excel/CSV export. We'll auto-detect the header row and validate every invoice before importing.
                </p>
                <div className="mt-3">
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
                  <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Upload File
                  </Button>
                </div>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>How it maps:</strong> Invoice No → Invoice number, Party Name → Client, Date → Invoice date, Due Date → Due date, Total Amount → Amount. The status maps to Received / Overdue / Pending. Exports include only the GST-inclusive total (no tax split), so the full total is stored as the invoice amount.
              </AlertDescription>
            </Alert>
          </div>
        )}

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
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Party Name</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((item) => (
                    <TableRow key={item.row} className={!item.valid ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{item.data.reference_number || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{item.data.invoice_date || "—"}</TableCell>
                      <TableCell className="text-sm">{item.data.client_name || "—"}</TableCell>
                      <TableCell className="text-sm text-right font-medium whitespace-nowrap">{inr(item.data.total_amount)}</TableCell>
                      <TableCell>{statusBadge(item.data.status)}</TableCell>
                      <TableCell>
                        {item.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="text-xs text-red-600">{item.errors.join(", ")}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {status === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-safend-red mb-4" />
            <p className="font-medium">Importing {validCount} invoice(s)...</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait, this may take a moment</p>
          </div>
        )}

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
          {status === "idle" && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {status === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setStatus("idle"); setParsedData([]); setFileName(""); }}>Back</Button>
              <Button onClick={handleImport} disabled={validCount === 0}>
                <Upload className="h-4 w-4 mr-2" /> Import {validCount} Invoice{validCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {status === "done" && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Map a Vyapar status string to our receivable status. */
function mapStatus(statusText: string, balanceDue: number, total: number): "pending" | "received" | "overdue" | "cancelled" {
  const s = statusText.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.startsWith("paid") || s === "received") return "received";
  if (s.includes("overdue")) return "overdue";
  // Fall back to the balance when status text is missing/unknown.
  if (balanceDue <= 0 && total > 0) return "received";
  return "pending";
}

/** Parse a currency/number cell that may contain ₹, commas or spaces. */
function parseAmount(raw: any): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Parse DD/MM/YYYY, Excel serial, or ISO date to YYYY-MM-DD. */
function parseDate(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(/[\/\-.]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const serial = Number(raw);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
  }
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso.toISOString().split("T")[0];
  return "";
}
