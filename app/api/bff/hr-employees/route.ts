import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: HR Employee Directory
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Returns all data the Employee Directory tab needs in a SINGLE request:
 * - Status counts (active, inactive, terminated, etc.)
 * - Department breakdown (for pie chart)
 * - Tenure breakdown (for bar chart)
 * - Age breakdown (for donut chart)
 * - Letter counts (for alphabet nav)
 * - First page of employees (letter 'A' or requested letter)
 *
 * This eliminates:
 * - The full-table subscription (subscribeToHREmployees)
 * - The separate letter counts fetch
 * - The separate employees-by-letter fetch
 * All replaced by one lightweight server-side aggregation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const HR_ALLOWED_ROLES = ['hr', 'admin', 'branch_admin'];

// Only select columns needed for the employee cards/list view
const EMPLOYEE_LIST_COLUMNS = 'id, employee_id, name, department, designation, status, date_of_birth, join_date, gender, phone, email, photo_url, height, weight, branch_id, medical_conditions, highest_qualification';

export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: HR_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const branchId = request.nextUrl.searchParams.get('branchId');
  const letter = request.nextUrl.searchParams.get('letter') || 'A';
  const search = request.nextUrl.searchParams.get('search') || '';

  // Advanced search parameters (only confirmed employees-table columns)
  const advDepartment = request.nextUrl.searchParams.get('adv_department')?.trim() || '';
  const advDesignation = request.nextUrl.searchParams.get('adv_designation')?.trim() || '';
  const advStatuses = (request.nextUrl.searchParams.get('adv_statuses') || '')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);
  const advGender = request.nextUrl.searchParams.get('adv_gender')?.trim() || '';
  const advReligion = request.nextUrl.searchParams.get('adv_religion')?.trim() || '';
  const advJoinFrom = request.nextUrl.searchParams.get('adv_join_from') || '';
  const advJoinTo = request.nextUrl.searchParams.get('adv_join_to') || '';
  const advAgeFrom = request.nextUrl.searchParams.get('adv_age_from') || '';
  const advAgeTo = request.nextUrl.searchParams.get('adv_age_to') || '';
  const advHeightFrom = request.nextUrl.searchParams.get('adv_height_from') || '';
  const advHeightTo = request.nextUrl.searchParams.get('adv_height_to') || '';
  const advWeightFrom = request.nextUrl.searchParams.get('adv_weight_from') || '';
  const advWeightTo = request.nextUrl.searchParams.get('adv_weight_to') || '';
  const advSalaryFrom = request.nextUrl.searchParams.get('adv_salary_from') || '';
  const advSalaryTo = request.nextUrl.searchParams.get('adv_salary_to') || '';
  const advPhoto = request.nextUrl.searchParams.get('adv_photo') || '';
  const advContact = request.nextUrl.searchParams.get('adv_contact') || '';
  const advBirthday = request.nextUrl.searchParams.get('adv_birthday') || '';
  const advProfile = request.nextUrl.searchParams.get('adv_profile') || '';
  const advPostedToday = request.nextUrl.searchParams.get('adv_posted_today') || '';
  const advMedical = request.nextUrl.searchParams.get('adv_medical') || '';
  const advEducation = request.nextUrl.searchParams.get('adv_education') || '';

  const hasAdvancedSearch = Boolean(
    advDepartment || advDesignation || advStatuses.length || advGender || advReligion ||
    advJoinFrom || advJoinTo || advAgeFrom || advAgeTo || advHeightFrom || advHeightTo ||
    advWeightFrom || advWeightTo || advSalaryFrom || advSalaryTo || advPhoto || advContact ||
    advBirthday || advProfile || advPostedToday || advMedical || advEducation
  );

  try {
    // If searching, return search results instead of letter-based data
    if (search.trim()) {
      const safeTerm = search.replace(/[^a-zA-Z0-9 '\-\+]/g, '').trim();
      if (!safeTerm) {
        return NextResponse.json({ employees: [], total: 0 });
      }

      // Build OR conditions for search
      let orConditions = `name.ilike.%${safeTerm}%,employee_id.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%,department.ilike.%${safeTerm}%`;

      // If the search term is purely numeric, enhance matching
      const numericOnly = safeTerm.replace(/\D/g, '');
      if (numericOnly.length > 0 && numericOnly === safeTerm) {
        // Match against the numeric part of employee_id
        // e.g. searching "843" should match "EMP0843", searching "1" should match "EMP0001"
        const paddedId = `EMP${numericOnly.padStart(4, '0')}`;
        orConditions += `,employee_id.ilike.%${paddedId}%`;
        // Also match without padding for IDs with more digits
        orConditions += `,employee_id.ilike.%EMP%${numericOnly}%`;

        // Match 10-digit mobile numbers (may be stored with +91 or 91 prefix)
        if (numericOnly.length >= 4 && numericOnly.length <= 10) {
          orConditions += `,phone.ilike.%${numericOnly}%`;
        }
      }

      let searchQuery = supabase
        .from('employees')
        .select(EMPLOYEE_LIST_COLUMNS)
        .or(orConditions)
        .order('name', { ascending: true })
        .limit(50);
      if (branchId) searchQuery = searchQuery.eq('branch_id', branchId);

      const { data: searchResults, error: searchError } = await searchQuery;
      if (searchError) throw searchError;

      return NextResponse.json({
        employees: searchResults || [],
        total: (searchResults || []).length,
      }, {
        headers: { 'Cache-Control': 'private, max-age=5' },
      });
    }

    // ─── Advanced Search ────────────────────────────────────────────────────
    if (hasAdvancedSearch) {
      let advQuery = supabase
        .from('employees')
        .select(EMPLOYEE_LIST_COLUMNS)
        .order('name', { ascending: true })
        .limit(200);

      const asFiniteNumber = (value: string) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const dateYearsAgo = (years: number, addDays = 0) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setFullYear(date.getFullYear() - years);
        date.setDate(date.getDate() + addDays);
        return date.toISOString().split('T')[0];
      };

      if (branchId) advQuery = advQuery.eq('branch_id', branchId);
      if (advDepartment) advQuery = advQuery.eq('department', advDepartment);
      if (advDesignation) advQuery = advQuery.ilike('designation', `%${advDesignation}%`);
      if (advStatuses.length) {
        const statusVariants = Array.from(new Set(advStatuses.flatMap((status) => [status, status.toLowerCase()])));
        advQuery = advQuery.in('status', statusVariants);
      }
      if (advGender) advQuery = advQuery.eq('gender', advGender);
      if (advReligion) advQuery = advQuery.ilike('religion', advReligion);
      if (advEducation) advQuery = advQuery.eq('highest_qualification', advEducation);
      if (advMedical === 'declared') advQuery = advQuery.not('medical_conditions', 'is', null).neq('medical_conditions', '');
      if (advMedical === 'none') advQuery = advQuery.or('medical_conditions.is.null,medical_conditions.eq.');
      if (advJoinFrom) advQuery = advQuery.gte('join_date', advJoinFrom);
      if (advJoinTo) advQuery = advQuery.lte('join_date', advJoinTo);

      const heightFrom = asFiniteNumber(advHeightFrom);
      const heightTo = asFiniteNumber(advHeightTo);
      const weightFrom = asFiniteNumber(advWeightFrom);
      const weightTo = asFiniteNumber(advWeightTo);
      const salaryFrom = asFiniteNumber(advSalaryFrom);
      const salaryTo = asFiniteNumber(advSalaryTo);
      if (heightFrom !== null) advQuery = advQuery.gte('height', heightFrom);
      if (heightTo !== null) advQuery = advQuery.lte('height', heightTo);
      if (weightFrom !== null) advQuery = advQuery.gte('weight', weightFrom);
      if (weightTo !== null) advQuery = advQuery.lte('weight', weightTo);
      if (salaryFrom !== null) advQuery = advQuery.gte('monthly_salary', salaryFrom);
      if (salaryTo !== null) advQuery = advQuery.lte('monthly_salary', salaryTo);

      const minAge = asFiniteNumber(advAgeFrom);
      const maxAge = asFiniteNumber(advAgeTo);
      if (minAge !== null) advQuery = advQuery.lte('date_of_birth', dateYearsAgo(minAge));
      if (maxAge !== null) advQuery = advQuery.gte('date_of_birth', dateYearsAgo(maxAge + 1, 1));

      if (advPhoto === 'with') advQuery = advQuery.not('photo_url', 'is', null);
      if (advPhoto === 'without') advQuery = advQuery.is('photo_url', null);
      if (advContact === 'phone') advQuery = advQuery.not('phone', 'is', null);
      if (advContact === 'email') advQuery = advQuery.not('email', 'is', null);
      if (advContact === 'both') {
        advQuery = advQuery.not('phone', 'is', null).neq('phone', '').not('email', 'is', null).neq('email', '');
      }

      const now = new Date();
      if (advBirthday === 'today') {
        advQuery = advQuery.eq('birth_month', now.getMonth() + 1).eq('birth_day', now.getDate());
      }
      if (advBirthday === 'month') advQuery = advQuery.eq('birth_month', now.getMonth() + 1);

      const textProfileFields = ['phone', 'email', 'department', 'designation', 'photo_url'];
      const dateProfileFields = ['date_of_birth', 'join_date'];
      if (advProfile === 'complete') {
        for (const field of textProfileFields) advQuery = advQuery.not(field, 'is', null).neq(field, '');
        for (const field of dateProfileFields) advQuery = advQuery.not(field, 'is', null);
      }
      if (advProfile === 'incomplete') {
        const conditions = [
          ...textProfileFields.flatMap((field) => [`${field}.is.null`, `${field}.eq.`]),
          ...dateProfileFields.map((field) => `${field}.is.null`),
        ];
        advQuery = advQuery.or(conditions.join(','));
      }

      if (advPostedToday) {
        const today = now.toISOString().split('T')[0];
        let rotaQuery = supabase.from('rota_assignments').select('employee_id').eq('rota_date', today);
        let attendanceQuery = supabase.from('shift_attendance').select('employee_id, secondary_employee_id, status').eq('attendance_date', today);
        if (branchId) {
          rotaQuery = rotaQuery.eq('branch_id', branchId);
          attendanceQuery = attendanceQuery.eq('branch_id', branchId);
        }
        const [rotaResult, attendanceResult] = await Promise.all([rotaQuery, attendanceQuery]);
        if (rotaResult.error) throw rotaResult.error;
        if (attendanceResult.error) throw attendanceResult.error;
        const postedIds = new Set<string>((rotaResult.data || []).map((row: any) => row.employee_id).filter(Boolean));
        for (const row of attendanceResult.data || []) {
          if (row.status === 'absent') postedIds.delete(row.employee_id);
          else if (row.status !== 'pending' && row.employee_id) postedIds.add(row.employee_id);
          if (row.status === 'half_day' && row.secondary_employee_id) postedIds.add(row.secondary_employee_id);
        }
        const ids = Array.from(postedIds);
        if (advPostedToday === 'posted') {
          if (!ids.length) return NextResponse.json({ employees: [], total: 0 });
          advQuery = advQuery.in('id', ids);
        } else if (ids.length) {
          advQuery = advQuery.not('id', 'in', `(${ids.join(',')})`);
        }
      }

      const { data: advResults, error: advError } = await advQuery;
      if (advError) {
        console.error('[BFF] Advanced search error:', advError.message, advError.details, advError.hint);
        throw advError;
      }

      return NextResponse.json({
        employees: advResults || [],
        total: (advResults || []).length,
      }, {
        headers: { 'Cache-Control': 'private, max-age=5' },
      });
    }

    // Run aggregation queries in parallel
    const [statsRes, letterEmployeesRes] = await Promise.all([
      // 1. Get all employees with minimal columns for stats computation
      (() => {
        let q = supabase
          .from('employees')
          .select('name, status, department, join_date, date_of_birth, height, weight');
        if (branchId) q = q.eq('branch_id', branchId);
        return q;
      })(),

      // 2. Get employees for the requested letter (paginated view)
      (() => {
        const lowerLetter = letter.toLowerCase();
        const upperLetter = letter.toUpperCase();
        let q = supabase
          .from('employees')
          .select(EMPLOYEE_LIST_COLUMNS)
          .or(`name.ilike.${lowerLetter}%,name.ilike.${upperLetter}%`)
          .order('name', { ascending: true });
        if (branchId) q = q.eq('branch_id', branchId);
        return q;
      })(),
    ]);

    if (statsRes.error) throw statsRes.error;
    if (letterEmployeesRes.error) throw letterEmployeesRes.error;

    const allEmployees = statsRes.data || [];
    const letterEmployees = letterEmployeesRes.data || [];

    // ─── Compute stats server-side ───────────────────────────────────────────

    // Status counts
    const statusCounts: Record<string, number> = {};
    allEmployees.forEach((emp: any) => {
      const status = (emp.status || 'unknown').toLowerCase();
      const mapped = status === 'active' ? 'Active'
        : status === 'inactive' ? 'Inactive'
        : status === 'on leave' ? 'On Leave'
        : status === 'terminated' ? 'Terminated'
        : status === 'absconded' ? 'Absconded'
        : status === 'suspended' ? 'Suspended'
        : status === 'resigned' ? 'Resigned'
        : status;
      statusCounts[mapped] = (statusCounts[mapped] || 0) + 1;
    });

    // Department counts
    const departmentCounts: Record<string, number> = {};
    allEmployees.forEach((emp: any) => {
      const dept = emp.department || 'Unassigned';
      departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
    });

    // Tenure breakdown (active employees only)
    const now = Date.now();
    const activeEmployees = allEmployees.filter((e: any) => (e.status || '').toLowerCase() === 'active' && e.join_date);
    const tenureBuckets = { '<1': 0, '1-3': 0, '3-5': 0, '5-10': 0, '10+': 0 };
    activeEmployees.forEach((emp: any) => {
      const years = (now - new Date(emp.join_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (years < 1) tenureBuckets['<1']++;
      else if (years <= 3) tenureBuckets['1-3']++;
      else if (years <= 5) tenureBuckets['3-5']++;
      else if (years <= 10) tenureBuckets['5-10']++;
      else tenureBuckets['10+']++;
    });

    // Age breakdown (active employees with DOB)
    const ageBuckets = { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '55+': 0 };
    const activeWithDob = allEmployees.filter((e: any) => (e.status || '').toLowerCase() === 'active' && e.date_of_birth);
    activeWithDob.forEach((emp: any) => {
      const age = (now - new Date(emp.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age <= 25) ageBuckets['18-25']++;
      else if (age <= 35) ageBuckets['26-35']++;
      else if (age <= 45) ageBuckets['36-45']++;
      else if (age <= 55) ageBuckets['46-55']++;
      else ageBuckets['55+']++;
    });

    // Letter counts
    const letterCounts: Record<string, number> = {};
    allEmployees.forEach((emp: any) => {
      const ch = emp.name?.charAt(0)?.toUpperCase();
      if (ch && /[A-Z]/.test(ch)) {
        letterCounts[ch] = (letterCounts[ch] || 0) + 1;
      }
    });

    return NextResponse.json({
      stats: {
        total: allEmployees.length,
        statusCounts,
        departmentCounts,
        tenureBuckets,
        ageBuckets,
        letterCounts,
      },
      employees: letterEmployees,
      letter,
    }, {
      headers: {
        // Cache for 10 seconds — data is near-real-time but not worth re-fetching every render
        'Cache-Control': 'private, max-age=10',
      },
    });
  } catch (err: any) {
    console.error('[BFF hr-employees] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
