-- ============================================================
-- Fix RBAC Bugs — Role-Based Access Control Corrections
-- Date: 2026-06-30
--
-- Fixes:
-- 1. Split overly-permissive `users_authenticated_self` FOR ALL policy
--    into separate SELECT/UPDATE-only policies (prevents self-delete).
-- 2. Add `branch_admin` to all admin-level write policies.
-- 3. Fix infinite RLS recursion on user_roles by using a SECURITY DEFINER
--    helper function.
-- 4. Remove overly-permissive anon policies.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. HELPER FUNCTION — breaks RLS recursion
--    Policies on user_roles that check user_roles cause infinite loops.
--    This SECURITY DEFINER function bypasses RLS to check admin status.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_or_branch_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id
      AND role IN ('admin', 'branch_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_branch_admin(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 1. USERS TABLE — Replace FOR ALL self-access with SELECT + UPDATE only
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_authenticated_self" ON users;
DROP POLICY IF EXISTS "Allow all for authenticated" ON users;
DROP POLICY IF EXISTS "users_anon_all" ON users;

-- User can read their own row
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- User can update their own row (profile edits)
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin/branch_admin can read all users
DROP POLICY IF EXISTS "users_select_admin" ON users;
CREATE POLICY "users_select_admin" ON users
  FOR SELECT TO authenticated
  USING (public.is_admin_or_branch_admin(auth.uid()));

-- Admin/branch_admin can write (insert/update/delete) any user row
DROP POLICY IF EXISTS "users_write_admin" ON users;
CREATE POLICY "users_write_admin" ON users
  FOR ALL TO authenticated
  USING (public.is_admin_or_branch_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_branch_admin(auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 2. BRANCHES TABLE — remove anon access, add branch_admin write
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "branches_allow_all_anon" ON branches;
DROP POLICY IF EXISTS "branches_allow_all_authenticated" ON branches;

-- All authenticated users can read branches (needed for BranchContext)
DROP POLICY IF EXISTS "branches_select_authenticated" ON branches;
CREATE POLICY "branches_select_authenticated" ON branches
  FOR SELECT TO authenticated
  USING (true);

-- Only admin/branch_admin can write to branches
DROP POLICY IF EXISTS "branches_write_admin" ON branches;
CREATE POLICY "branches_write_admin" ON branches
  FOR ALL TO authenticated
  USING (public.is_admin_or_branch_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_branch_admin(auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 3. USER_ROLES TABLE — fix write policy with non-recursive helper
--    The pre-existing "Allow authenticated users to read all roles"
--    policy (USING true, FOR SELECT) already covers all read access.
--    We only need the write policy here.
-- ────────────────────────────────────────────────────────────

-- Remove any redundant SELECT policies that could trigger recursion
DROP POLICY IF EXISTS "user_roles_select_own" ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_admin" ON user_roles;

-- Admin/branch_admin can manage role assignments (non-recursive via helper)
DROP POLICY IF EXISTS "user_roles_write_admin" ON user_roles;
CREATE POLICY "user_roles_write_admin" ON user_roles
  FOR ALL TO authenticated
  USING (public.is_admin_or_branch_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_branch_admin(auth.uid()));
