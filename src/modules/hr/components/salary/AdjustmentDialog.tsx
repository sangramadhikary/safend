'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  name: string;
  [key: string]: any;
}

interface AdjustmentFormData {
  employeeId: string;
  type: "Allowance" | "Deduction";
  description: string;
  amount: number;
}

interface AdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (adjustment: AdjustmentFormData) => void;
  employees: Employee[];
  formData: AdjustmentFormData;
  setFormData: (data: AdjustmentFormData) => void;
}

export function AdjustmentDialog({
  isOpen,
  onClose,
  onAdd,
  employees,
  formData,
  setFormData
}: AdjustmentDialogProps) {
  const { toast } = useToast();

  const handleAddAdjustment = () => {
    if (!formData.employeeId || !formData.description || !formData.amount) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    
    onAdd(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>Add Salary Adjustment</DialogTitle>
          <DialogDescription>
            Add allowances or deductions for employees.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="employee">Employee</Label>
            <Select 
              value={formData.employeeId || (employees[0]?.id || "default-employee-id")} // Provide a default value
              onValueChange={(value) => setFormData({...formData, employeeId: value})}
            >
              <SelectTrigger id="employee">
                <SelectValue placeholder="Select Employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.length > 0 ? (
                  employees.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                  ))
                ) : (
                  // Ensure there's always at least one item with a valid value
                  <SelectItem value="default-employee-id">No employees available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select 
              value={formData.type} 
              onValueChange={(value) => setFormData({...formData, type: value as "Allowance" | "Deduction"})}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Allowance">Allowance</SelectItem>
                <SelectItem value="Deduction">Deduction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input 
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="e.g. Overtime, Advance, etc."
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input 
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
              min={0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAddAdjustment}>
            Add Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
