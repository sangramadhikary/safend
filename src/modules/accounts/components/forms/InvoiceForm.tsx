'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { useAccountsMutation } from '@/hooks/accounts/useAccountsData';
import { AccountsService } from '@/services/accounts/AccountsService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// Define the form schema
const invoiceFormSchema = z.object({
  clientName: z.string().min(1, { message: "Client name is required" }),
  amount: z.coerce.number().min(1, { message: "Amount must be greater than 0" }),
  gstApplicable: z.boolean(),
  gstAmount: z.coerce.number().optional(),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  dueDate: z.string().min(1, { message: "Due date is required" }),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

interface InvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InvoiceForm({ isOpen, onClose }: InvoiceFormProps) {
  const { toast } = useToast();
  const { selectedBranch } = useAccountsContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      clientName: "",
      amount: 0,
      gstApplicable: false,
      gstAmount: 0,
      description: "",
      dueDate: "",
    },
  });
  
  const { mutate: createInvoice } = useAccountsMutation(
    (data: {
      clientName: string;
      clientId: string;
      amount: number;
      totalAmount: number;
      gstApplicable: boolean;
      gstAmount: number;
      description: string;
      dueDate: string;
      branchId: string;
      type: string;
      invoiceNumber: string;
      issueDate: string;
      eInvoiceApplicable: boolean;
    }) => AccountsService.createInvoice(data),
    "Invoice created successfully",
    "Failed to create invoice"
  );
  
  const onSubmit = async (values: InvoiceFormValues) => {
    setIsSubmitting(true);
    try {
      const totalAmount = values.amount + (values.gstAmount || 0);
      const invoiceData = {
        clientName: values.clientName,
        clientId: "client-" + Date.now(), // Generate a client ID
        amount: values.amount,
        totalAmount: totalAmount,
        gstApplicable: values.gstApplicable,
        gstAmount: values.gstAmount || 0,
        description: values.description,
        dueDate: values.dueDate,
        branchId: selectedBranch || "main-branch",
        type: "service",
        invoiceNumber: "INV-" + Date.now(),
        issueDate: new Date().toISOString().split('T')[0],
        eInvoiceApplicable: false, // Add the missing property
      };
      await createInvoice(invoiceData);
      form.reset();
      onClose();
    } catch (error) {
      console.error("Error creating invoice:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>Create New Invoice</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="clientName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter client name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Enter amount" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="gstAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Amount (₹)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Enter GST amount" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter invoice details" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
