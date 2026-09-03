'use client';

/**
 * @deprecated The MessChargeService is no longer used.
 * Mess charges are now calculated automatically via the weekly mess management system.
 * See: src/modules/operations/hooks/useMessMealRecords.ts → calculateCharges
 */

// Kept as stubs for backward compatibility if any old code still imports these
export const getAllMealCostConfigurations = () => [];
export const calculateMealCostFromDistribution = (_data: any) => ({ success: true, cost: 0 });
export const updatePostMealCost = (_postId: string, _cost: number) => ({ success: true });
export const getMealCost = (_postId: string) => ({ cost: 0 });
export const sendMessBillToAccounts = (_billData: any) => ({ success: true, billId: '' });

class MessChargeServiceClass {
  generateMonthlyBill(_options: any) {
    return { success: false, error: 'Deprecated. Use weekly mess management system.' };
  }
}

export const messChargeService = new MessChargeServiceClass();
export default messChargeService;
