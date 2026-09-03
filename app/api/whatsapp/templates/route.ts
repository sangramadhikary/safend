import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles, hasStaffRole } from '@/lib/auth/server-session';
import {
  getAllTemplates,
  getAllTemplatesPaginated,
  getTemplateById,
  getTemplateByName,
  type WhatsAppTemplate,
  type TemplateListResponse,
} from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/templates
 *
 * Staff-only endpoint for fetching WhatsApp template details from Fast2SMS.
 * Requires FAST2SMS_WABA_ID env var for list/name lookups.
 *
 * Query params:
 *   mode        — "all" | "id" | "name" | "all-pages"  (default: "all")
 *   id          — template_id (required when mode=id)
 *   name        — template name (required when mode=name)
 *   limit       — templates per page for mode=all (default: 25, max: 100)
 *   after       — cursor for next page
 *   before      — cursor for previous page
 *   waba_id     — override FAST2SMS_WABA_ID env var
 *   status      — filter by status (APPROVED | PENDING | REJECTED) — client-side filter
 *   category    — filter by category (MARKETING | UTILITY | AUTHENTICATION) — client-side filter
 *
 * Examples:
 *   GET /api/whatsapp/templates                           — first page of all templates
 *   GET /api/whatsapp/templates?mode=all-pages            — ALL templates (auto-paginated)
 *   GET /api/whatsapp/templates?mode=id&id=920070352646140
 *   GET /api/whatsapp/templates?mode=name&name=hello_world
 *   GET /api/whatsapp/templates?status=APPROVED           — approved only (first page)
 *   GET /api/whatsapp/templates?limit=10&after=MjQZD      — paginate
 */
export async function GET(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }
  if (!hasStaffRole(await getServerRoles(user.id))) {
    return NextResponse.json({ error: 'Forbidden. Staff role required.' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'all';
  const waba_id = sp.get('waba_id') ?? undefined;
  const statusFilter = sp.get('status')?.toUpperCase() ?? null;
  const categoryFilter = sp.get('category')?.toUpperCase() ?? null;

  try {
    let result: TemplateListResponse | WhatsAppTemplate;

    switch (mode) {
      // ── Single template by Meta template ID ─────────────────────────────────
      case 'id': {
        const id = sp.get('id');
        if (!id) {
          return NextResponse.json(
            { error: 'Query param "id" is required for mode=id.' },
            { status: 400 },
          );
        }
        result = await getTemplateById(id);
        return NextResponse.json(result);
      }

      // ── Templates matching an exact name ────────────────────────────────────
      case 'name': {
        const name = sp.get('name');
        if (!name) {
          return NextResponse.json(
            { error: 'Query param "name" is required for mode=name.' },
            { status: 400 },
          );
        }
        result = await getTemplateByName(name, waba_id);
        return NextResponse.json(applyFilters(result as TemplateListResponse, statusFilter, categoryFilter));
      }

      // ── All templates — auto-paginated (fetches every page) ─────────────────
      case 'all-pages': {
        const pageSize = Math.min(Number(sp.get('limit') ?? 25), 100);
        const all = await getAllTemplatesPaginated({ waba_id, pageSize });
        const filtered = filterTemplates(all, statusFilter, categoryFilter);
        return NextResponse.json({
          data: filtered,
          total: filtered.length,
          mode: 'all-pages',
        });
      }

      // ── Default: single page with cursor pagination ──────────────────────────
      case 'all':
      default: {
        const limit = Math.min(Number(sp.get('limit') ?? 25), 100);
        const after = sp.get('after') ?? undefined;
        const before = sp.get('before') ?? undefined;
        result = await getAllTemplates({ waba_id, limit, after, before });
        return NextResponse.json(applyFilters(result as TemplateListResponse, statusFilter, categoryFilter));
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WhatsApp Templates] Error:', message);
    return NextResponse.json({ error: message || 'Failed to fetch templates.' }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterTemplates(
  templates: WhatsAppTemplate[],
  status: string | null,
  category: string | null,
): WhatsAppTemplate[] {
  return templates.filter((t) => {
    if (status && t.status.toUpperCase() !== status) return false;
    if (category && t.category.toUpperCase() !== category) return false;
    return true;
  });
}

function applyFilters(
  response: TemplateListResponse,
  status: string | null,
  category: string | null,
): TemplateListResponse {
  if (!status && !category) return response;
  return {
    ...response,
    data: filterTemplates(response.data, status, category),
  };
}
