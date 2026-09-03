import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePostCodeFromLocation } from '@/utils/generatePostCode';

/**
 * POST /api/admin/migrate-post-codes
 * 
 * One-time migration endpoint to update all existing operational_posts
 * from the old format (POST-XXXX or POST-{uuid}-N) to the new format:
 * {serial}-{STATE}-{CITY}-{PINCODE_LAST_3}
 * 
 * Example: 01-OD-BH-031 (Bhubaneswar, Odisha, pincode ending 031)
 * 
 * Authentication: Requires admin role via Authorization header.
 * 
 * Query params:
 *  - dry_run=true  → Preview changes without writing to DB
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the user is admin
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !['admin', 'branch_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
  }

  // Check for dry run mode
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dry_run') === 'true';

  try {
    // Fetch all operational posts with their location data
    const { data: posts, error: fetchError } = await supabase
      .from('operational_posts')
      .select('id, post_code, post_name, client_name, location, work_order_id, created_at')
      .order('client_name', { ascending: true })
      .order('created_at', { ascending: true });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ message: 'No posts found', updated: 0 });
    }

    // Group posts by client_name to generate sequential serial numbers per client
    const clientGroups: Record<string, typeof posts> = {};
    for (const post of posts) {
      const clientKey = (post.client_name || 'Unknown').toLowerCase().trim();
      if (!clientGroups[clientKey]) clientGroups[clientKey] = [];
      clientGroups[clientKey].push(post);
    }

    const updates: Array<{ id: string; oldCode: string; newCode: string; postName: string; clientName: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    // Generate new codes for each client group
    for (const [_clientKey, clientPosts] of Object.entries(clientGroups)) {
      // Sort by created_at to maintain consistent ordering
      clientPosts.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateA - dateB;
      });

      for (let i = 0; i < clientPosts.length; i++) {
        const post = clientPosts[i];
        const location = post.location || {};
        const newCode = generatePostCodeFromLocation(i + 1, {
          city: location.city || '',
          state: location.state || '',
          pincode: location.pincode || '',
        });

        // Only update if the code is actually different
        if (post.post_code !== newCode) {
          updates.push({
            id: post.id,
            oldCode: post.post_code || '(empty)',
            newCode,
            postName: post.post_name || '',
            clientName: post.client_name || '',
          });
        }
      }
    }

    // If dry run, just return the preview
    if (dryRun) {
      return NextResponse.json({
        message: 'Dry run - no changes made',
        totalPosts: posts.length,
        toUpdate: updates.length,
        preview: updates.slice(0, 50), // Show first 50
      });
    }

    // Apply updates in batches
    let successCount = 0;
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('operational_posts')
        .update({ post_code: update.newCode })
        .eq('id', update.id);

      if (updateError) {
        errors.push({ id: update.id, error: updateError.message });
      } else {
        successCount++;
      }
    }

    // Also update post_code in rota_plans table if it exists (denormalized field)
    let rotaUpdated = 0;
    try {
      for (const update of updates) {
        const { error: rotaError } = await supabase
          .from('rota_plans')
          .update({ post_code: update.newCode })
          .eq('post_id', update.id);

        if (!rotaError) {
          rotaUpdated++;
        }
      }
    } catch {
      // rota_plans table may not exist yet — skip gracefully
    }

    return NextResponse.json({
      message: `Migration complete`,
      totalPosts: posts.length,
      updated: successCount,
      rotaPlansUpdated: rotaUpdated,
      skipped: posts.length - updates.length,
      errors: errors.length > 0 ? errors : undefined,
      sample: updates.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Migration failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
