'use client';

/**
 * Rota Planner Supabase Service
 * Manages employee shift assignments for posts
 */

import { supabaseClient } from '@/integrations/supabase/client';

// Employee interface (for rota planning)
export interface Employee {
  id?: string;
  employeeCode: string;
  fullName: string;
  phone?: string;
  email?: string;
  role: 'Guard' | 'Armed Guard' | 'Supervisor' | 'Patrol Officer';
  status: 'active' | 'inactive' | 'on_leave';
  assignedPostId?: string;
  assignedPostName?: string;
  skills?: string[];
  joiningDate?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Rota Plan interface
export interface RotaPlan {
  id?: string;
  postId: string;
  postName: string;
  postCode: string;
  clientName: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'published' | 'locked';
  shiftType: '8H' | '12H';
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Shift Assignment interface
export interface ShiftAssignment {
  id?: string;
  rotaPlanId: string;
  postId: string;
  postName: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeRole: string;
  date: string;
  shift: 'Day' | 'Afternoon' | 'Night';
  shiftTiming: string;
  status: 'assigned' | 'confirmed' | 'completed' | 'absent' | 'replaced';
  replacementId?: string;
  replacementName?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Map DB row to RotaPlan
const mapRowToRotaPlan = (row: any): RotaPlan => ({
  id: row.id,
  postId: row.post_id || '',
  postName: row.post_name || '',
  postCode: row.post_code || '',
  clientName: row.client_name || '',
  startDate: row.start_date || '',
  endDate: row.end_date || '',
  status: row.status || 'draft',
  shiftType: row.shift_type || '8H',
  createdBy: row.created_by,
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
});

// Map DB row to ShiftAssignment
const mapRowToAssignment = (row: any): ShiftAssignment => ({
  id: row.id,
  rotaPlanId: row.rota_plan_id || '',
  postId: row.post_id || '',
  postName: row.post_name || '',
  employeeId: row.employee_id || '',
  employeeName: row.employee_name || '',
  employeeCode: row.employee_code || '',
  employeeRole: row.employee_role || '',
  date: row.shift_date || '',
  shift: row.shift_name || 'Day',
  shiftTiming: row.shift_timing || '',
  status: row.status || 'assigned',
  replacementId: row.replacement_id,
  replacementName: row.replacement_name,
  notes: row.notes,
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
});

// Map Employee from HR table
const mapRowToEmployee = (row: any): Employee => ({
  id: row.id,
  employeeCode: row.employee_id || '',
  fullName: row.name || '',
  phone: row.phone,
  email: row.email,
  role: row.designation?.includes('Armed') ? 'Armed Guard' : 
        row.designation?.includes('Supervisor') ? 'Supervisor' :
        row.designation?.includes('Patrol') ? 'Patrol Officer' : 'Guard',
  status: row.status === 'active' ? 'active' : row.status === 'on_leave' ? 'on_leave' : 'inactive',
  joiningDate: row.date_of_joining,
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
});

// ============ EMPLOYEE FUNCTIONS ============

export const subscribeToEmployees = (callback: (employees: Employee[]) => void) => {
  // Initial fetch
  supabaseClient
    .from('hr_employees')
    .select('*')
    .eq('status', 'active')
    .order('name', { ascending: true })
    .then(({ data, error }) => {
      if (!error && data) {
        callback(data.map(mapRowToEmployee));
      }
    });

  // Real-time subscription
  const channel = supabaseClient
    .channel('employees-rota-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_employees' }, () => {
      supabaseClient
        .from('hr_employees')
        .select('*')
        .eq('status', 'active')
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            callback(data.map(mapRowToEmployee));
          }
        });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

export const getAvailableEmployees = async (date: string, shift: string, postId?: string) => {
  try {
    // Get all active employees
    const { data: employees, error: empError } = await supabaseClient
      .from('hr_employees')
      .select('*')
      .eq('status', 'active');

    if (empError) throw empError;

    // Get assignments for the date and shift
    const { data: assignments, error: assignError } = await supabaseClient
      .from('shift_assignments')
      .select('employee_id')
      .eq('shift_date', date)
      .eq('shift_name', shift);

    if (assignError) throw assignError;

    const assignedIds = new Set((assignments || []).map(a => a.employee_id));
    const available = (employees || [])
      .filter(emp => !assignedIds.has(emp.id))
      .map(mapRowToEmployee);

    return { success: true, data: available };
  } catch (error) {
    console.error('Error getting available employees:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// ============ ROTA PLAN FUNCTIONS ============

export const addRotaPlan = async (rotaPlan: Omit<RotaPlan, 'id'>) => {
  try {
    const { data, error } = await supabaseClient
      .from('rota_plans')
      .insert({
        post_id: rotaPlan.postId,
        post_name: rotaPlan.postName,
        post_code: rotaPlan.postCode,
        client_name: rotaPlan.clientName,
        name: `${rotaPlan.postName} - ${rotaPlan.startDate}`,
        start_date: rotaPlan.startDate,
        end_date: rotaPlan.endDate,
        status: rotaPlan.status || 'draft',
        shift_type: rotaPlan.shiftType,
        created_by: rotaPlan.createdBy,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error adding rota plan:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const updateRotaPlan = async (id: string, rotaPlan: Partial<RotaPlan>) => {
  try {
    const updates: any = {};
    if (rotaPlan.postId !== undefined) updates.post_id = rotaPlan.postId;
    if (rotaPlan.postName !== undefined) updates.post_name = rotaPlan.postName;
    if (rotaPlan.postCode !== undefined) updates.post_code = rotaPlan.postCode;
    if (rotaPlan.clientName !== undefined) updates.client_name = rotaPlan.clientName;
    if (rotaPlan.startDate !== undefined) updates.start_date = rotaPlan.startDate;
    if (rotaPlan.endDate !== undefined) updates.end_date = rotaPlan.endDate;
    if (rotaPlan.status !== undefined) updates.status = rotaPlan.status;
    if (rotaPlan.shiftType !== undefined) updates.shift_type = rotaPlan.shiftType;

    const { error } = await supabaseClient
      .from('rota_plans')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error updating rota plan:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const deleteRotaPlan = async (id: string) => {
  try {
    // Delete all assignments first
    await supabaseClient
      .from('shift_assignments')
      .delete()
      .eq('rota_plan_id', id);

    // Delete the rota plan
    const { error } = await supabaseClient
      .from('rota_plans')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting rota plan:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const subscribeToRotaPlans = (callback: (rotaPlans: RotaPlan[]) => void) => {
  // Initial fetch
  supabaseClient
    .from('rota_plans')
    .select('*')
    .order('start_date', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        callback(data.map(mapRowToRotaPlan));
      }
    });

  // Real-time subscription
  const channel = supabaseClient
    .channel('rota-plans-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rota_plans' }, () => {
      supabaseClient
        .from('rota_plans')
        .select('*')
        .order('start_date', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            callback(data.map(mapRowToRotaPlan));
          }
        });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

export const getRotaPlansByPost = async (postId: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('rota_plans')
      .select('*')
      .eq('post_id', postId)
      .order('start_date', { ascending: false });

    if (error) throw error;
    return { success: true, data: (data || []).map(mapRowToRotaPlan) };
  } catch (error) {
    console.error('Error getting rota plans by post:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// ============ SHIFT ASSIGNMENT FUNCTIONS ============

export const addShiftAssignment = async (assignment: Omit<ShiftAssignment, 'id'>) => {
  try {
    const { data, error } = await supabaseClient
      .from('shift_assignments')
      .insert({
        rota_plan_id: assignment.rotaPlanId,
        post_id: assignment.postId,
        post_name: assignment.postName,
        employee_id: assignment.employeeId,
        employee_name: assignment.employeeName,
        employee_code: assignment.employeeCode,
        employee_role: assignment.employeeRole,
        shift_date: assignment.date,
        shift_name: assignment.shift,
        shift_timing: assignment.shiftTiming,
        status: assignment.status || 'assigned',
        notes: assignment.notes,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error adding shift assignment:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const updateShiftAssignment = async (id: string, assignment: Partial<ShiftAssignment>) => {
  try {
    const updates: any = {};
    if (assignment.employeeId !== undefined) updates.employee_id = assignment.employeeId;
    if (assignment.employeeName !== undefined) updates.employee_name = assignment.employeeName;
    if (assignment.employeeCode !== undefined) updates.employee_code = assignment.employeeCode;
    if (assignment.employeeRole !== undefined) updates.employee_role = assignment.employeeRole;
    if (assignment.date !== undefined) updates.shift_date = assignment.date;
    if (assignment.shift !== undefined) updates.shift_name = assignment.shift;
    if (assignment.shiftTiming !== undefined) updates.shift_timing = assignment.shiftTiming;
    if (assignment.status !== undefined) updates.status = assignment.status;
    if (assignment.replacementId !== undefined) updates.replacement_id = assignment.replacementId;
    if (assignment.replacementName !== undefined) updates.replacement_name = assignment.replacementName;
    if (assignment.notes !== undefined) updates.notes = assignment.notes;

    const { error } = await supabaseClient
      .from('shift_assignments')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error updating shift assignment:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const deleteShiftAssignment = async (id: string) => {
  try {
    const { error } = await supabaseClient
      .from('shift_assignments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting shift assignment:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const subscribeToShiftAssignments = (
  rotaPlanId: string,
  callback: (assignments: ShiftAssignment[]) => void
) => {
  // Initial fetch
  supabaseClient
    .from('shift_assignments')
    .select('*')
    .eq('rota_plan_id', rotaPlanId)
    .order('shift_date', { ascending: true })
    .then(({ data, error }) => {
      if (!error && data) {
        callback(data.map(mapRowToAssignment));
      }
    });

  // Real-time subscription
  const channel = supabaseClient
    .channel(`assignments-${rotaPlanId}-${Date.now()}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'shift_assignments',
      filter: `rota_plan_id=eq.${rotaPlanId}`
    }, () => {
      supabaseClient
        .from('shift_assignments')
        .select('*')
        .eq('rota_plan_id', rotaPlanId)
        .order('shift_date', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            callback(data.map(mapRowToAssignment));
          }
        });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

export const getAssignmentsByDateRange = async (
  postId: string,
  startDate: string,
  endDate: string
) => {
  try {
    const { data, error } = await supabaseClient
      .from('shift_assignments')
      .select('*')
      .eq('post_id', postId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .order('shift_date', { ascending: true });

    if (error) throw error;
    return { success: true, data: (data || []).map(mapRowToAssignment) };
  } catch (error) {
    console.error('Error getting assignments by date range:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// ============ BULK OPERATIONS ============

export const bulkAddAssignments = async (assignments: Omit<ShiftAssignment, 'id'>[]) => {
  try {
    const rows = assignments.map(a => ({
      rota_plan_id: a.rotaPlanId,
      post_id: a.postId,
      post_name: a.postName,
      employee_id: a.employeeId,
      employee_name: a.employeeName,
      employee_code: a.employeeCode,
      employee_role: a.employeeRole,
      shift_date: a.date,
      shift_name: a.shift,
      shift_timing: a.shiftTiming,
      status: a.status || 'assigned',
      notes: a.notes,
    }));

    const { error } = await supabaseClient
      .from('shift_assignments')
      .insert(rows);

    if (error) throw error;
    return { success: true, message: `${assignments.length} assignments created successfully` };
  } catch (error) {
    console.error('Error bulk adding assignments:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Generate dates between start and end
export const generateDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

// Get shift timings based on shift type
export const getShiftTimings = (shiftType: '8H' | '12H', shift: 'Day' | 'Afternoon' | 'Night'): string => {
  if (shiftType === '12H') {
    return shift === 'Day' ? '06:00 - 18:00' : '18:00 - 06:00';
  }
  // 8H shifts
  switch (shift) {
    case 'Day': return '06:00 - 14:00';
    case 'Afternoon': return '14:00 - 22:00';
    case 'Night': return '22:00 - 06:00';
    default: return '06:00 - 14:00';
  }
};

// Legacy exports for compatibility
export const addEmployee = async (employee: Omit<Employee, 'id'>) => {
  console.warn('addEmployee is deprecated. Use HREmployeeService instead.');
  return { success: false, error: 'Use HREmployeeService for employee management' };
};

export const updateEmployee = async (id: string, employee: Partial<Employee>) => {
  console.warn('updateEmployee is deprecated. Use HREmployeeService instead.');
  return { success: false, error: 'Use HREmployeeService for employee management' };
};

export const deleteEmployee = async (id: string) => {
  console.warn('deleteEmployee is deprecated. Use HREmployeeService instead.');
  return { success: false, error: 'Use HREmployeeService for employee management' };
};
