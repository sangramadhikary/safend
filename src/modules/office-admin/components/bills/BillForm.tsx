'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useBillStore } from "./billStore";
import { useVendorStore } from "../vendors/vendorStore";
import {
  BillCategory, BillFrequency, BILL_CATEGORY_LABELS,
  BILL_FREQUENCY_LABELS, PAYMENT_METHODS,
} from "./types";
import { useToast } from "@/hooks/use-toast";

interface BillFormProps {
  billId: string | null;
  branchId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function BillForm({ billId, branchId, onSuccess, onCancel }: BillFormProps) {
  const { bills, addBill, updateBill } = useBillStore();
  const { vendors } = useVendorStore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingBill = billId ? bills.find(b => b.id === billId) : null;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '' as BillCategory | '',
    vendor_id: '',
    vendor_name: '',
    frequency: 'monthly' as BillFrequency,
    amount: '',
    tax_percentage: '18',
    billing_day: '',
    start_date: '',
    end_date: '',
    next_due_date: '',
    payment_method: '',
    account_head: '',
    auto_remind: true,
    remind_days_before: '7',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form if editing
  useEffect(() => {
    if (existingBill) {
      setFormData({
        name: existingBill.name,
        description: existingBill.description || '',
        category: existingBill.category,
        vendor_id: existingBill.vendor_id || '',
        vendor_name: existingBill.vendor_name,
        frequency: existingBill.frequency,
        amount: existingBill.amount.toString(),
        tax_percentage: existingBill.tax_percentage.toString(),
        billing_day: existingBill.billing_day?.toString() || '',
        start_date: existingBill.start_date,
        end_date: existingBill.end_date || '',
        next_due_date: existingBill.next_due_date,
        payment_method: existingBill.payment_method || '',
        account_head: existingBill.account_head || '',
        auto_remind: existingBill.auto_remind,
        remind_days_before: existingBill.remind_days_before.toString(),
        notes: existingBill.notes || '',
      });
    }
  }, [existingBill]);

  const activeVendors = vendors.filter(v => v.status === 'active');

  const handleVendorChange = (vendorId: string) => {
    const vendor = activeVendors.find(v => v.id === vendorId);
    setFormData(prev => ({
      ...prev,
      vendor_id: vendorId,
      vendor_name: vendor?.name || '',
    }));
    if (errors.vendor_name) setErrors(prev => ({ ...prev, vendor_name: '' }));
  };

  // Calculate total
  const amount = parseFloat(formData.amount) || 0;
  const taxPct = parseFloat(formData.tax_percentage) || 0;
  const taxAmount = amount * (taxPct / 100);
  const totalAmount = amount + taxAmount;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Bill name is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.vendor_name.trim()) newErrors.vendor_name = 'Vendor is required';
    if (!formData.amount || parseFloat(formData.amount) <= 0) newErrors.amount = 'Valid amount is required';
    if (!formData.start_date) newErrors.start_date = 'Start date is required';
    if (!formData.next_due_date) newErrors.next_due_date = 'Next due date is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    const billData = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      category: formData.category as BillCategory,
      vendor_id: formData.vendor_id || undefined,
      vendor_name: formData.vendor_name.trim(),
      frequency: formData.frequency,
      amount: parseFloat(formData.amount),
      tax_percentage: parseFloat(formData.tax_percentage) || 0,
      total_amount: totalAmount,
      currency: 'INR',
      billing_day: formData.billing_day ? parseInt(formData.billing_day) : undefined,
      start_date: formData.start_date,
      end_date: formData.end_date || undefined,
      next_due_date: formData.next_due_date,
      payment_method: formData.payment_method || undefined,
      account_head: formData.account_head.trim() || undefined,
      status: 'active' as const,
      auto_remind: formData.auto_remind,
      remind_days_before: parseInt(formData.remind_days_before) || 7,
      notes: formData.notes.trim() || undefined,
      branch_id: branchId,
      created_by: 'admin',
    };

    let result;
    if (billId) {
      result = await updateBill(billId, billData);
    } else {
      result = await addBill(billData as any);
    }

    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: billId ? "Bill Updated" : "Bill Added",
        description: `${formData.name} has been ${billId ? 'updated' : 'added'} successfully.`,
      });
      onSuccess();
    } else {
      toast({
        title: "Error",
        description: result.error || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bill Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Bill Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="e.g., Office Rent - Main Branch"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={formData.category} onValueChange={v => updateField('category', v)}>
              <SelectTrigger className={errors.category ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BILL_CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor *</Label>
            {activeVendors.length > 0 ? (
              <Select value={formData.vendor_id} onValueChange={handleVendorChange}>
                <SelectTrigger className={errors.vendor_name ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {activeVendors.map(vendor => (
                    <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={formData.vendor_name}
                onChange={e => updateField('vendor_name', e.target.value)}
                placeholder="Vendor name"
                className={errors.vendor_name ? 'border-destructive' : ''}
              />
            )}
            {errors.vendor_name && <p className="text-xs text-destructive">{errors.vendor_name}</p>}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="Brief description of this bill..."
              rows={2}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Billing Schedule */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Billing Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency *</Label>
            <Select value={formData.frequency} onValueChange={v => updateField('frequency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(BILL_FREQUENCY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="billing_day">Billing Day (1-28)</Label>
            <Input
              id="billing_day"
              type="number"
              min="1"
              max="28"
              value={formData.billing_day}
              onChange={e => updateField('billing_day', e.target.value)}
              placeholder="e.g., 15"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_method">Payment Method</Label>
            <Select value={formData.payment_method} onValueChange={v => updateField('payment_method', v)}>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date *</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={e => updateField('start_date', e.target.value)}
              className={errors.start_date ? 'border-destructive' : ''}
            />
            {errors.start_date && <p className="text-xs text-destructive">{errors.start_date}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date">End Date (optional)</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={e => updateField('end_date', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_due_date">Next Due Date *</Label>
            <Input
              id="next_due_date"
              type="date"
              value={formData.next_due_date}
              onChange={e => updateField('next_due_date', e.target.value)}
              className={errors.next_due_date ? 'border-destructive' : ''}
            />
            {errors.next_due_date && <p className="text-xs text-destructive">{errors.next_due_date}</p>}
          </div>
        </div>
      </div>

      <Separator />

      {/* Amount */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Amount</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Base Amount (₹) *</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={formData.amount}
              onChange={e => updateField('amount', e.target.value)}
              placeholder="0.00"
              className={errors.amount ? 'border-destructive' : ''}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_percentage">Tax % (GST)</Label>
            <Input
              id="tax_percentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.tax_percentage}
              onChange={e => updateField('tax_percentage', e.target.value)}
              placeholder="18"
            />
          </div>

          <div className="space-y-2">
            <Label>Total Amount</Label>
            <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-bold">
              ₹{totalAmount.toLocaleString()}
            </div>
            {taxAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                Base: ₹{amount.toLocaleString()} + Tax: ₹{taxAmount.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Reminders & Notes */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Reminders</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Auto Remind</Label>
              <p className="text-xs text-muted-foreground">Get notified before due date</p>
            </div>
            <Switch
              checked={formData.auto_remind}
              onCheckedChange={v => updateField('auto_remind', v)}
            />
          </div>

          {formData.auto_remind && (
            <div className="space-y-2">
              <Label htmlFor="remind_days_before">Remind Days Before</Label>
              <Input
                id="remind_days_before"
                type="number"
                min="1"
                max="30"
                value={formData.remind_days_before}
                onChange={e => updateField('remind_days_before', e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="account_head">Account Head (for accounting)</Label>
          <Input
            id="account_head"
            value={formData.account_head}
            onChange={e => updateField('account_head', e.target.value)}
            placeholder="e.g., Office Expenses, Rent, IT Services"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={e => updateField('notes', e.target.value)}
            placeholder="Any additional notes..."
            rows={2}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : (billId ? 'Update Bill' : 'Add Bill')}
        </Button>
      </div>
    </form>
  );
}
