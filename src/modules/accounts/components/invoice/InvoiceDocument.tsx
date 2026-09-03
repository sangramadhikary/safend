'use client';

/**
 * The Safend tax invoice — A4, print-exact, brand-consistent.
 *
 * Presentational only: it renders an `InvoiceDocumentModel` and computes nothing.
 * All arithmetic lives in src/lib/invoice/calculations.ts and is frozen into the
 * model at issue, so what a client received is what reprints.
 *
 * STRUCTURE — the important part.
 *
 * The page carries two documents, deliberately separated:
 *
 *   Block A  TAX INVOICE      Self-contained and Rule 46 compliant. Ends at
 *                             INVOICE VALUE, which is the dominant figure and
 *                             the amount reported in GSTR-1.
 *   Block B  PAYMENT ADVICE   A statement of account, captioned as not forming
 *                             part of the tax invoice. Carries TDS, receipts and
 *                             itemised previous dues, ending at TOTAL PAYABLE NOW.
 *
 * Previously these were fused: "Amount Due" (invoice + previous balance) was the
 * largest, reddest number on a document headed TAX INVOICE, while the actual
 * document value sat above it in smaller type. That invited clients to pay and
 * book the wrong figure and auditors to object, because a prior invoice's value
 * was being restated inside a new tax invoice.
 *
 * PRINT GEOMETRY — a fixed 210mm box with 12mm padding, and @page margin 0, so
 * screen and paper are 1:1 with no browser scaling. The payment advice is
 * allowed to break to a second page; it is a separate document, so that is
 * correct rather than a defect.
 */

import {
  INVOICE_LABELS as L,
  formatNumber,
  formatWholeNumber,
  invoiceCopyLabel,
  type InvoiceCopyType,
} from '@/lib/invoice/calculations';
import { formatServicePeriod, type InvoiceDocumentModel } from '@/lib/invoice/document';

const BRAND = '#D71920';

interface Props {
  doc: InvoiceDocumentModel;
  /** Which statutory copy this render represents. Defaults to the model's. */
  copyType?: InvoiceCopyType;
  /** Set when the invoice predates snapshotting and was recomputed to display. */
  recomputed?: boolean;
}

const money = (n: number) => `\u20B9${formatNumber(n)}`;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-[7.5pt] font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="text-[8.5pt] text-neutral-900">{value || '\u2014'}</dd>
    </>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="h-3 w-[3px] rounded-full" style={{ background: BRAND }} />
      <h3 className="text-[7.5pt] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND }}>
        {label}
      </h3>
    </div>
  );
}

export function InvoiceDocument({ doc, copyType, recomputed = false }: Props) {
  const { supplier, recipient, meta, taxInvoice: ti, advice, bank, eInvoice } = doc;
  const copy = copyType ?? meta.copyType ?? 'recipient';
  const period = formatServicePeriod(meta.servicePeriodStart, meta.servicePeriodEnd);
  const isInter = ti.taxType === 'inter';
  const isExempt = ti.taxType === 'exempt';
  const showContractPrice = ti.lines.some((l) => !l.hideWoPrice);
  const hasAdvice =
    advice.tds > 0 || advice.received > 0 || advice.previousBalance > 0;

  return (
    <>
      {/* Map the CSS page box to A4 exactly; the container supplies the margin. */}
      <style>{`@page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .invoice-sheet { box-shadow: none !important; margin: 0 !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }`}</style>

      <div
        data-invoice-print
        className="invoice-sheet mx-auto box-border w-[210mm] min-h-[297mm] bg-white p-[12mm] font-lato text-neutral-800 shadow-xl print:shadow-none"
      >
        {/* Statutory copy marking — Rule 48(1) */}
        <div className="mb-1 flex items-start justify-between">
          <span className="text-[7pt] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            {invoiceCopyLabel(copy)}
          </span>
          {recomputed && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[6.5pt] font-semibold uppercase tracking-wide text-amber-700 print:hidden">
              Recomputed — issued before snapshotting
            </span>
          )}
        </div>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="avoid-break">
          <div className="flex items-start justify-between gap-6">
            <div className="flex min-w-0 items-stretch gap-3">
              {/* Plain <img>: next/image adds a runtime wrapper and lazy loading,
                  neither of which survives print reliably. */}
              <img src="/logo.png" alt={supplier.name} className="h-[17mm] w-auto shrink-0 object-contain" />
              <div className="min-w-0 border-l-2 pl-3" style={{ borderColor: `${BRAND}33` }}>
                <p className="font-montserrat text-[13pt] font-extrabold leading-tight" style={{ color: BRAND }}>
                  {supplier.name}
                </p>
                <p className="mt-1 text-[8pt] leading-snug text-neutral-500">
                  {supplier.addressLine1}
                  <br />
                  {supplier.addressLine2}
                </p>
                <p className="mt-0.5 text-[8pt] font-medium" style={{ color: BRAND }}>
                  {supplier.email}
                  {supplier.phone ? <span className="text-neutral-400"> &nbsp;·&nbsp; {supplier.phone}</span> : null}
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <h1
                className="font-montserrat text-[17pt] font-bold uppercase leading-none tracking-[0.12em]"
                style={{ color: BRAND }}
              >
                {L.documentTitle}
              </h1>
              <dl className="mt-2 inline-grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-left">
                <Field label="GSTIN" value={supplier.gstin} />
                <Field label="State" value={supplier.state} />
                {supplier.pan && <Field label="PAN" value={supplier.pan} />}
                {supplier.cin && <Field label="CIN" value={supplier.cin} />}
              </dl>
            </div>
          </div>
          <div className="mt-2.5 h-[3px] w-full rounded-full" style={{ background: BRAND }} />
        </header>

        {/* ── Parties & invoice meta ─────────────────────────────────────── */}
        <section className="avoid-break mt-3 grid grid-cols-[1fr_1fr] gap-4">
          <div className="rounded border border-neutral-300">
            <div className="border-b border-neutral-300 bg-neutral-50 px-2.5 py-1">
              <h3 className="text-[7.5pt] font-bold uppercase tracking-wide" style={{ color: BRAND }}>
                {L.billTo}
              </h3>
            </div>
            <div className="p-2.5">
              <p className="text-[10pt] font-bold leading-tight text-neutral-900">{recipient.name || '\u2014'}</p>
              {recipient.address && (
                <p className="mt-1 text-[8pt] leading-snug text-neutral-600">{recipient.address}</p>
              )}
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                <Field label="GSTIN" value={recipient.gstin} />
                <Field label="State" value={recipient.state} />
              </dl>
            </div>
          </div>

          <div className="rounded border border-neutral-300">
            <div className="border-b border-neutral-300 bg-neutral-50 px-2.5 py-1">
              <h3 className="text-[7.5pt] font-bold uppercase tracking-wide" style={{ color: BRAND }}>
                {L.invoiceDetailsHead}
              </h3>
            </div>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 p-2.5">
              <dt className="text-[7.5pt] font-semibold uppercase tracking-wide text-neutral-500">Invoice No.</dt>
              <dd className="font-montserrat text-[11pt] font-bold leading-none" style={{ color: BRAND }}>
                {meta.invoiceNo || '\u2014'}
              </dd>
              <Field label="Date" value={meta.date} />
              <Field label="Due Date" value={meta.dueDate} />
              {/* Service period: a duty-based monthly invoice is unreadable without it. */}
              <Field label={L.servicePeriod} value={period} />
              <Field label="Place of Supply" value={meta.placeOfSupply} />
              {meta.workOrderNo && <Field label="Work Order" value={meta.workOrderNo} />}
              {meta.workOrderDate && <Field label="W.O. Date" value={meta.workOrderDate} />}
            </dl>
          </div>
        </section>

        {/* ── e-Invoice strip (Rule 48(4)) — only once an IRN exists ─────── */}
        {eInvoice.irn && (
          <section className="avoid-break mt-3 flex items-center gap-3 rounded border border-neutral-300 bg-neutral-50 p-2.5">
            {eInvoice.qr && (
              <img src={eInvoice.qr} alt="e-Invoice signed QR code" className="h-[22mm] w-[22mm] shrink-0 object-contain" />
            )}
            <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <Field label="IRN" value={<span className="break-all font-mono text-[7pt]">{eInvoice.irn}</span>} />
              <Field label="Ack No." value={eInvoice.ackNo} />
              <Field label="Ack Date" value={eInvoice.ackDate} />
            </dl>
          </section>
        )}

        {/* ── Line items ────────────────────────────────────────────────── */}
        <section className="mt-3 overflow-hidden rounded border" style={{ borderColor: BRAND }}>
          <table className="w-full border-collapse text-left">
            <thead className="text-[7.5pt] uppercase tracking-wider text-white" style={{ background: BRAND }}>
              <tr>
                <th className="w-7 px-2 py-2 text-center font-bold">#</th>
                <th className="px-2 py-2 font-bold">{L.serviceAndPost}</th>
                <th className="w-16 px-2 py-2 text-center font-bold">SAC</th>
                {showContractPrice && <th className="w-24 px-2 py-2 text-right font-bold">Contract Price</th>}
                <th className="w-14 px-2 py-2 text-center font-bold">{L.duties}</th>
                <th className="w-28 px-2 py-2 text-right font-bold">Rate / Duty</th>
                <th className="w-24 px-2 py-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody className="text-[8.5pt]">
              {ti.lines.map((line, i) => (
                <tr key={line.id ?? i} className="avoid-break border-b border-neutral-200 align-top">
                  <td className="px-2 py-2 text-center font-bold text-neutral-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <span className="font-bold text-neutral-900">{line.service}</span>
                    {line.personnel > 0 && (
                      <span className="ml-1.5 text-[7.5pt] text-neutral-500">
                        {line.personnel} {L.personnelSuffix}
                      </span>
                    )}
                    {line.post && <div className="text-[7.5pt] text-neutral-500">@ {line.post}</div>}
                  </td>
                  <td className="px-2 py-2 text-center text-[8pt] font-medium text-neutral-700">{line.sac}</td>
                  {showContractPrice && (
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {line.hideWoPrice ? '\u2014' : formatNumber(line.woPrice)}
                    </td>
                  )}
                  <td className="px-2 py-2 text-center font-semibold tabular-nums">{line.duties}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className="font-semibold text-neutral-800">₹{formatWholeNumber(line.rate)}</span>
                    {/* Printed derivation — this is what makes the line reproducible
                        with a calculator, and what exposes the contracted divisor. */}
                    <div className="text-[6.5pt] leading-tight text-neutral-400">{line.rateDerivation}</div>
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-neutral-900">
                    {formatWholeNumber(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-[8.5pt]">
              <tr className="border-t-2 bg-neutral-50" style={{ borderColor: BRAND }}>
                <td colSpan={showContractPrice ? 4 : 3} className="px-2 py-1.5 text-right text-[7.5pt] font-bold uppercase tracking-wide text-neutral-500">
                  Total
                </td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums">{ti.totalDuties}</td>
                <td />
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-neutral-900">
                  {formatWholeNumber(ti.taxableValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ── Tax summary + totals ──────────────────────────────────────── */}
        <section className="mt-3 grid grid-cols-[1fr_78mm] items-start gap-4">
          <div>
            {/* SAC-wise summary — Rule 46 requires HSN/SAC particulars, and a
                multi-service invoice is not auditable without the breakdown.
                With a single group it only restates the line and the totals
                panel, so it is omitted to keep short invoices to one page. */}
            {ti.sacSummary.length > 1 && (
              <div className="avoid-break mb-3">
                <SectionRule label={L.sacSummaryHead} />
                <table className="w-full border-collapse text-[7.5pt]">
                  <thead className="bg-neutral-100 text-neutral-600">
                    <tr>
                      <th className="border border-neutral-200 px-1.5 py-1 text-left font-bold">SAC</th>
                      <th className="border border-neutral-200 px-1.5 py-1 text-right font-bold">Taxable</th>
                      <th className="border border-neutral-200 px-1.5 py-1 text-center font-bold">Rate</th>
                      {isInter ? (
                        <th className="border border-neutral-200 px-1.5 py-1 text-right font-bold">IGST</th>
                      ) : (
                        <>
                          <th className="border border-neutral-200 px-1.5 py-1 text-right font-bold">CGST</th>
                          <th className="border border-neutral-200 px-1.5 py-1 text-right font-bold">SGST</th>
                        </>
                      )}
                      <th className="border border-neutral-200 px-1.5 py-1 text-right font-bold">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {ti.sacSummary.map((r) => (
                      <tr key={`${r.sac}-${r.gstRate}`}>
                        <td className="border border-neutral-200 px-1.5 py-1 font-medium">{r.sac}</td>
                        <td className="border border-neutral-200 px-1.5 py-1 text-right">{formatWholeNumber(r.taxableValue)}</td>
                        <td className="border border-neutral-200 px-1.5 py-1 text-center">{r.gstRate}%</td>
                        {isInter ? (
                          <td className="border border-neutral-200 px-1.5 py-1 text-right">{formatWholeNumber(r.igst)}</td>
                        ) : (
                          <>
                            <td className="border border-neutral-200 px-1.5 py-1 text-right">{formatWholeNumber(r.cgst)}</td>
                            <td className="border border-neutral-200 px-1.5 py-1 text-right">{formatWholeNumber(r.sgst)}</td>
                          </>
                        )}
                        <td className="border border-neutral-200 px-1.5 py-1 text-right font-semibold">{formatWholeNumber(r.totalTax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="avoid-break rounded border border-neutral-200 bg-neutral-50 p-3">
              <SectionRule label={L.bankDetails} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <Field label="Bank" value={bank.bankName} />
                <Field label="A/c Number" value={bank.bankAccountNo} />
                <Field label="IFSC" value={bank.ifscCode} />
                <Field label="Beneficiary" value={bank.accountName} />
              </dl>
            </div>

            {/* Words track the INVOICE VALUE, which is the statutory figure.
                The payable figure gets its own words in the advice below. */}
            <div className="avoid-break mt-3 rounded-r border-l-2 bg-neutral-50 px-3 py-2" style={{ borderColor: BRAND }}>
              <p className="text-[7pt] font-bold uppercase tracking-[0.14em] text-neutral-500">{L.totalAmountWords}</p>
              <p className="mt-0.5 text-[9.5pt] font-extrabold leading-snug text-neutral-900">{ti.invoiceTotalWords}</p>
            </div>
          </div>

          {/* Tax invoice totals — ends at INVOICE VALUE and nothing beyond. */}
          <div className="avoid-break overflow-hidden rounded border border-neutral-300">
            <table className="w-full text-[8.5pt]">
              <tbody className="tabular-nums">
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <td className="px-3 py-2 font-bold text-neutral-800">{L.taxableValue}</td>
                  <td className="px-3 py-2 text-right font-bold text-neutral-900">₹{formatWholeNumber(ti.taxableValue)}</td>
                </tr>
                {isExempt ? (
                  <tr className="border-b border-neutral-100">
                    <td className="px-3 py-1.5 text-neutral-600">GST</td>
                    <td className="px-3 py-1.5 text-right text-neutral-600">Exempt / Nil-rated</td>
                  </tr>
                ) : isInter ? (
                  <tr className="border-b border-neutral-100">
                    <td className="px-3 py-1.5 text-neutral-600">IGST @ {ti.igstRate}%</td>
                    <td className="px-3 py-1.5 text-right font-medium text-neutral-700">{formatWholeNumber(ti.igst)}</td>
                  </tr>
                ) : (
                  <>
                    <tr className="border-b border-neutral-100">
                      <td className="px-3 py-1.5 text-neutral-600">CGST @ {ti.cgstRate}%</td>
                      <td className="px-3 py-1.5 text-right font-medium text-neutral-700">{formatWholeNumber(ti.cgst)}</td>
                    </tr>
                    <tr className="border-b border-neutral-100">
                      <td className="px-3 py-1.5 text-neutral-600">SGST @ {ti.sgstRate}%</td>
                      <td className="px-3 py-1.5 text-right font-medium text-neutral-700">{formatWholeNumber(ti.sgst)}</td>
                    </tr>
                  </>
                )}
                {ti.roundOff !== 0 && (
                  <tr className="border-b border-neutral-200">
                    <td className="px-3 py-1 text-[7.5pt] italic text-neutral-400">Round off</td>
                    <td className="px-3 py-1 text-right text-[7.5pt] italic text-neutral-400">
                      {ti.roundOff >= 0 ? '+' : '\u2212'}
                      {formatNumber(Math.abs(ti.roundOff))}
                    </td>
                  </tr>
                )}
                <tr className="border-y-2 border-neutral-900 bg-white">
                  <td className="px-3 py-2.5">
                    <span className="font-montserrat text-[11pt] font-extrabold text-neutral-900">{L.invoiceTotal}</span>
                    <div className="text-[6.5pt] uppercase tracking-wide text-neutral-400">{L.invoiceTotalNote}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-montserrat text-[13pt] font-extrabold text-neutral-900">
                    {money(ti.invoiceTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Block B: PAYMENT ADVICE — statement of account ─────────────── */}
        {hasAdvice && (
          <section className="avoid-break mt-4 rounded border border-dashed border-neutral-400 bg-neutral-50/70 p-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-4">
              <h3 className="font-montserrat text-[9pt] font-bold uppercase tracking-[0.14em] text-neutral-700">
                {L.paymentAdviceHead}
              </h3>
              {advice.dueDate && (
                <span className="text-[7.5pt] font-semibold text-neutral-500">Payment due by {advice.dueDate}</span>
              )}
            </div>
            {/* The caption is what keeps this out of the tax invoice. */}
            <p className="mb-2 text-[6.5pt] italic leading-snug text-neutral-500">{L.adviceDisclaimer}</p>

            <table className="w-full text-[8.5pt] tabular-nums align-top">
              <tbody>
                <tr className="border-b border-neutral-200 align-top">
                  <td className="py-1.5 text-neutral-700">This invoice ({advice.invoiceNo})</td>
                  <td className="py-1.5 text-right font-semibold text-neutral-900">{formatNumber(advice.invoiceTotal)}</td>
                </tr>
                {advice.tds > 0 && (
                  <tr className="border-b border-neutral-200">
                    <td className="py-1.5 align-top text-neutral-700 leading-snug">
                      <span>Less: TDS @ {advice.tdsRate}% u/s 194C</span>
                      {/* TDS is the buyer's statutory obligation, not a discount
                          we grant — labelling it as such avoids the common
                          misreading that the invoice value is reduced. */}
                      <div className="text-[6.5pt] italic text-neutral-400 mt-0.5">{L.tdsNote}</div>
                    </td>
                    <td className="py-1.5 align-top text-right font-medium text-neutral-700">
                      &minus;{formatNumber(advice.tds)}
                    </td>
                  </tr>
                )}
                {advice.received > 0 && (
                  <tr className="border-b border-neutral-200">
                    <td className="py-1.5 text-neutral-700">{L.amountReceived}</td>
                    <td className="py-1.5 text-right font-medium text-neutral-700">&minus;{formatNumber(advice.received)}</td>
                  </tr>
                )}
                {advice.previousBalance !== 0 && (
                  <>
                    <tr>
                      <td className="pt-1.5 text-neutral-700">Previous outstanding</td>
                      <td className="pt-1.5 text-right font-medium text-neutral-700">
                        {advice.previousEntries.length === 0 ? formatNumber(advice.previousBalance) : ''}
                      </td>
                    </tr>
                    {/* Itemised, because a bare carried-forward figure is what
                        clients dispute and auditors query — and it gives the
                        client something they can actually reconcile. */}
                    {advice.previousEntries.map((e) => (
                      <tr key={e.referenceNumber}>
                        <td className="py-0.5 pl-4 text-[7.5pt] text-neutral-500">
                          · {e.referenceNumber}
                          {e.date ? ` · ${e.date}` : ''}
                        </td>
                        <td className="py-0.5 text-right text-[7.5pt] text-neutral-600">{formatNumber(e.amount)}</td>
                      </tr>
                    ))}
                    {advice.previousEntries.length > 0 && (
                      <tr className="border-b border-neutral-200">
                        <td className="py-1 pl-4 text-[7.5pt] font-semibold text-neutral-600">Sub-total</td>
                        <td className="py-1 text-right text-[8pt] font-semibold text-neutral-700">
                          {formatNumber(advice.previousBalance)}
                        </td>
                      </tr>
                    )}
                  </>
                )}
                <tr style={{ background: BRAND }}>
                  <td className="px-2 py-2.5 font-montserrat text-[10pt] font-extrabold uppercase tracking-wide text-white">
                    {L.amountDue}
                  </td>
                  <td className="px-2 py-2.5 text-right font-montserrat text-[13pt] font-extrabold text-white">
                    {money(advice.totalPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1.5 text-[7pt] leading-snug text-neutral-500">
              <span className="font-bold uppercase tracking-wide">{L.payableWords}:</span> {advice.totalPayableWords}
            </p>
          </section>
        )}

        {/* ── Terms, declaration, signature ─────────────────────────────── */}
        <footer className="avoid-break mt-4 border-t-2 pt-3" style={{ borderColor: BRAND }}>
          <div className="flex items-start justify-between gap-8">
            <div className="max-w-[60%] flex-1">
              <SectionRule label={L.termsAndConditions} />
              <p className="whitespace-pre-line text-[7pt] leading-[1.6] text-neutral-500">{doc.terms}</p>
              <p className="mt-2 text-[7pt] leading-snug text-neutral-600">{doc.declaration}</p>
            </div>
            <div className="w-[46mm] text-center">
              <p className="text-[7pt] text-neutral-500">For</p>
              <p className="mt-0.5 text-[8pt] font-bold leading-tight text-neutral-900">{supplier.name}</p>
              <img
                src="/Sign-transparent.png"
                alt=""
                aria-hidden="true"
                className="mx-auto my-1 h-[13mm] w-auto object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
              <div className="mx-auto w-[38mm] border-t border-neutral-700 pt-1">
                <p className="text-[6.5pt] font-bold uppercase tracking-widest text-neutral-600">Authorised Signatory</p>
              </div>
            </div>
          </div>
          <p className="mt-3 border-t border-neutral-200 pt-2 text-center text-[6.5pt] text-neutral-400">
            {L.pageFooterNote}
          </p>
        </footer>
      </div>
    </>
  );
}

export default InvoiceDocument;
