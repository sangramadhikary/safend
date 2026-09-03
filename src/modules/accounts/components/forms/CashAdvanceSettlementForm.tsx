'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Upload } from 'lucide-react';
import { cn } from "@/lib/utils";
import { CashAdvance, settleAdvance } from '@/services/security/SecurityCashAdvanceService';

const settlementFormSchema = z.object({
  amount: z.coerce.number()
    .min(1, { message: "Amount must be greater than 0" })
    .refine(val => val !== null, { message: "Amount is required" }),
  settlementDate: z.date({ error: "Settlement date is required" }),
  notes: z.string().optional(),
});

type SettlementFormValues = z.infer<typeof settlementFormSchema>;

interface SettlementFormProps {
  isOpen: boolean;
  onClose: () => void;
  advance: CashAdvance | null;
  onSettlementComplete?: () => void;
}

export function CashAdvanceSettlementForm({ 
  isOpen, 
  onClose, 
  advance, 
  onSettlementComplete 
}: SettlementFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const form = useForm<SettlementFormValues>({
    resolver: zodResolver(settlementFormSchema),
    defaultValues: {
      amount: advance?.balanceAmount || 0,
      settlementDate: new Date(),
      notes: "",
    },
  });

  // Update form when advance changes
  useEffect(() => {
    if (advance) {
      form.setValue('amount', advance.balanceAmount || advance.amount);
    }
  }, [advance, form]);

  const onSubmit = async (values: SettlementFormValues) => {
    if (!advance) return;

    setIsSubmitting(true);
    try {
      // Prepare attachments data (in a real app, these would be uploaded to storage)
      const attachments = files.length > 0 ? files.map(file => file.name) : undefined;

      // Submit settlement
      const result = await settleAdvance(advance.id, {
        amount: values.amount,
        settlementDate: values.settlementDate.toISOString(),
        notes: values.notes,
        attachments,
        settledBy: "Current User", // In a real app, this would come from auth context
      });

      if (result) {
        toast({
          title: "Settlement recorded",
          description: result.advance.status === 'settled' 
            ? "Advance has been fully settled" 
            : `₹${values.amount.toLocaleString()} settlement recorded. Remaining: ₹${result.advance.balanceAmount?.toLocaleString()}`,
        });

        // Reset form and close
        form.reset();
        setFiles([]);
        if (onSettlementComplete) {
          onSettlementComplete();
        }
        onClose();
      }
    } catch (error) {
      console.error("Error settling advance:", error);
      toast({
        title: "Settlement failed",
        description: "An error occurred while recording the settlement",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  if (!advance) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>Settle Cash Advance</DialogTitle>
        </DialogHeader>
        
        {/* Advance details summary */}
        <div className="bg-muted/50 p-4 rounded-md mb-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Employee:</span>
              <p className="font-medium">{advance.employeeName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Purpose:</span>
              <p className="font-medium">{advance.purpose}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Original Amount:</span>
              <p className="font-medium">₹{advance.amount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Balance Amount:</span>
              <p className="font-medium">₹{advance.balanceAmount?.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Due Date:</span>
              <p className="font-medium">
                {advance.settlementDueDate ? format(new Date(advance.settlementDueDate), 'PPP') : 'Not specified'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Category:</span>
              <p className="font-medium">{advance.category}</p>
            </div>
          </div>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Settlement Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Enter settlement amount"
                      {...field}
                      max={advance.balanceAmount || advance.amount}
                    />
                  </FormControl>
                  <FormDescription>
                    Max amount: ₹{(advance.balanceAmount || advance.amount).toLocaleString()}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="settlementDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Settlement Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* File upload for receipts */}
            <div className="space-y-2">
              <FormLabel>Receipts/Attachments</FormLabel>
              <div className="border rounded-md p-4">
                <div className="flex items-center justify-center w-full">
                  <label
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="mb-1 text-sm text-muted-foreground">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Receipt images or scanned documents
                      </p>
                    </div>
                    <input 
                      id="file-upload" 
                      type="file" 
                      multiple 
                      className="hidden" 
                      onChange={handleFileChange} 
                    />
                  </label>
                </div>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {files.map((file, index) => (
                      <div key={index} className="text-xs text-muted-foreground flex items-center">
                        <span className="truncate max-w-[250px]">{file.name}</span>
                        <span className="ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any additional notes regarding this settlement"
                      {...field}
                      rows={3}
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
                {isSubmitting ? 'Processing...' : 'Record Settlement'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
