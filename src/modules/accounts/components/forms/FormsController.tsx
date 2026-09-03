'use client';

import { useState, createContext, useContext, ReactNode, useEffect } from 'react';
import { ExpenseForm } from './ExpenseForm';
import { InvoiceForm } from './InvoiceForm';
import { TransactionForm } from './TransactionForm';
import { CashAdvanceForm } from './CashAdvanceForm';
import { useToast } from '@/hooks/use-toast';
import { emitEvent, useEvent, EVENT_TYPES } from '@/hooks/useEvent';
import { createCashAdvance, CashAdvance } from '@/services/security/SecurityCashAdvanceService';
import { useFormManager } from '@/hooks/useFormManager';
import { getSoundBus } from '@/services/SoundService';
import { SoundEffectsProvider } from '@/components/sound/SoundEffectsProvider';
import { SoundInitializer } from '@/components/sound/SoundInitializer';
import { SoundToggle } from '@/components/sound/SoundToggle';

// Define types for the forms context
interface FormsContextType {
  openExpenseForm: () => void;
  openInvoiceForm: () => void;
  openTransactionForm: () => void;
  openCashAdvanceForm: () => void;
  closeAllForms: () => void;
}

// Create a context for the forms
const FormsContext = createContext<FormsContextType | undefined>(undefined);

// Provider component
export function FormsProvider({ children }: { children: ReactNode }) {
  // Use form managers for each form type
  const expenseFormManager = useFormManager({
    successMessage: "Expense record created successfully",
    successEventType: EVENT_TYPES.FORM_SUBMITTED,
    playSounds: true
  });
  
  const invoiceFormManager = useFormManager({
    successMessage: "Invoice created successfully",
    successEventType: EVENT_TYPES.FORM_SUBMITTED,
    playSounds: true
  });
  
  const transactionFormManager = useFormManager({
    successMessage: "Transaction recorded successfully",
    successEventType: EVENT_TYPES.FORM_SUBMITTED,
    playSounds: true
  });
  
  const cashAdvanceFormManager = useFormManager({
    successMessage: "Cash advance created successfully",
    successEventType: EVENT_TYPES.SECURITY_CASH_ADVANCE_ISSUED,
    playSounds: true
  });
  
  const { toast } = useToast();

  // Listen for form-related events
  useEvent(EVENT_TYPES.FORM_OPEN, (payload: any) => {
    if (payload?.action === 'open') {
      switch (payload?.formType) {
        case 'expense':
          openExpenseForm();
          break;
        case 'invoice':
          openInvoiceForm();
          break;
        case 'transaction':
          openTransactionForm();
          break;
        case 'cashAdvance':
          openCashAdvanceForm();
          break;
        default:
          break;
      }
    }
  }, []);

  const openExpenseForm = () => {
    closeAllForms();
    expenseFormManager.open();
    toast({
      title: "Expense Form",
      description: "Add a new expense record",
    });
  };

  const openInvoiceForm = () => {
    closeAllForms();
    invoiceFormManager.open();
    toast({
      title: "Invoice Form",
      description: "Create a new invoice",
    });
  };

  const openTransactionForm = () => {
    closeAllForms();
    transactionFormManager.open();
    toast({
      title: "Transaction Form",
      description: "Record a new transaction",
    });
  };
  
  const openCashAdvanceForm = () => {
    closeAllForms();
    cashAdvanceFormManager.open();
    toast({
      title: "Cash Advance Form",
      description: "Create a new cash advance",
    });
  };

  const closeAllForms = () => {
    expenseFormManager.close();
    invoiceFormManager.close();
    transactionFormManager.close();
    cashAdvanceFormManager.close();
  };

  // Submit handlers
  const handleCashAdvanceSubmit = async (data: {
    employeeId?: string;
    employeeName?: string;
    amount?: number;
    requestDate?: Date;
    settlementDueDate?: Date;
    purpose?: string;
    category?: string;
    notes?: string;
  }): Promise<void> => {
    // Create cash advance
    const result = await createCashAdvance({
      ...data,
      requestDate: data.requestDate?.toISOString(),
      settlementDueDate: data.settlementDueDate?.toISOString(),
      branchId: 'branch-001' // In a real app, this would come from context
    });
    
    // Play success sound (only on client)
    if (typeof window !== 'undefined') getSoundBus().play('success');
    
    // Emit event to notify other components
    emitEvent(EVENT_TYPES.SECURITY_CASH_ADVANCE_ISSUED, { data: result });
  };

  return (
    <SoundEffectsProvider>
      <SoundInitializer />
      <FormsContext.Provider
        value={{
          openExpenseForm,
          openInvoiceForm,
          openTransactionForm,
          openCashAdvanceForm,
          closeAllForms,
        }}
      >
        {children}
        
        {/* Sound toggle for easy access */}
        <SoundToggle />
        
        {/* Forms rendered at the component level, shown/hidden as needed */}
        <ExpenseForm 
          isOpen={expenseFormManager.isOpen} 
          onClose={expenseFormManager.close} 
        />
        <InvoiceForm 
          isOpen={invoiceFormManager.isOpen} 
          onClose={invoiceFormManager.close} 
        />
        <TransactionForm 
          isOpen={transactionFormManager.isOpen} 
          onClose={transactionFormManager.close} 
        />
        <CashAdvanceForm 
          isOpen={cashAdvanceFormManager.isOpen} 
          onClose={cashAdvanceFormManager.close} 
          onSubmit={handleCashAdvanceSubmit}
        />
      </FormsContext.Provider>
    </SoundEffectsProvider>
  );
}

// Custom hook for consuming the forms context
export function useFormsController() {
  const context = useContext(FormsContext);
  if (context === undefined) {
    throw new Error('useFormsController must be used within a FormsProvider');
  }
  return context;
}

// Export the old component for backward compatibility
export function FormsController() {
  return null; // This component is deprecated, use FormsProvider and useFormsController instead
}
