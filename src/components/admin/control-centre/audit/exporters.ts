'use client';

/**
 * Audit log export formats.
 *
 * The previous implementation exported only the rows the client happened to be
 * holding — a 500-record ceiling, filtered in the browser — and flattened the
 * `details` payload to `JSON.stringify(details)` in a single cell. So an export
 * intended as evidence was both silently incomplete and unreadable in the one
 * column that carried the substance.
 *
 * Every exporter here operates on the full server-filtered result set, and each
 * expands the field-level changes into their own readable representation:
 *
 *   XLSX  two sheets — one row per entry, plus a separate normalized sheet with
 *         one row per changed field, which is what makes the export pivotable.
 *   CSV   flat, one row per entry, for ingestion into other tooling.
 *   JSON  complete and lossless, including the integrity hash, for handing to an
 *         auditor or attaching to an incident record.
 */

import type { AuditRecord } from '@/lib/audit/types';
import { summarizeDiff } from '@/lib/audit/diff';

/** Loaded on demand: the sheet library is ~300 KB. */
const getXLSX = () => import('xlsx');

/** Consistent timestamp rendering across every format. */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

/** Filename stem including the generation date. */
function fileStem(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(':', '');
  return `Safend_Audit_Log_${date}_${time}`;
}

/** Trigger a browser download for a blob. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download in
  // some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One flat row per audit entry. Shared by the XLSX and CSV exporters. */
function toFlatRows(records: readonly AuditRecord[]): Record<string, unknown>[] {
  return records.map((r, index) => ({
    'S.No': index + 1,
    'Timestamp': formatTimestamp(r.timestamp),
    'Timestamp (UTC ISO)': r.timestamp,
    'User': r.actorName,
    'Email': r.actorEmail,
    'Roles': r.actorRoles.join(', '),
    'Action': r.action,
    'Category': r.actionCategory,
    'Severity': r.severity,
    'Outcome': r.outcome,
    'Module': r.module,
    'Target': r.target,
    'Entity Type': r.entityType ?? '',
    'Entity ID': r.entityId ?? '',
    'Changed Fields': r.changedFields.join(', '),
    'Change Summary': r.changes.length > 0
      ? summarizeDiff(
          { changedFields: r.changedFields, before: r.beforeData ?? {}, after: r.afterData ?? {}, changes: r.changes, isEmpty: false },
          99
        )
      : '',
    'IP Address': r.ip,
    'Location': r.location ?? '',
    'Operating System': r.os ?? '',
    'Browser': r.browser ?? '',
    'Device': r.deviceType ?? '',
    'Route': r.route ?? '',
    'Duration (ms)': r.durationMs ?? '',
    'Error': r.errorMessage ?? '',
    'Branch': r.branchName ?? '',
    'Session ID': r.sessionId ?? '',
    'Request ID': r.requestId ?? '',
    'Has Snapshot': r.hasSnapshot ? 'Yes' : 'No',
    'Screen Heading': r.uiState?.heading ?? '',
    'Details': Object.keys(r.details).length > 0 ? JSON.stringify(r.details) : '',
    'Record ID': r.id,
    'Integrity Hash': r.entryHash ?? '',
  }));
}

/**
 * One row per changed field.
 *
 * This is the sheet that makes an export analytically useful: it can be pivoted
 * to answer "every salary change last quarter, by whom" directly, which the
 * one-row-per-entry shape cannot express because a single entry may carry twenty
 * field changes.
 */
function toChangeRows(records: readonly AuditRecord[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const r of records) {
    for (const change of r.changes) {
      rows.push({
        'Timestamp': formatTimestamp(r.timestamp),
        'User': r.actorName,
        'Email': r.actorEmail,
        'Action': r.action,
        'Module': r.module,
        'Target': r.target,
        'Entity Type': r.entityType ?? '',
        'Entity ID': r.entityId ?? '',
        'Field Path': change.path,
        'Field Label': change.label,
        'Change Type': change.kind,
        'Before': change.before === null || change.before === undefined ? '' : String(change.before),
        'After': change.after === null || change.after === undefined ? '' : String(change.after),
        'Record ID': r.id,
      });
    }
  }
  return rows;
}

/** Column widths for the entries sheet, in characters. */
const ENTRY_WIDTHS = [
  6, 22, 26, 20, 28, 18, 22, 12, 10, 10, 16, 26, 16, 18, 30, 46,
  16, 24, 18, 18, 10, 24, 12, 30, 16, 38, 38, 12, 26, 40, 38, 66,
];

/** Export the given records as a two-sheet workbook. */
export async function exportAuditToExcel(records: readonly AuditRecord[]): Promise<string> {
  const XLSX = await getXLSX();

  const entries = XLSX.utils.json_to_sheet(toFlatRows(records));
  entries['!cols'] = ENTRY_WIDTHS.map((wch) => ({ wch }));
  // Mark the header row as an autofilter range so the export is immediately
  // sortable and filterable in Excel without the recipient setting it up.
  const entryRange = entries['!ref'];
  if (entryRange) entries['!autofilter'] = { ref: entryRange };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, entries, 'Audit Entries');

  const changeRows = toChangeRows(records);
  if (changeRows.length > 0) {
    const changes = XLSX.utils.json_to_sheet(changeRows);
    changes['!cols'] = [22, 20, 28, 22, 16, 26, 16, 18, 26, 26, 12, 30, 30, 38].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, changes, 'Field Changes');
  }

  const filename = `${fileStem()}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return filename;
}

/** Export the given records as a single flat CSV. */
export async function exportAuditToCsv(records: readonly AuditRecord[]): Promise<string> {
  const XLSX = await getXLSX();
  const sheet = XLSX.utils.json_to_sheet(toFlatRows(records));
  const csv = XLSX.utils.sheet_to_csv(sheet);

  // UTF-8 BOM so Excel on Windows renders non-ASCII names correctly instead of
  // mojibake — a real problem for this dataset, which is full of Indian names.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const filename = `${fileStem()}.csv`;
  download(blob, filename);
  return filename;
}

/**
 * Export the complete records as JSON.
 *
 * Lossless, unlike the tabular formats: nested `details`, the full before/after
 * maps, the UI state, and the per-row integrity hash all survive intact, so the
 * export can be independently verified against the database later.
 */
export function exportAuditToJson(
  records: readonly AuditRecord[],
  context: { filters: Record<string, unknown>; exportedBy?: string }
): string {
  const payload = {
    meta: {
      source: 'Safend ERP — Activity & Audit Log',
      exportedAt: new Date().toISOString(),
      exportedBy: context.exportedBy ?? 'unknown',
      recordCount: records.length,
      appliedFilters: context.filters,
      note:
        'Each record carries an entryHash: a SHA-256 digest of its material fields, ' +
        'computed by the database at insert time. Recomputing it verifies the record ' +
        'was not altered after being written.',
    },
    records,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const filename = `${fileStem()}.json`;
  download(blob, filename);
  return filename;
}
