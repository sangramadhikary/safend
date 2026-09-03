'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Send, CheckCircle, XCircle, FileText, Download,
  Clock, ArrowRight, Banknote, Package, Upload,
  AlertTriangle, ReceiptText, Edit, Trash2,
} from "lucide-react";
import { PurchaseOrder, PO_STATUS_LABELS, POStatus } from "./types";
import { useVendorStore } from "./vendorStore";
import { postPurchaseReceipt } from "../inventory/postPurchaseReceipt";
import { useInventoryStore } from "../inventory/inventoryStore";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
// Reuse the single company-identity constant rather than hardcoding the address
// a seventh time across the document generators.
import { SAFEND_SUPPLIER } from "@/lib/invoice/document";

/**
 * Escapes free text before it is interpolated into a generated print document.
 * Vendor names, item names and descriptions are user input, so without this a
 * value containing markup would be injected into the new window as HTML.
 */
const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

/**
 * Editing rewrites the line items and recomputes the totals, so it is only
 * allowed before the PO enters the money trail. Once Accounts has approved it,
 * the figures on file must stay identical to what was approved.
 */
const EDITABLE_STATUSES: POStatus[] = ['draft', 'rejected'];

/**
 * Deletion is allowed while the PO can still simply be withdrawn. From
 * `slip_generated` onward a fund slip / payment record exists, so those POs must
 * be cancelled rather than erased — deleting would destroy the audit trail.
 */
const DELETABLE_STATUSES: POStatus[] = [
  'draft', 'submitted', 'pending_approval', 'rejected', 'cancelled',
];

interface Props {
  purchaseOrder: PurchaseOrder;
  onClose: () => void;
  onStatusChange: () => void;
  /** Omitted by hosts that have no edit dialog wired — the button then hides. */
  onEdit?: (purchaseOrder: PurchaseOrder) => void;
}

export function PurchaseOrderDetail({ purchaseOrder, onClose, onStatusChange, onEdit }: Props) {
  const { updatePOStatus, updateReceivedQuantities, deletePurchaseOrder } = useVendorStore();
  const fetchInventoryItems = useInventoryStore(s => s.fetchItems);
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPostingStock, setIsPostingStock] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Invoice fields
  const [invoiceNumber, setInvoiceNumber] = useState(purchaseOrder.invoice_number || '');
  const [invoiceDate, setInvoiceDate] = useState(purchaseOrder.invoice_date || '');
  const [deliveryNotes, setDeliveryNotes] = useState(purchaseOrder.delivery_notes || '');

  // Goods received qty per item (index → qty string)
  const [receivedQtys, setReceivedQtys] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (purchaseOrder.items || []).map((item, i) => [i, item.received_quantity?.toString() ?? ''])
    )
  );

  const po = purchaseOrder;

  const handleStatusUpdate = async (newStatus: POStatus, extra?: Record<string, any>) => {
    setIsProcessing(true);
    const result = await updatePOStatus(po.id, newStatus, extra);
    setIsProcessing(false);
    if (result.success) {
      toast({ title: "Status Updated", description: `PO ${po.po_number} is now "${PO_STATUS_LABELS[newStatus]}"` });
      onStatusChange();
    } else {
      toast({ title: "Error", description: result.error || "Failed to update status", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deletePurchaseOrder(po.id);
    setIsDeleting(false);
    setShowDeleteDialog(false);
    if (result.success) {
      toast({ title: "Purchase Order Deleted", description: `${po.po_number} has been removed.` });
      // Same callback the status flow uses: refreshes the list and closes this modal.
      onStatusChange();
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete purchase order", variant: "destructive" });
    }
  };

  const handleGenerateSlip = async () => {
    await handleStatusUpdate('slip_generated', { slip_generated_by: 'admin' });
    generateFundSlipPDF();
  };

  const handleReceiveGoods = async () => {
    const qtys = (po.items || []).map((_, i) => parseFloat(receivedQtys[i] || '0') || 0);
    const allReceived = (po.items || []).every((item, i) => qtys[i] >= item.quantity);
    const newStatus: POStatus = allReceived ? 'received' : 'partially_received';

    // 1. Write received_quantity to each line item row in DB
    const itemUpdates = (po.items || [])
      .filter(item => item.id) // only items with a real DB id
      .map((item, i) => ({ id: item.id!, received_quantity: qtys[i] }));

    if (itemUpdates.length > 0) {
      const qtyResult = await updateReceivedQuantities(po.id, itemUpdates);
      if (!qtyResult.success) {
        toast({ title: 'Error saving received quantities', description: qtyResult.error, variant: 'destructive' });
        return;
      }
    }

    // 2. Update PO status + invoice fields
    await handleStatusUpdate(newStatus, {
      delivery_notes: deliveryNotes || undefined,
      invoice_number: invoiceNumber || undefined,
      invoice_date: invoiceDate || undefined,
    });

    // 3. Credit the received goods to inventory stock. Previously this step did not
    // exist, so a PO could show every line fully received while stock never moved.
    await postReceivedGoodsToInventory(qtys);
  };

  /**
   * Credit received quantities to inventory.
   *
   * Safe to call repeatedly: the posting routine derives what it still owes from
   * the stock ledger, so a partial receipt followed by a full one credits only the
   * increment. `quantities` defaults to the quantities already saved on the PO,
   * which is what the "Post to Inventory" recovery action passes.
   */
  const postReceivedGoodsToInventory = async (quantities?: number[]) => {
    const lines = (po.items || []).map((item, i) => ({
      lineId: item.id,
      inventoryItemId: (item as any).inventory_item_id ?? null,
      itemName: item.item_name,
      receivedQuantity: quantities ? quantities[i] : (item.received_quantity || 0),
    }));

    if (!lines.some((l) => l.receivedQuantity > 0)) return;

    setIsPostingStock(true);
    try {
      const result = await postPurchaseReceipt({
        poNumber: po.po_number,
        branchId: po.branch_id,
        lines,
        performedBy: 'admin',
      });

      if (!result.success) {
        toast({
          title: 'Stock not updated',
          description: `${result.error} — received quantities were saved, so you can retry with "Post to Inventory".`,
          variant: 'destructive',
        });
        return;
      }

      // Refresh so the inventory screens reflect the new figures immediately.
      if (result.posted.length > 0) await fetchInventoryItems(po.branch_id);

      const unresolved = result.skipped.filter((s) => !s.reason.startsWith('already posted') && s.reason !== 'nothing received yet');

      if (result.posted.length > 0) {
        toast({
          title: `Inventory updated — ${result.posted.length} item(s)`,
          description: result.posted
            .map((p) => `${p.itemName}: ${p.previousStock} → ${p.newStock} (+${p.quantity})`)
            .join('; '),
        });
      } else if (unresolved.length === 0) {
        toast({ title: 'Inventory already up to date', description: 'These goods were posted previously.' });
      }

      if (unresolved.length > 0) {
        toast({
          title: `${unresolved.length} line(s) could not be posted`,
          description: unresolved.map((s) => `${s.itemName} — ${s.reason}`).join('; '),
          variant: 'destructive',
        });
      }
    } finally {
      setIsPostingStock(false);
    }
  };

  /**
   * Renders the purchase order itself as a print document. Available at every
   * status — unlike the fund slip, which only exists once Accounts has approved.
   * Opens the browser print dialog, where "Save as PDF" produces the file.
   */
  const downloadPO = () => {
    const itemRows = (po.items || []).map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td><strong>${esc(item.item_name)}</strong>${item.description ? `<div class="sub">${esc(item.description)}</div>` : ''}</td>
        <td class="c">${esc(item.quantity)}</td>
        <td class="c">${esc(item.unit)}</td>
        <td class="r">&#8377;${item.unit_price.toLocaleString()}</td>
        <td class="r"><strong>&#8377;${item.total_price.toLocaleString()}</strong></td>
      </tr>`).join('');

    const metaRow = (label: string, value: string) =>
      `<div class="meta"><span class="lbl">${esc(label)}</span><span>${esc(value)}</span></div>`;

    const content = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Purchase Order ${esc(po.po_number)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 12px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start;
                border-bottom: 3px solid #B91C1C; padding-bottom: 12px; margin-bottom: 18px; }
        .co { font-size: 17px; font-weight: bold; color: #B91C1C; margin: 0 0 4px; }
        .co-line { color: #555; font-size: 11px; line-height: 1.45; }
        .doc-title { font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: right; margin: 0; }
        .status { text-align: right; font-size: 11px; color: #555; margin-top: 4px; }
        .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
        .box { border: 1px solid #ddd; border-radius: 4px; padding: 10px 12px; }
        .box h3 { margin: 0 0 8px; font-size: 10px; text-transform: uppercase;
                  letter-spacing: 1px; color: #777; }
        .meta { display: flex; justify-content: space-between; gap: 12px; margin: 3px 0; }
        .meta .lbl { color: #777; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { border: 1px solid #ddd; padding: 7px 8px; text-align: left; vertical-align: top; }
        th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #555; }
        td.c, th.c { text-align: center; }
        td.r, th.r { text-align: right; }
        .sub { color: #777; font-size: 10px; margin-top: 2px; }
        .totals { margin-top: 14px; display: flex; justify-content: flex-end; }
        .totals table { width: 260px; }
        .totals td { border: none; padding: 4px 0; }
        .totals .grand td { border-top: 2px solid #111; font-size: 14px; font-weight: bold; padding-top: 8px; }
        .notes { margin-top: 18px; font-size: 11px; }
        .notes h3 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; margin-top: 48px; }
        .sig { border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 10px; color: #555; }
      </style></head><body>
      <div class="head">
        <div>
          <p class="co">${esc(SAFEND_SUPPLIER.name)}</p>
          <div class="co-line">
            ${esc(SAFEND_SUPPLIER.addressLine1)}<br>
            ${esc(SAFEND_SUPPLIER.addressLine2)}<br>
            ${esc(SAFEND_SUPPLIER.email)} &nbsp;&middot;&nbsp; ${esc(SAFEND_SUPPLIER.phone)}<br>
            GSTIN: ${esc(SAFEND_SUPPLIER.gstin)}
          </div>
        </div>
        <div>
          <p class="doc-title">PURCHASE ORDER</p>
          <div class="status">
            ${esc(po.po_number)}<br>
            Status: ${esc(PO_STATUS_LABELS[po.status])}
          </div>
        </div>
      </div>

      <div class="cols">
        <div class="box">
          <h3>Vendor</h3>
          ${metaRow('Name', po.vendor_name || '—')}
          ${metaRow('Category', po.vendor_category || '—')}
        </div>
        <div class="box">
          <h3>Order Details</h3>
          ${metaRow('PO Number', po.po_number)}
          ${metaRow('Created', format(new Date(po.created_at), 'dd MMM yyyy'))}
          ${metaRow('Priority', po.priority.toUpperCase())}
          ${po.expected_delivery ? metaRow('Expected Delivery', format(new Date(po.expected_delivery), 'dd MMM yyyy')) : ''}
        </div>
      </div>

      <table>
        <thead><tr>
          <th class="c">#</th><th>Item</th><th class="c">Qty</th>
          <th class="c">Unit</th><th class="r">Unit Price</th><th class="r">Total</th>
        </tr></thead>
        <tbody>${itemRows || '<tr><td colspan="6" class="c">No line items</td></tr>'}</tbody>
      </table>

      <div class="totals"><table>
        <tr><td>Subtotal</td><td class="r">&#8377;${po.total_amount.toLocaleString()}</td></tr>
        <tr><td>GST (18%)</td><td class="r">&#8377;${po.tax_amount.toLocaleString()}</td></tr>
        <tr class="grand"><td>Grand Total</td><td class="r">&#8377;${po.grand_total.toLocaleString()}</td></tr>
      </table></div>

      ${po.description ? `<div class="notes"><h3>Notes</h3>${esc(po.description)}</div>` : ''}

      <div class="sigs">
        <div class="sig">Prepared By</div>
        <div class="sig">Approved By</div>
        <div class="sig">Vendor Acknowledgement</div>
      </div>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast({
        title: 'Popup blocked',
        description: 'Allow popups for this site, then try Download PO again.',
        variant: 'destructive',
      });
      return;
    }
    w.document.write(content);
    w.document.close();
    w.focus();
    w.print();
  };

  const generateFundSlipPDF = () => {
    const slipContent = `<html><head><title>Fund Request Slip - ${esc(po.po_number)}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:20px;margin-bottom:30px}.header h1{margin:0;font-size:24px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:30px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:10px;text-align:left;font-size:13px}th{background:#f5f5f5}.totals{text-align:right;margin-top:20px}.totals .row{display:flex;justify-content:flex-end;gap:40px;margin:5px 0}.totals .grand{font-size:18px;font-weight:bold;border-top:2px solid #333;padding-top:10px}.signatures{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;margin-top:60px}.sig-box{text-align:center;border-top:1px solid #333;padding-top:10px;font-size:12px}</style>
      </head><body>
      <div class="header"><h1>FUND REQUEST SLIP</h1><p>PO: ${esc(po.po_number)}</p><p>Date: ${format(new Date(), 'dd/MM/yyyy')}</p></div>
      <div class="info-grid"><div><label style="font-weight:bold;font-size:12px;color:#666;display:block">Vendor</label><span>${esc(po.vendor_name)}</span></div><div><label style="font-weight:bold;font-size:12px;color:#666;display:block">Priority</label><span>${esc(po.priority.toUpperCase())}</span></div><div><label style="font-weight:bold;font-size:12px;color:#666;display:block">Purpose</label><span>${esc(po.title)}</span></div><div><label style="font-weight:bold;font-size:12px;color:#666;display:block">Expected Delivery</label><span>${esc(po.expected_delivery || 'Not specified')}</span></div></div>
      <table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>${(po.items || []).map((item, idx) => `<tr><td>${idx + 1}</td><td>${esc(item.item_name)}</td><td>${esc(item.quantity)}</td><td>${esc(item.unit)}</td><td>₹${item.unit_price.toLocaleString()}</td><td>₹${item.total_price.toLocaleString()}</td></tr>`).join('')}</tbody></table>
      <div class="totals"><div class="row"><span>Subtotal:</span><span>₹${po.total_amount.toLocaleString()}</span></div><div class="row"><span>GST (18%):</span><span>₹${po.tax_amount.toLocaleString()}</span></div><div class="row grand"><span>Grand Total:</span><span>₹${po.grand_total.toLocaleString()}</span></div></div>
      <div class="signatures"><div class="sig-box">Requested By</div><div class="sig-box">Approved By</div><div class="sig-box">Accounts</div></div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(slipContent); w.document.close(); w.print(); }
  };

  // ── Status timeline ──────────────────────────────────────────────────────────
  const statusFlow: POStatus[] = ['draft', 'submitted', 'approved', 'slip_generated', 'funded', 'ordered', 'partially_received', 'received', 'completed'];
  const currentStepIndex = statusFlow.indexOf(po.status);

  // ── Actions per status ───────────────────────────────────────────────────────
  const getActions = () => {
    switch (po.status) {
      case 'draft':
        return (
          <Button onClick={() => handleStatusUpdate('submitted', { submitted_by: 'admin' })} disabled={isProcessing}>
            <Send className="h-4 w-4 mr-2" /> Submit to Accounts for Approval
          </Button>
        );
      case 'submitted':
      case 'pending_approval':
        // Approval is the Accounts team's job (Accounts → Payables → Approve).
        // No action available from the Office Admin view in this state.
        return null;
      case 'approved':
        return (
          <Button onClick={handleGenerateSlip} disabled={isProcessing}>
            <FileText className="h-4 w-4 mr-2" /> Generate Fund Slip (PDF)
          </Button>
        );
      case 'slip_generated':
        return (
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateFundSlipPDF}>
              <Download className="h-4 w-4 mr-2" /> Re-print Slip
            </Button>
            <Button onClick={() => handleStatusUpdate('funded')} disabled={isProcessing}>
              <Banknote className="h-4 w-4 mr-2" /> Mark as Funded (Payment Made)
            </Button>
          </div>
        );
      case 'funded':
        return (
          <Button onClick={() => handleStatusUpdate('ordered')} disabled={isProcessing}>
            <Package className="h-4 w-4 mr-2" /> Mark as Ordered
          </Button>
        );
      default:
        return null;
    }
  };

  // Goods received progress
  const totalOrdered = (po.items || []).reduce((s, i) => s + i.quantity, 0);
  const totalReceived = (po.items || []).reduce((s, i) => s + (i.received_quantity || 0), 0);
  const receivedPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  const canEdit = EDITABLE_STATUSES.includes(po.status);
  const canDelete = DELETABLE_STATUSES.includes(po.status);

  return (
    // min-w-0 matters: DialogContent is a CSS grid, and a grid item defaults to
    // min-width:auto. Without this the widest unshrinkable child (the line-items
    // table, the nowrap action buttons) sets the track's min size and the whole
    // panel overflows to the right, clipping the Workflow card, the Total column,
    // the totals and the footer button. With min-w-0 the inner overflow-auto
    // wrappers scroll instead.
    <div className="min-w-0 space-y-5">

      {/* ── Status timeline ── */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-1 min-w-max">
          {statusFlow.map((status, idx) => {
            const done = idx < currentStepIndex && !['rejected', 'cancelled'].includes(po.status);
            const current = status === po.status;
            return (
              <div key={status} className="flex items-center">
                <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                  current ? "bg-primary text-primary-foreground"
                  : done ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
                )}>
                  {done && <CheckCircle className="h-3 w-3" />}
                  {current && <Clock className="h-3 w-3" />}
                  {PO_STATUS_LABELS[status]}
                </div>
                {idx < statusFlow.length - 1 && (
                  <ArrowRight className={cn("h-3 w-3 mx-0.5", done ? "text-green-500" : "text-muted-foreground")} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Rejection banner ── */}
      {po.status === 'rejected' && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
            <XCircle className="h-4 w-4" /> Purchase Order Rejected
          </div>
          <p className="text-sm text-red-600">{po.rejection_reason || 'No reason provided'}</p>
        </div>
      )}

      {/* ── Waiting for accounts banner ── */}
      {(po.status === 'submitted' || po.status === 'pending_approval') && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-400">
            This PO has been submitted to Accounts for payment approval.
          </p>
        </div>
      )}

      {/* ── PO Info + Workflow ── */}
      <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="min-w-0">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">PO Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">PO Number</span><span className="font-mono text-xs font-medium">{po.po_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span>{po.vendor_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><Badge variant="outline" className="text-xs">{po.priority}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{format(new Date(po.created_at), 'dd MMM yyyy')}</span></div>
            {po.expected_delivery && <div className="flex justify-between"><span className="text-muted-foreground">Expected Delivery</span><span>{format(new Date(po.expected_delivery), 'dd MMM yyyy')}</span></div>}
            {po.description && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Notes</span><span className="text-right max-w-[60%] wrap-break-word">{po.description}</span></div>}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Workflow</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {po.submitted_by && <div className="flex justify-between"><span className="text-muted-foreground">Submitted By</span><span>{po.submitted_by}</span></div>}
            {po.submitted_at && <div className="flex justify-between"><span className="text-muted-foreground">Submitted At</span><span>{format(new Date(po.submitted_at), 'dd MMM yyyy HH:mm')}</span></div>}
            {po.approved_by && <div className="flex justify-between"><span className="text-muted-foreground">Approved By</span><span>{po.approved_by}</span></div>}
            {po.approved_at && <div className="flex justify-between"><span className="text-muted-foreground">Approved At</span><span>{format(new Date(po.approved_at), 'dd MMM yyyy HH:mm')}</span></div>}
            {po.slip_number && <div className="flex justify-between"><span className="text-muted-foreground">Slip #</span><span className="font-mono text-xs">{po.slip_number}</span></div>}
            {po.fund_received_at && <div className="flex justify-between"><span className="text-muted-foreground">Funded At</span><span>{format(new Date(po.fund_received_at), 'dd MMM yyyy HH:mm')}</span></div>}
            {po.invoice_number && <div className="flex justify-between"><span className="text-muted-foreground">Invoice #</span><span className="font-mono text-xs">{po.invoice_number}</span></div>}
            {po.actual_delivery && <div className="flex justify-between"><span className="text-muted-foreground">Received On</span><span>{format(new Date(po.actual_delivery), 'dd MMM yyyy')}</span></div>}
          </CardContent>
        </Card>
      </div>

      {/* ── Items Table ── */}
      <Card className="min-w-0">
        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Line Items</CardTitle></CardHeader>
        <CardContent className="min-w-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-center">Ordered</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {['ordered', 'partially_received', 'received', 'completed'].includes(po.status) && (
                  <TableHead className="text-center">Received</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(po.items || []).map((item, idx) => {
                const recvd = item.received_quantity ?? 0;
                const isFull = recvd >= item.quantity;
                return (
                  <TableRow key={item.id || idx}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right">₹{item.unit_price.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">₹{item.total_price.toLocaleString()}</TableCell>
                    {['ordered', 'partially_received', 'received', 'completed'].includes(po.status) && (
                      <TableCell className="text-center">
                        <span className={cn("text-xs font-semibold", isFull ? "text-green-600" : recvd > 0 ? "text-amber-600" : "text-muted-foreground")}>
                          {recvd}/{item.quantity}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Totals ── */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{po.total_amount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">GST (18%)</span><span>₹{po.tax_amount.toLocaleString()}</span></div>
          <Separator />
          <div className="flex justify-between font-bold text-base"><span>Grand Total</span><span>₹{po.grand_total.toLocaleString()}</span></div>
        </div>
      </div>

      {/* ── Invoice + Goods Received (shown when ordered or partially received) ── */}
      {['ordered', 'partially_received'].includes(po.status) && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-muted-foreground" /> Invoice & Goods Received
            </h3>

            {/* Invoice fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-no" className="text-xs">Invoice Number</Label>
                <Input id="inv-no" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-date" className="text-xs">Invoice Date</Label>
                <Input id="inv-date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Upload Invoice (PDF/Image)</Label>
                <label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 h-9 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Upload className="h-4 w-4 shrink-0" />
                  <span className="truncate">Choose file…</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) toast({ title: "Invoice attached", description: file.name });
                    }} />
                </label>
              </div>
            </div>

            {/* Received quantities per item */}
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Ordered</TableHead>
                    <TableHead className="text-center w-32">Qty Received *</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(po.items || []).map((item, idx) => {
                    const qty = parseFloat(receivedQtys[idx] || '0') || 0;
                    const isFull = qty >= item.quantity;
                    const isPartial = qty > 0 && qty < item.quantity;
                    return (
                      <TableRow key={item.id || idx}>
                        <TableCell className="font-medium text-sm">{item.item_name}</TableCell>
                        <TableCell className="text-center">{item.quantity} {item.unit}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={receivedQtys[idx] ?? ''}
                            onChange={e => setReceivedQtys(prev => ({ ...prev, [idx]: e.target.value }))}
                            className="h-8 w-24 text-center mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {isFull
                            ? <span className="text-xs font-medium text-green-600 flex items-center justify-center gap-1"><CheckCircle className="h-3 w-3" /> Full</span>
                            : isPartial
                            ? <span className="text-xs font-medium text-amber-600 flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" /> Partial</span>
                            : <span className="text-xs text-muted-foreground">Pending</span>
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Delivery notes */}
            <div className="space-y-1.5">
              <Label htmlFor="del-notes" className="text-xs">Delivery Notes</Label>
              <Textarea id="del-notes" value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} placeholder="Any notes about the delivery, condition of goods, discrepancies…" rows={2} />
            </div>

            <Button onClick={handleReceiveGoods} disabled={isProcessing}>
              <Package className="h-4 w-4 mr-2" /> Confirm Goods Received
            </Button>
          </div>
        </>
      )}

      {/* ── Received summary ── */}
      {['received', 'completed'].includes(po.status) && totalOrdered > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Goods Received</span>
              <span className={cn("font-semibold", receivedPct === 100 ? "text-green-600" : "text-amber-600")}>
                {totalReceived}/{totalOrdered} units ({receivedPct}%)
              </span>
            </div>
            <Progress value={receivedPct} className="h-2" />
            {/* Recovery action for orders received before stock posting existed, or
                where a posting failed part-way. Idempotent — the routine credits
                only what the stock ledger is still missing, so pressing it twice
                cannot double count. */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Stock is credited automatically on receipt. Use this if inventory does not reflect this order.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => postReceivedGoodsToInventory()}
                disabled={isPostingStock || totalReceived === 0}
              >
                <Package className="h-4 w-4 mr-2" />
                {isPostingStock ? 'Posting…' : 'Post to Inventory'}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Actions ──
          flex-wrap is load-bearing: the status buttons carry long nowrap labels
          ("Submit to Accounts for Approval", "Mark as Funded (Payment Made)") and
          without wrapping they push the whole modal wider than its panel. */}
      <Separator />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={downloadPO}>
            <Download className="h-4 w-4 mr-2" /> Download PO
          </Button>
          {onEdit && canEdit && (
            <Button
              variant="outline"
              onClick={() => onEdit(po)}
              disabled={isProcessing || isDeleting}
            >
              <Edit className="h-4 w-4 mr-2" /> Edit PO
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isProcessing || isDeleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete PO
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">{getActions()}</div>
      </div>

      {!canEdit && !canDelete && (
        <p className="text-xs text-muted-foreground">
          A fund slip has already been raised for this PO, so it can no longer be
          edited or deleted. Cancel it instead if it should not proceed.
        </p>
      )}

      {/* ── Delete confirmation ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="z-300">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {po.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the purchase order and all {(po.items || []).length} of
              its line items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete PO"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
