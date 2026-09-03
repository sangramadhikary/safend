/**
 * Client name normalisation — the single source of truth for deciding whether
 * two client names refer to the same customer.
 *
 * This lives in a plain util (no 'use client') because it is needed in three
 * places that cannot share a React module: the Clients directory hook, the
 * client-side ClientService, and the server-side customer backfill route.
 *
 * The normalised value is persisted as `clients.name_key` (UNIQUE), so changing
 * the rules below changes what counts as a distinct customer. Treat it as a
 * stable contract: if it must change, re-run the backfill so stored keys and
 * computed keys stay in agreement.
 */

const LEGAL_NOISE =
  /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company|enterprises|enterprise|services|service|group|and)\b/g;

/**
 * Normalise a client / company name into a stable match key so that
 * "ABC Securities Pvt. Ltd." and "abc securities" fold together.
 */
export const clientKeyOf = (name?: string | null): string => {
  const raw = (name || '').toLowerCase().trim();
  if (!raw) return '';
  const stripped = raw
    .replace(/[.,\-_'"/\\()&]/g, ' ')
    .replace(LEGAL_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || raw.replace(/\s+/g, ' ');
};
