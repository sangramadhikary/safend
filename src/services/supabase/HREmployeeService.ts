'use client';

/**
 * HR Employee Supabase Service
 * Comprehensive employee management for HR module
 */

import { supabaseClient } from '@/integrations/supabase/client';
import { triggerEmployeesRefresh } from '@/utils/dataRefresh';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import { auditActions } from '@/utils/auditLog';

export interface HREmployee {
  id?: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  bloodGroup?: string;
  department: string;
  designation: string;
  joinDate: string;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract' | 'Temporary' | 'Intern';
  status: 'Active' | 'Inactive' | 'On Leave' | 'Terminated' | 'Absconded' | 'Suspended' | 'Resigned';
  address?: string;
  currentAddress?: string; // Alias for address
  city?: string;
  state?: string;
  pincode?: string;
  bankAccount?: string;
  bankName?: string;
  ifscCode?: string;
  panNumber?: string;
  aadharNumber?: string;
  uanNumber?: string;
  esiNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  avatar?: string;
  photoUrl?: string;
  salary?: number;
  monthlySalary?: number;
  weight?: number;
  height?: number;
  religion?: string;
  medicalConditions?: string;
  highestQualification?: string;
  nationality?: string;
  caste?: string;
  branch?: string;
  branchId?: string;
  workLocation?: string;
  habits?: string[]; // e.g. ['smoking', 'drinking', 'tobacco', 'none']
  createdAt?: Date;
  updatedAt?: Date;
}

// Helper to map DB row to HREmployee
const mapRowToEmployee = (row: any): HREmployee => ({
  id: row.id,
  employeeId: row.employee_id || '',
  name: row.name || '',
  email: row.email || '',
  phone: row.phone || '',
  alternatePhone: undefined,
  gender: row.gender || 'male',
  dateOfBirth: row.date_of_birth || undefined,
  maritalStatus: row.marital_status || undefined,
  bloodGroup: row.blood_group || undefined,
  department: row.department || '',
  designation: row.designation || '',
  joinDate: row.join_date || '',
  employmentType: 'Full-Time',
  status: row.status === 'active' ? 'Active'
    : row.status === 'inactive' ? 'Inactive'
    : row.status === 'on leave' ? 'On Leave'
    : row.status === 'terminated' ? 'Terminated'
    : row.status === 'absconded' ? 'Absconded'
    : row.status === 'suspended' ? 'Suspended'
    : row.status === 'resigned' ? 'Resigned'
    : row.status || 'Active',
  address: row.address,
  currentAddress: row.address,
  city: undefined,
  state: undefined,
  pincode: undefined,
  bankAccount: row.bank_account,
  bankName: row.bank_name,
  ifscCode: row.ifsc_code,
  panNumber: row.pan_number,
  aadharNumber: row.aadhar_number,
  uanNumber: undefined,
  esiNumber: undefined,
  emergencyContactName: row.emergency_contact,
  emergencyContactPhone: row.emergency_phone,
  emergencyContactRelation: undefined,
  avatar: row.photo_url || undefined,
  photoUrl: row.photo_url || undefined,
  salary: row.salary,
  monthlySalary: row.monthly_salary || row.salary || 0,
  branch: undefined,
  branchId: row.branch_id,
  workLocation: undefined,
  weight: row.weight || undefined,
  height: row.height || undefined,
  religion: row.religion || undefined,
  medicalConditions: row.medical_conditions || undefined,
  highestQualification: row.highest_qualification || undefined,
  nationality: row.nationality || undefined,
  caste: row.caste || undefined,
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
});

// Helper to map HREmployee to DB row - ONLY includes columns that exist in the database
const mapEmployeeToRow = (employee: Partial<HREmployee> & Record<string, any>): any => {
  const row: any = {};
  
  if (employee.employeeId !== undefined) row.employee_id = employee.employeeId;
  if (employee.name !== undefined) row.name = employee.name;
  if (employee.email !== undefined) row.email = employee.email;
  if (employee.phone !== undefined) row.phone = employee.phone;
  if (employee.department !== undefined) row.department = employee.department;
  if (employee.designation !== undefined) row.designation = employee.designation;
  if (employee.joinDate !== undefined) row.join_date = employee.joinDate || null;
  if (employee.status !== undefined) row.status = typeof employee.status === 'string' ? employee.status.toLowerCase() : 'active';
  if (employee.address !== undefined) row.address = employee.address;
  if (employee.bankAccount !== undefined) row.bank_account = employee.bankAccount;
  if (employee.accountNumber !== undefined) row.bank_account = employee.accountNumber;
  if (employee.bankName !== undefined) row.bank_name = employee.bankName;
  if (employee.ifscCode !== undefined) row.ifsc_code = employee.ifscCode;
  if (employee.panNumber !== undefined) row.pan_number = employee.panNumber;
  if (employee.aadharNumber !== undefined) row.aadhar_number = employee.aadharNumber;
  if (employee.emergencyContactName !== undefined) row.emergency_contact = employee.emergencyContactName;
  if (employee.emergencyContactPhone !== undefined) row.emergency_phone = employee.emergencyContactPhone;
  if (employee.salary !== undefined) row.salary = employee.salary;
  if (employee.monthlySalary !== undefined) row.monthly_salary = employee.monthlySalary;
  if (employee.branchId !== undefined) row.branch_id = employee.branchId;
  // Personal details
  if (employee.gender !== undefined) row.gender = employee.gender;
  if (employee.dateOfBirth !== undefined) row.date_of_birth = employee.dateOfBirth || null;
  if (employee.photoUrl !== undefined) row.photo_url = employee.photoUrl || null;
  if (employee.avatar !== undefined && !row.photo_url) row.photo_url = employee.avatar || null;
  if ((employee as any).weight !== undefined) row.weight = (employee as any).weight || null;
  if ((employee as any).height !== undefined) row.height = (employee as any).height || null;
  if ((employee as any).religion !== undefined) row.religion = (employee as any).religion || null;
  if ((employee as any).medicalConditions !== undefined) row.medical_conditions = (employee as any).medicalConditions || null;
  if ((employee as any).highestQualification !== undefined) row.highest_qualification = (employee as any).highestQualification || null;
  if ((employee as any).bloodGroup !== undefined) row.blood_group = (employee as any).bloodGroup || null;
  if ((employee as any).maritalStatus !== undefined) row.marital_status = (employee as any).maritalStatus || null;
  if ((employee as any).nationality !== undefined) row.nationality = (employee as any).nationality || null;
  if ((employee as any).caste !== undefined) row.caste = (employee as any).caste || null;
  
  return row;
};

export const EMPLOYEE_ID_PREFIX = 'EMP';
const EMPLOYEE_ID_PATTERN = /^EMP(\d+)$/i;

/** Format a numeric sequence value as an employee ID (zero-padded to 4 digits). */
export const formatEmployeeId = (sequence: number): string =>
  `${EMPLOYEE_ID_PREFIX}${String(sequence).padStart(4, '0')}`;

/**
 * Numeric suffix of an employee ID, or null when it does not follow EMP####.
 * Exported for the ID generator's own tests and for callers validating input.
 */
export const parseEmployeeIdSequence = (employeeId: unknown): number | null => {
  const match = EMPLOYEE_ID_PATTERN.exec(String(employeeId ?? '').trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

/**
 * Mint the next free employee ID.
 *
 * Derived from the HIGHEST existing ID, not from `COUNT(*)`. Counting rows is
 * only correct while the sequence has no gaps: delete one employee and the count
 * falls permanently behind the maximum, so the "next" ID is one that already
 * exists and every insert fails on `employees_employee_id_key`. That is not a
 * race — with N deleted rows it is reproducible on the first attempt.
 *
 * Reads only the id column, computes the maximum numerically (string ordering
 * would break once the sequence passes EMP9999), then skips forward over any
 * value already taken.
 */
export const generateEmployeeId = async (): Promise<string> => {
  const { data, error } = await supabaseClient
    .from('employees')
    .select('employee_id');

  if (error) {
    // Without the existing set we cannot guarantee uniqueness. A timestamp
    // suffix is collision-resistant, unlike the previous 4-digit slice.
    console.error('[HREmployeeService] Could not read employee IDs to generate the next one:', describeDbError(error));
    return `${EMPLOYEE_ID_PREFIX}${Date.now().toString(36).toUpperCase()}`;
  }

  const taken = new Set<string>();
  let highest = 0;
  for (const row of data ?? []) {
    const raw = String(row?.employee_id ?? '').trim();
    if (!raw) continue;
    taken.add(raw.toUpperCase());
    const sequence = parseEmployeeIdSequence(raw);
    if (sequence !== null && sequence > highest) highest = sequence;
  }

  let next = highest + 1;
  while (taken.has(formatEmployeeId(next).toUpperCase())) next++;
  return formatEmployeeId(next);
};

/** Readable form of a Supabase error — the raw object logs as `{}` in the console. */
const describeDbError = (error: any) => ({
  message: error?.message ?? String(error),
  code: error?.code,
  details: error?.details,
  hint: error?.hint,
});

/** True when the failure is a duplicate on the employee_id unique constraint. */
const isDuplicateEmployeeId = (error: any): boolean => {
  if (!error) return false;
  const haystack = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return error.code === '23505' && haystack.includes('employee_id');
};

/** How many times to re-mint an employee ID when the chosen one is already taken. */
const EMPLOYEE_ID_RETRY_LIMIT = 5;

// Add new employee
export const addHREmployee = async (employee: Omit<HREmployee, 'id'>) => {
  try {
    const row = mapEmployeeToRow(employee);

    // Retry on a duplicate employee_id. Generating an ID and inserting it are two
    // separate round trips, so a concurrent onboarding can claim the same value in
    // between; a caller can also hand us a stale ID from an earlier failed attempt.
    let data: any = null;
    let error: any = null;
    let assignedId = row.employee_id;

    for (let attempt = 0; attempt <= EMPLOYEE_ID_RETRY_LIMIT; attempt++) {
      const result = await supabaseClient
        .from('employees')
        .insert(row)
        .select('id')
        .single();
      data = result.data;
      error = result.error;

      if (!error || !isDuplicateEmployeeId(error)) break;

      if (attempt === EMPLOYEE_ID_RETRY_LIMIT) {
        console.error(
          `[HREmployeeService] Employee ID still colliding after ${EMPLOYEE_ID_RETRY_LIMIT} retries`,
          describeDbError(error)
        );
        return {
          success: false,
          error: `Could not allocate a free employee ID after ${EMPLOYEE_ID_RETRY_LIMIT} attempts. Please try again.`,
        };
      }

      const regenerated = await generateEmployeeId();
      console.warn(
        `[HREmployeeService] Employee ID ${assignedId} is already taken — retrying as ${regenerated}`
      );
      assignedId = regenerated;
      row.employee_id = regenerated;
    }

    if (error) {
      console.error('[HREmployeeService] Error adding employee:', describeDbError(error));
      return { success: false, error: error.message || 'Could not save the employee record.' };
    }

    // Report the ID actually used, which may differ from the one requested.
    employee = { ...employee, employeeId: assignedId } as Omit<HREmployee, 'id'>;

    // Audit the creation. Instrumented here in the service rather than at each
    // component so every caller is covered by one edit — this function is
    // reached from the employee form, the bulk importer and the onboarding flow.
    // Fire-and-forget: a logging failure must never fail the user's save.
    void auditActions.employeeCreated(employee.name, employee.employeeId, employee);

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerEmployeesRefresh(), 100);
    // `employeeId` is returned because a retry may have allocated a different one
    // than the caller asked for; callers that persist it must use this value.
    return { success: true, id: data.id, employeeId: assignedId };
  } catch (error) {
    console.error('[HREmployeeService] Error adding employee:', describeDbError(error));
    return { success: false, error: (error as Error).message };
  }
};

// Update employee
export const updateHREmployee = async (id: string, employee: Partial<HREmployee>) => {
  try {
    // Read the current row BEFORE writing, so the audit entry can record what the
    // values actually changed from. This costs one extra SELECT per update; that
    // is the price of a diff, and it is paid only on mutations, never on reads.
    // The fetch is deliberately not fatal — if it fails the update still proceeds
    // and the audit entry simply records the new values without a comparison.
    const priorState = await getHREmployeeById(id);
    const before = priorState.success ? priorState.data : undefined;

    const row = mapEmployeeToRow(employee);
    const { error } = await supabaseClient
      .from('employees')
      .update(row)
      .eq('id', id);

    if (error) {
      console.error('[HREmployeeService] Error updating employee:', error);
      return { success: false, error: error.message };
    }

    // `employee` is a partial patch, so the post-update state is the prior row
    // with the patch applied. Merging avoids a second round trip and yields a
    // diff limited to the fields the caller actually submitted.
    if (before) {
      const after = { ...before, ...employee };
      // A status transition is materially different from an ordinary field edit —
      // it is what marks someone terminated or absconded — so it is recorded
      // under its own critical-severity action rather than as a generic update.
      if (employee.status !== undefined && employee.status !== before.status) {
        void auditActions.employeeStatusChanged(before.name, before.status, employee.status);
      }
      void auditActions.employeeUpdated(
        before.name || employee.name || id,
        undefined,
        before,
        after
      );
    } else {
      void auditActions.employeeUpdated(employee.name || id, employee);
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerEmployeesRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('[HREmployeeService] Error updating employee:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete employee
export const deleteHREmployee = async (id: string) => {
  try {
    // Capture the full record before deleting it. For a destructive operation this
    // is the only chance to record what was lost: once the row is gone, an audit
    // entry naming just an id is unreviewable.
    const priorState = await getHREmployeeById(id);
    const before = priorState.success ? priorState.data : undefined;

    const { error } = await supabaseClient
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[HREmployeeService] Error deleting employee:', error);
      return { success: false, error: error.message };
    }

    void auditActions.employeeDeleted(before?.name ?? id, before);

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerEmployeesRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('[HREmployeeService] Error deleting employee:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get single employee by ID
export const getHREmployeeById = async (id: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[HREmployeeService] Error getting employee:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data: mapRowToEmployee(data) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting employee:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get employee by employee code
export const getHREmployeeByCode = async (employeeId: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('employee_id', employeeId)
      .single();

    if (error) {
      return { success: false, error: 'Employee not found' };
    }
    return { success: true, data: mapRowToEmployee(data) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting employee by code:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Search employees by name
export const searchHREmployees = async (searchTerm: string) => {
  try {
    // Sanitize the search term to prevent PostgREST filter injection:
    // strip structural/wildcard characters that could alter query semantics.
    const safeTerm = searchTerm.replace(/[^a-zA-Z0-9 '\-]/g, '').trim();
    if (!safeTerm) {
      return { success: true, data: [] };
    }
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .or(`name.ilike.%${safeTerm}%,employee_id.ilike.%${safeTerm}%`)
      .order('name', { ascending: true });

    if (error) {
      console.error('[HREmployeeService] Error searching employees:', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToEmployee) };
  } catch (error) {
    console.error('[HREmployeeService] Error searching employees:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Get all employees — NO branch filter (used for public verification tools)
export const getAllHREmployeesUnscoped = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 4999); // Override Supabase default 1000-row limit

    if (error) {
      console.error('[HREmployeeService] Error getting all employees (unscoped):', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToEmployee) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting all employees (unscoped):', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to ALL employees across all branches — for public/verification use only
export const subscribeToAllHREmployees = (callback: (employees: HREmployee[]) => void) => {
  getAllHREmployeesUnscoped().then(result => {
    callback(result.data || []);
  });

  const channel = supabaseClient
    .channel('hr-employees-all-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
      getAllHREmployeesUnscoped().then(result => {
        callback(result.data || []);
      });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

// Get all employees (branch-scoped for internal HR use)
export const getAllHREmployees = async () => {
  try {
    let query = supabaseClient
      .from('employees')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 4999); // Override Supabase default 1000-row limit
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) {
      console.error('[HREmployeeService] Error getting all employees:', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToEmployee) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting all employees:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to real-time employee updates
export const subscribeToHREmployees = (callback: (employees: HREmployee[]) => void) => {
  // Initial fetch
  getAllHREmployees().then(result => {
    callback(result.data || []);
  });

  // Real-time subscription
  const channel = supabaseClient
    .channel('hr-employees-realtime-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, (payload) => {
      getAllHREmployees().then(result => {
        callback(result.data || []);
      });
    })
    .subscribe();

  // Re-fetch when the active branch changes (main user switching branches)
  const offBranch = onBranchScopeChange(() => {
    getAllHREmployees().then(result => callback(result.data || []));
  });

  return () => {
    supabaseClient.removeChannel(channel);
    offBranch();
  };
};

// Get employees by department
export const getEmployeesByDepartment = async (department: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('department', department)
      .order('name', { ascending: true });

    if (error) {
      console.error('[HREmployeeService] Error getting employees by department:', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToEmployee) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting employees by department:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Get employees by status
export const getEmployeesByStatus = async (status: HREmployee['status']) => {
  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('status', status.toLowerCase())
      .order('name', { ascending: true });

    if (error) {
      console.error('[HREmployeeService] Error getting employees by status:', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToEmployee) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting employees by status:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Get employees by starting letter (server-side alphabetical pagination)
export const getHREmployeesByLetter = async (letter: string) => {
  try {
    // Validate that letter is a single alphabetic character to prevent filter injection.
    if (!/^[a-zA-Z]$/.test(letter)) {
      return { success: false, error: 'Invalid letter parameter', data: [] };
    }
    const lowerLetter = letter.toLowerCase();
    const upperLetter = letter.toUpperCase();
    // Match names starting with the letter (case-insensitive using ilike)
    let query = supabaseClient
      .from('employees')
      .select('*')
      .or(`name.ilike.${lowerLetter}%,name.ilike.${upperLetter}%`)
      .order('name', { ascending: true });
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) {
      console.error('[HREmployeeService] Error getting employees by letter:', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToEmployee) };
  } catch (error) {
    console.error('[HREmployeeService] Error getting employees by letter:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Get count of employees per letter (for showing available letters)
export const getHREmployeeLetterCounts = async () => {
  try {
    let query = supabaseClient
      .from('employees')
      .select('name');
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) {
      console.error('[HREmployeeService] Error getting letter counts:', error);
      return {};
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const firstChar = row.name?.charAt(0)?.toUpperCase();
      if (firstChar && /[A-Z]/.test(firstChar)) {
        counts[firstChar] = (counts[firstChar] || 0) + 1;
      }
    });
    return counts;
  } catch (error) {
    console.error('[HREmployeeService] Error getting letter counts:', error);
    return {};
  }
};

// Get employee statistics
export const getEmployeeStats = (employees: HREmployee[]) => {
  const total = employees.length;
  const active = employees.filter(e => e.status === 'Active').length;
  const onLeave = employees.filter(e => e.status === 'On Leave').length;
  const inactive = employees.filter(e => e.status === 'Inactive').length;
  const fullTime = employees.filter(e => e.employmentType === 'Full-Time').length;
  const partTime = employees.filter(e => e.employmentType === 'Part-Time').length;
  const contract = employees.filter(e => e.employmentType === 'Contract').length;
  
  const departments = employees.reduce((acc, emp) => {
    acc[emp.department] = (acc[emp.department] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    total,
    active,
    onLeave,
    inactive,
    fullTime,
    partTime,
    contract,
    departments
  };
};
