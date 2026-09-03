'use client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Shield,
  Users,
  Receipt,
  Percent,
  ShieldCheck,
  ScrollText,
  StickyNote,
  Hash,
} from "lucide-react";

interface QuotationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: any;
}

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: "Unarmed Guards",
  armedGuards: "Armed Guards",
  supervisors: "Supervisors",
  patrolOfficers: "Patrol Officers",
  pso: "PSO",
  bouncers: "Bouncers",
  manpower: "Manpower",
};

const SHIFT_LABELS: Record<string, string> = {
  day: "Day Shift",
  afternoon: "Afternoon Shift",
  night: "Night Shift",
};

const formatDate = (date: any) => {
  if (!date) return "N/A";
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(date);
  }
};

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const calcInstanceGuards = (instance: any) => {
  if (!instance?.shifts) return 0;
  let guards = 0;
  const { day, afternoon, night } = instance.shifts;
  if (day?.enabled) guards += day.quantity || 0;
  if (afternoon?.enabled && instance.shiftType === "8H") guards += afternoon.quantity || 0;
  if (night?.enabled) guards += night.quantity || 0;
  return guards;
};

// A small reusable info card (brand-only styling)
function InfoCard({ icon, label, value, isLink, href }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  isLink?: boolean;
  href?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#D71920]/10 rounded-full shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          {isLink && href ? (
            <a href={href} className="font-medium text-sm text-[#D71920] hover:underline wrap-break-word">
              {value || "N/A"}
            </a>
          ) : (
            <p className="font-semibold wrap-break-word">{value || "N/A"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold flex items-center gap-2">
      {icon}
      {children}
    </h3>
  );
}

export function QuotationDetailModal({ isOpen, onClose, quotation }: QuotationDetailModalProps) {
  if (!quotation) return null;

  const status = quotation.status;

  // Build flat list of active service instances for breakdown
  const serviceInstances = quotation.serviceInstances || {};
  const serviceRows: Array<{
    type: string;
    label: string;
    shiftType: string;
    shift: string;
    quantity: number;
    rate: number;
    total: number;
  }> = [];

  Object.keys(serviceInstances).forEach((type) => {
    const instances = serviceInstances[type] || [];
    instances.forEach((inst: any) => {
      if (!inst?.shifts) return;
      (["day", "afternoon", "night"] as const).forEach((shift) => {
        const s = inst.shifts[shift];
        if (!s?.enabled) return;
        if (shift === "afternoon" && inst.shiftType !== "8H") return;
        serviceRows.push({
          type,
          label: SERVICE_LABELS[type] || type,
          shiftType: inst.shiftType,
          shift: SHIFT_LABELS[shift] || shift,
          quantity: s.quantity || 0,
          rate: s.rate || 0,
          total: (s.quantity || 0) * (s.rate || 0),
        });
      });
    });
  });

  const subtotal = serviceRows.reduce((sum, r) => sum + r.total, 0);
  const totalGuards = Object.keys(serviceInstances).reduce((sum, type) => {
    return sum + (serviceInstances[type] || []).reduce((g: number, inst: any) => g + calcInstanceGuards(inst), 0);
  }, 0);
  const gstRate = quotation.gstExempt ? 0 : (quotation.gstPercentage ?? 18);
  const gstAmount = subtotal * gstRate / 100;
  const computedTotal = subtotal + gstAmount;

  // Fallback to stored amount string when no breakdown is available
  const displayTotal = subtotal > 0 ? formatCurrency(computedTotal) : (quotation.amount || "₹0");

  const locations = quotation.locations || [];

  const StatusIcon =
    status === "Accepted" || status === "Approved" ? CheckCircle2 :
    status === "Rejected" ? XCircle :
    status === "Sent" ? Send : Clock;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Fixed height modal — header + banner pinned, body scrolls */}
      <DialogContent className="max-w-6xl h-[92vh] flex flex-col overflow-hidden p-0" preventOutsideClose={true}>

        {/* Pinned header */}
        <div className="px-6 pt-6 pb-3 shrink-0">
          <DialogHeader className="pb-0">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 bg-[#D71920]/10 rounded-lg">
                <FileText className="h-6 w-6 text-[#D71920]" />
              </div>
              Quotation Details
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Pinned banner */}
        <div className="px-6 shrink-0">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#D71920]/10 rounded-full">
                  <StatusIcon className="h-6 w-6 text-[#D71920]" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Quotation ID</p>
                  <p className="font-bold text-lg">{quotation.quotationId || quotation.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Badge className="bg-[#D71920] text-white hover:bg-[#D71920]">{status}</Badge>
                {quotation.pricingType && (
                  <Badge variant="outline">{quotation.pricingType}</Badge>
                )}
                {quotation.leadId && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    Lead: {quotation.leadId}
                  </Badge>
                )}
                {totalGuards > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {totalGuards} Total Guards
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold text-[#D71920]">{displayTotal}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 mt-4 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5">

            {/* Client Information */}
            <div className="space-y-3">
              <SectionHeading icon={<Building2 className="h-5 w-5 text-[#D71920]" />}>
                Client Information
              </SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoCard
                  icon={<Building2 className="h-4 w-4 text-[#D71920]" />}
                  label="Client/Company"
                  value={quotation.client || quotation.companyName || "N/A"}
                />
                <InfoCard
                  icon={<User className="h-4 w-4 text-[#D71920]" />}
                  label="Contact Person"
                  value={quotation.contactPerson}
                />
                <InfoCard
                  icon={<Mail className="h-4 w-4 text-[#D71920]" />}
                  label="Email"
                  value={quotation.contactEmail}
                  isLink={!!quotation.contactEmail}
                  href={`mailto:${quotation.contactEmail}`}
                />
                <InfoCard
                  icon={<Phone className="h-4 w-4 text-[#D71920]" />}
                  label="Phone"
                  value={quotation.contactPhone}
                  isLink={!!quotation.contactPhone}
                  href={`tel:${quotation.contactPhone}`}
                />
              </div>
              {quotation.clientAddress && (
                <InfoCard
                  icon={<MapPin className="h-4 w-4 text-[#D71920]" />}
                  label="Client Address"
                  value={quotation.clientAddress}
                />
              )}
            </div>

            {/* Tax & Compliance */}
            <div className="space-y-3">
              <SectionHeading icon={<Receipt className="h-5 w-5 text-[#D71920]" />}>
                Tax &amp; Compliance
              </SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">GST Number</p>
                  <p className="font-mono font-semibold">{quotation.gstNumber || "N/A"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">GST Rate</p>
                  <p className="font-semibold">{quotation.gstExempt ? "Exempt" : `${quotation.gstPercentage ?? 18}%`}</p>
                </div>
                {quotation.gstLegalName && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">GST Legal Name</p>
                    <p className="font-semibold">{quotation.gstLegalName}</p>
                  </div>
                )}
                {quotation.gstTradeName && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">GST Trade Name</p>
                    <p className="font-semibold">{quotation.gstTradeName}</p>
                  </div>
                )}
                {quotation.gstStatus && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">GST Status</p>
                    <p className="font-semibold">{quotation.gstStatus}</p>
                  </div>
                )}
                {quotation.gstAddress && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border sm:col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">GST Registered Address</p>
                    <p className="font-medium text-sm">{quotation.gstAddress}</p>
                  </div>
                )}
              </div>

              {(quotation.psaraCompliance || quotation.minWageCompliance) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {quotation.psaraCompliance && (
                    <Badge variant="outline" className="flex items-center gap-1 border-[#D71920] text-[#D71920]">
                      <ShieldCheck className="h-3 w-3" />
                      PSARA Compliance
                    </Badge>
                  )}
                  {quotation.minWageCompliance && (
                    <Badge variant="outline" className="flex items-center gap-1 border-[#D71920] text-[#D71920]">
                      <ShieldCheck className="h-3 w-3" />
                      Min. Wage Compliance
                    </Badge>
                  )}
                </div>
              )}

              {/* Pricing Summary */}
              {serviceRows.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Percent className="h-3 w-3" />
                      GST {quotation.gstExempt ? "(Exempt)" : `@ ${gstRate}%`}
                    </span>
                    <span className="font-medium">{formatCurrency(gstAmount)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Grand Total</span>
                    <span className="font-bold text-lg text-[#D71920]">{formatCurrency(computedTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Service & Pricing Breakdown — scrollable table */}
            {serviceRows.length > 0 && (
              <div className="space-y-3 lg:col-span-2">
                <SectionHeading icon={<Shield className="h-5 w-5 text-[#D71920]" />}>
                  Services &amp; Pricing Breakdown
                </SectionHeading>
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
                        <tr>
                          <th className="text-left font-medium px-4 py-2.5">Service</th>
                          <th className="text-left font-medium px-4 py-2.5">Shift</th>
                          <th className="text-center font-medium px-4 py-2.5">Qty</th>
                          <th className="text-right font-medium px-4 py-2.5">Rate/Month</th>
                          <th className="text-right font-medium px-4 py-2.5">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceRows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-4 py-2.5">
                              <span className="font-medium">{row.label}</span>
                              <span className="ml-2 text-xs text-muted-foreground">({row.shiftType})</span>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{row.shift}</td>
                            <td className="px-4 py-2.5 text-center">{row.quantity}</td>
                            <td className="px-4 py-2.5 text-right">{formatCurrency(row.rate)}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(row.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Locations/Posts — scrollable list */}
            {locations.length > 0 && (
              <div className="space-y-3">
                <SectionHeading icon={<MapPin className="h-5 w-5 text-[#D71920]" />}>
                  Service Locations ({locations.length})
                </SectionHeading>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {locations.map((loc: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{loc.name || `Post ${idx + 1}`}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {[loc.address, loc.city, loc.district, loc.state]
                              .filter(Boolean)
                              .join(", ")}
                            {loc.pincode ? ` - ${loc.pincode}` : ""}
                          </p>
                        </div>
                        {loc.guards ? (
                          <Badge variant="outline" className="flex items-center gap-1 shrink-0">
                            <Users className="h-3 w-3" />
                            {loc.guards} Guards
                          </Badge>
                        ) : null}
                      </div>
                      {(loc.profitMargin || loc.asPerStateMinWage) && (
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                          {loc.asPerStateMinWage && (
                            <Badge variant="secondary" className="text-xs">As per State Min. Wage</Badge>
                          )}
                          {loc.profitMargin && (
                            <Badge variant="secondary" className="text-xs">Margin: {loc.profitMargin}%</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terms & Notes */}
            {(quotation.paymentTerms || quotation.termsAndConditions || quotation.notes) && (
              <div className="space-y-3">
                <SectionHeading icon={<ScrollText className="h-5 w-5 text-[#D71920]" />}>
                  Terms &amp; Notes
                </SectionHeading>
                {quotation.paymentTerms && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Payment Terms</p>
                    <p className="font-medium text-sm leading-relaxed">{quotation.paymentTerms}</p>
                  </div>
                )}
                {quotation.termsAndConditions && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Terms &amp; Conditions</p>
                    <p className="font-medium text-sm leading-relaxed">{quotation.termsAndConditions}</p>
                  </div>
                )}
                {quotation.notes && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                      <StickyNote className="h-3 w-3" />
                      Notes
                    </p>
                    <p className="font-medium text-sm leading-relaxed">{quotation.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="space-y-3 lg:col-span-2">
              <SectionHeading icon={<Calendar className="h-5 w-5 text-[#D71920]" />}>
                Timeline
              </SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-[#D71920]" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
                  </div>
                  <p className="font-medium text-sm">{formatDate(quotation.createdAt || quotation.date)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-[#D71920]" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Valid Until</p>
                  </div>
                  <p className="font-medium text-sm">{formatDate(quotation.validUntil)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-[#D71920]" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Last Updated</p>
                  </div>
                  <p className="font-medium text-sm">{formatDate(quotation.updatedAt)}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
