import { supabaseClient } from '@/integrations/supabase/client';

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
    ),
  ];
  return lines.join('\n');
}

export async function generatePenaltyReport(
  fromDate: string,
  toDate: string,
  postId?: string
): Promise<void> {
  let query = supabaseClient
    .from('penalties')
    .select('*')
    .gte('violation_date', fromDate)
    .lte('violation_date', toDate)
    .order('violation_date', { ascending: false });

  if (postId) {
    query = query.eq('post_id', postId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('No penalty records found for the selected date range.');
  }

  const csv = toCSV(data);
  downloadCSV(csv, `penalty_report_${fromDate}_to_${toDate}.csv`);
}

export async function generateEmployeeDirectory(): Promise<void> {
  const { data, error } = await supabaseClient
    .from('employees')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('No employee records found.');
  }

  const csv = toCSV(data);
  downloadCSV(csv, `employee_directory_${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function generateMessChargesReport(
  fromDate: string,
  toDate: string
): Promise<void> {
  const { data, error } = await supabaseClient
    .from('mess_meal_records')
    .select('*')
    .gte('created_at', fromDate)
    .lte('created_at', toDate)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('No mess charge records found for the selected date range.');
  }

  const csv = toCSV(data);
  downloadCSV(csv, `mess_charges_${fromDate}_to_${toDate}.csv`);
}

export async function generateAttendanceSummary(
  fromDate: string,
  toDate: string,
  postId?: string
): Promise<void> {
  let query = supabaseClient
    .from('shift_attendance')
    .select(
      'attendance_date, post_name, client_name, shift_key, service_type_key, employee_code, employee_name, status, notes'
    )
    .gte('attendance_date', fromDate)
    .lte('attendance_date', toDate)
    .order('attendance_date', { ascending: false });

  if (postId) {
    query = query.eq('post_id', postId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('No attendance records found for the selected criteria.');
  }

  const csv = toCSV(data);
  downloadCSV(csv, `attendance_summary_${fromDate}_to_${toDate}.csv`);
}
