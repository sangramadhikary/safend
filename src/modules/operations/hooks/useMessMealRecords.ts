import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';

export interface MessMealRecord {
  id: string;
  mess_week_id: string;
  post_id: string;
  post_name: string;
  employee_id: string;
  employee_name: string;
  meal_count: number;
  per_meal_cost: number | null;
  total_charge: number | null;
  created_at: string;
  updated_at: string;
}

interface BulkMealRecordInput {
  mess_week_id: string;
  records: {
    post_id: string;
    post_name: string;
    employee_id: string;
    employee_name: string;
    meal_count: number;
  }[];
}

export function useMessMealRecords(messWeekId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery<MessMealRecord[]>({
    queryKey: ['mess_meal_records', messWeekId],
    queryFn: async () => {
      if (!messWeekId) return [];

      const { data, error } = await supabaseClient
        .from('mess_meal_records')
        .select('*')
        .eq('mess_week_id', messWeekId)
        .order('post_name', { ascending: true });

      if (error) throw new Error(error.message);
      return data as MessMealRecord[];
    },
    enabled: !!messWeekId,
  });

  const bulkSaveMealRecords = useMutation({
    mutationFn: async (input: BulkMealRecordInput) => {
      // Delete existing records for this week first
      await supabaseClient
        .from('mess_meal_records')
        .delete()
        .eq('mess_week_id', input.mess_week_id);

      // Filter out records with 0 meals
      const validRecords = input.records.filter(r => r.meal_count > 0);

      if (validRecords.length === 0) return [];

      const rows = validRecords.map(r => ({
        mess_week_id: input.mess_week_id,
        post_id: r.post_id,
        post_name: r.post_name,
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        meal_count: r.meal_count,
      }));

      const { data, error } = await supabaseClient
        .from('mess_meal_records')
        .insert(rows)
        .select();

      if (error) throw new Error(error.message);

      // Update mess week status to meals_recorded
      await supabaseClient
        .from('mess_weeks')
        .update({ status: 'meals_recorded' })
        .eq('id', input.mess_week_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mess_meal_records'] });
      queryClient.invalidateQueries({ queryKey: ['mess_weeks'] });
    },
  });

  const calculateCharges = useMutation({
    mutationFn: async (messWeekId: string) => {
      // Get the approved amount for this week
      const { data: fundRequest, error: fundError } = await supabaseClient
        .from('mess_fund_requests')
        .select('approved_amount')
        .eq('mess_week_id', messWeekId)
        .eq('status', 'approved')
        .single();

      if (fundError || !fundRequest?.approved_amount) {
        throw new Error('No approved fund amount found for this week');
      }

      // Get all meal records
      const { data: records, error: recordsError } = await supabaseClient
        .from('mess_meal_records')
        .select('*')
        .eq('mess_week_id', messWeekId);

      if (recordsError) throw new Error(recordsError.message);
      if (!records || records.length === 0) {
        throw new Error('No meal records found for this week');
      }

      // Calculate per meal cost
      const totalMeals = records.reduce((sum, r) => sum + r.meal_count, 0);
      if (totalMeals === 0) throw new Error('Total meals is zero, cannot calculate');

      const perMealCost = Number((fundRequest.approved_amount / totalMeals).toFixed(2));

      // Update each record with calculated values
      for (const record of records) {
        const totalCharge = Number((record.meal_count * perMealCost).toFixed(2));
        await supabaseClient
          .from('mess_meal_records')
          .update({
            per_meal_cost: perMealCost,
            total_charge: totalCharge,
          })
          .eq('id', record.id);
      }

      // Update mess week status
      await supabaseClient
        .from('mess_weeks')
        .update({ status: 'calculated' })
        .eq('id', messWeekId);

      return { perMealCost, totalMeals, totalAmount: fundRequest.approved_amount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mess_meal_records'] });
      queryClient.invalidateQueries({ queryKey: ['mess_weeks'] });
    },
  });

  return {
    mealRecords: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    bulkSaveMealRecords,
    calculateCharges,
  };
}
