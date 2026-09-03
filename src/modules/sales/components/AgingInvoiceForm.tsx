'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

interface AgingInvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

export function AgingInvoiceForm({ isOpen, onClose, onSubmit, editData }: AgingInvoiceFormProps) {
  const { toast } = useToast();
  
  // Form state
  const [formData, setFormData] = useState({
    invoiceNumber: editData?.invoiceNumber || "",
    clientName: editData?.clientName || "",
    contactPerson: editData?.contactPerson || "",
    amount: editData?.amount != null ? String(editData.amount).replace("₹", "").replace(/,/g, "") : "",
    invoiceDate: editData?.invoiceDate || "",
    dueDate: editData?.dueDate || "",
    status: editData?.status || "Pending",
    remindersSent: editData?.remindersSent || 0,
    lastReminderDate: editData?.lastReminderDate || "",
    notes: editData?.notes || "",
    remindViaEmail: true,
    remindViaPost: false,
    remindViaPhone: false,
    reminderInterval: "7", // days
  });
  
  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle select changes
  const handleSelectChange = (value: string, name: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle checkbox changes
  const handleCheckboxChange = (checked: boolean, name: string) => {
    setFormData(prev => ({ ...prev, [name]: checked }));
  };
  
  // Calculate aging days
  const calculateAgingDays = () => {
    if (!formData.dueDate) return 0;
    
    const dueDate = new Date(formData.dueDate);
    const today = new Date();
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  };
  
  // Handle reminder schedule
  const handleScheduleReminders = () => {
    toast({
      title: "Reminders Scheduled",
      description: `Automated reminders have been scheduled for invoice ${formData.invoiceNumber}`,
      duration: 3000,
    });
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.invoiceNumber || !formData.clientName || !formData.amount || !formData.dueDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        duration: 3000,
      });
      return;
    }
    
    // Calculate aging days
    const agingDays = calculateAgingDays();
    
    // Format the amount with rupee sign
    const formattedData = {
      ...formData,
      amount: formData.amount ? `₹${formData.amount}` : "",
      agingDays: agingDays
    };
    
    // Submit the form
    onSubmit(formattedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Collection Task" : "Add Collection Task"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice Number *</Label>
              <Input 
                id="invoiceNumber" 
                name="invoiceNumber" 
                value={formData.invoiceNumber} 
                onChange={handleChange} 
                placeholder="Enter invoice number" 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Invoice Amount (₹) *</Label>
              <Input 
                id="amount" 
                name="amount" 
                value={formData.amount} 
                onChange={handleChange} 
                placeholder="Enter invoice amount" 
                required 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name *</Label>
              <Input 
                id="clientName" 
                name="clientName" 
                value={formData.clientName} 
                onChange={handleChange} 
                placeholder="Enter client name" 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contactPerson">Contact Person</Label>
              <Input 
                id="contactPerson" 
                name="contactPerson" 
                value={formData.contactPerson} 
                onChange={handleChange} 
                placeholder="Enter contact person" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date</Label>
              <Input 
                id="invoiceDate" 
                name="invoiceDate" 
                type="date" 
                value={formData.invoiceDate} 
                onChange={handleChange} 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input 
                id="dueDate" 
                name="dueDate" 
                type="date" 
                value={formData.dueDate} 
                onChange={handleChange}
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                name="status" 
                value={formData.status} 
                onValueChange={(value) => handleSelectChange(value, "status")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                  <SelectItem value="Severely Overdue">Severely Overdue</SelectItem>
                  <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2 border rounded-md p-4 bg-gray-50 dark:bg-gray-900">
            <h4 className="font-medium mb-2">Reminder Settings</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="remindersSent">Reminders Already Sent</Label>
                <Input 
                  id="remindersSent" 
                  name="remindersSent" 
                  type="number"
                  min="0"
                  value={formData.remindersSent} 
                  onChange={handleChange} 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="lastReminderDate">Last Reminder Date</Label>
                <Input 
                  id="lastReminderDate" 
                  name="lastReminderDate" 
                  type="date" 
                  value={formData.lastReminderDate} 
                  onChange={handleChange} 
                />
              </div>
            </div>
            
            <div className="space-y-2 mt-4">
              <Label>Reminder Channels</Label>
              <div className="flex gap-6 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="remindViaEmail" 
                    checked={formData.remindViaEmail}
                    onCheckedChange={(checked) => handleCheckboxChange(!!checked, "remindViaEmail")}
                  />
                  <Label 
                    htmlFor="remindViaEmail" 
                    className="text-sm font-normal cursor-pointer"
                  >
                    Email
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="remindViaPost" 
                    checked={formData.remindViaPost}
                    onCheckedChange={(checked) => handleCheckboxChange(!!checked, "remindViaPost")}
                  />
                  <Label 
                    htmlFor="remindViaPost" 
                    className="text-sm font-normal cursor-pointer"
                  >
                    Postal Mail
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="remindViaPhone" 
                    checked={formData.remindViaPhone}
                    onCheckedChange={(checked) => handleCheckboxChange(!!checked, "remindViaPhone")}
                  />
                  <Label 
                    htmlFor="remindViaPhone" 
                    className="text-sm font-normal cursor-pointer"
                  >
                    Phone Call
                  </Label>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 mt-4">
              <Label htmlFor="reminderInterval">Reminder Interval</Label>
              <Select 
                name="reminderInterval" 
                value={formData.reminderInterval} 
                onValueChange={(value) => handleSelectChange(value, "reminderInterval")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Every 3 days</SelectItem>
                  <SelectItem value="7">Every 7 days</SelectItem>
                  <SelectItem value="14">Every 14 days</SelectItem>
                  <SelectItem value="30">Every 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              type="button" 
              variant="outline" 
              className="mt-4"
              onClick={handleScheduleReminders}
            >
              Schedule Automated Reminders
            </Button>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea 
              id="notes" 
              name="notes" 
              value={formData.notes} 
              onChange={handleChange} 
              placeholder="Collection notes, payment commitments, etc." 
              rows={3} 
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-safend-red hover:bg-safend-red/90">
              {editData ? "Update Collection Task" : "Create Collection Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
