'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createVehicle, updateVehicle } from "@/services/fleet/FleetService";
import { Vehicle } from "@/types/fleet";
import { getAllHREmployees, HREmployee } from "@/services/supabase/HREmployeeService";
import { traccarFetch, traccarMutate } from "@/services/traccar/traccarApi";
import { Search, Radio, Plus, Link2, CheckCircle2 } from "lucide-react";

interface VehicleFormProps {
  branchId: string;
  onSuccess: () => void;
  editVehicle?: Vehicle;
}

export function VehicleForm({ branchId, onSuccess, editVehicle }: VehicleFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const isEditMode = !!editVehicle;

  // Traccar device state
  const [traccarDevices, setTraccarDevices] = useState<{ id: number; name: string; uniqueId: string; status: string }[]>([]);
  const [traccarLoading, setTraccarLoading] = useState(false);
  const [creatingDevice, setCreatingDevice] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState(
    editVehicle?.traccarDeviceId ||
    (editVehicle?.registrationNumber
      ? editVehicle.registrationNumber.toLowerCase().replace(/\s+/g, '') + '-' + crypto.randomUUID().slice(0, 6)
      : "")
  );
  const [showCreateDevice, setShowCreateDevice] = useState(false);

  const [formData, setFormData] = useState({
    model: editVehicle?.model || "",
    type: (editVehicle?.type || "car") as Vehicle["type"],
    registrationNumber: editVehicle?.registrationNumber || "",
    ownership: (editVehicle?.ownership || "company-owned") as Vehicle["ownership"],
    fuelType: (editVehicle?.fuelType || "petrol") as Vehicle["fuelType"],
    currentOdometer: editVehicle?.currentOdometer || 0,
    ratePerKm: editVehicle?.ratePerKm || 10,
    purchaseDate: editVehicle?.purchaseDate ? editVehicle.purchaseDate.split('T')[0] : "",
    insuranceExpiryDate: editVehicle?.insuranceExpiryDate ? editVehicle.insuranceExpiryDate.split('T')[0] : "",
    pollutionCertExpiryDate: editVehicle?.pollutionCertExpiryDate ? editVehicle.pollutionCertExpiryDate.split('T')[0] : "",
    assignedDriver: editVehicle?.assignedDriver || "",
    ownerName: editVehicle?.ownerName || "",
    ownerEmployeeId: editVehicle?.ownerEmployeeId || "",
    department: (editVehicle?.department || "") as string,
    traccarDeviceId: editVehicle?.traccarDeviceId || "",
    traccarDeviceName: editVehicle?.traccarDeviceName || "",
    dlNumber: editVehicle?.dlNumber || "",
    dlExpiryDate: editVehicle?.dlExpiryDate ? editVehicle.dlExpiryDate.split('T')[0] : "",
    maintenanceInterval: editVehicle?.maintenanceInterval || 5000,
  });

  // Fetch employees for dropdown
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const result = await getAllHREmployees();
        if (result.success && result.data) {
          setEmployees(result.data.filter(e => e.status === 'Active'));
        }
      } catch (err) {
        console.error("Error loading employees:", err);
      }
    };
    loadEmployees();
  }, []);

  // Initialize search with existing owner name in edit mode
  useEffect(() => {
    if (editVehicle?.ownerName) {
      setEmployeeSearch(editVehicle.ownerName);
    }
  }, [editVehicle]);

  // Fetch Traccar devices
  useEffect(() => {
    const loadTraccarDevices = async () => {
      setTraccarLoading(true);
      try {
        setTraccarDevices(await traccarFetch<any[]>('/api/traccar/devices'));
      } catch (err) {
        console.error('Error loading Traccar devices:', err);
      } finally {
        setTraccarLoading(false);
      }
    };
    loadTraccarDevices();
  }, []);

  // Create a new device in Traccar
  const handleCreateTraccarDevice = async () => {
    if (!newDeviceId.trim()) {
      toast({ title: 'Required', description: 'Enter a Device Identifier for Traccar', variant: 'destructive' });
      return;
    }

    setCreatingDevice(true);
    try {
      const deviceName = formData.ownerName
        ? `${formData.ownerName} (${formData.department || 'field'})`
        : newDeviceId;

      const payload: Record<string, any> = {
        name: deviceName,
        uniqueId: newDeviceId.trim().toLowerCase(),
        category: 'person',
        model: formData.model || undefined,
        contact: formData.ownerName || undefined,
        // Store context in Traccar device attributes for reference
        attributes: {
          employeeName: formData.ownerName || '',
          employeeId: formData.ownerEmployeeId || '',
          department: formData.department || '',
          vehicleNumber: formData.registrationNumber || '',
          vehicleModel: formData.model || '',
          ratePerKm: formData.ratePerKm || 0,
        },
      };

      const created = await traccarMutate<any>('POST', '/api/traccar/devices/manage', {
        body: payload,
      });
      setTraccarDevices(prev => [...prev, created]);
      setFormData(prev => ({
        ...prev,
        traccarDeviceId: created.uniqueId,
        traccarDeviceName: created.name,
      }));
      setShowCreateDevice(false);
      setNewDeviceId('');
      toast({ title: 'Device Created', description: `GPS device "${created.uniqueId}" registered in Traccar` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create Traccar device', variant: 'destructive' });
    } finally {
      setCreatingDevice(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? parseFloat(value) || 0 : value 
    }));
    // Auto-update Traccar device ID when registration number changes (crypto-random suffix for anti-fraud)
    if (name === 'registrationNumber') {
      setNewDeviceId(value.toLowerCase().replace(/\s+/g, '') + '-' + crypto.randomUUID().slice(0, 6));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEmployeeSelect = (employee: HREmployee) => {
    setFormData(prev => ({
      ...prev,
      ownerName: employee.name,
      ownerEmployeeId: employee.id || employee.employeeId,
    }));
    setEmployeeSearch(employee.name);
    setShowEmployeeDropdown(false);
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    emp.employeeId.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.model || !formData.registrationNumber) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (formData.ownership === 'employee-owned' && !formData.ownerName) {
      toast({
        title: "Validation Error",
        description: "Please select an employee for employee-owned vehicles",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);

      // Auto-create Traccar device if employee-owned and device ID is set
      if (formData.ownership === 'employee-owned' && newDeviceId && !formData.traccarDeviceId) {
        try {
          const deviceName = formData.ownerName
            ? `${formData.ownerName} (${formData.department || 'field'})`
            : newDeviceId;

          const payload = {
            name: deviceName,
            uniqueId: newDeviceId.trim().toLowerCase(),
            category: 'person',
            model: formData.model || undefined,
            contact: formData.ownerName || undefined,
            attributes: {
              employeeName: formData.ownerName || '',
              employeeId: formData.ownerEmployeeId || '',
              department: formData.department || '',
              vehicleNumber: formData.registrationNumber || '',
              vehicleModel: formData.model || '',
              ratePerKm: formData.ratePerKm || 0,
            },
          };

          // Don't block vehicle creation if Traccar device creation fails.
          const created = await traccarMutate<any>('POST', '/api/traccar/devices/manage', {
            body: payload,
          });
          formData.traccarDeviceId = created.uniqueId;
          formData.traccarDeviceName = created.name;
        } catch (traccarErr) {
          console.warn('Traccar device creation error:', traccarErr);
        }
      }
      
      if (isEditMode && editVehicle) {
        await updateVehicle({
          ...editVehicle,
          ...formData,
          department: (formData.department || undefined) as Vehicle['department'],
          branchId,
        });
        toast({
          title: "Success",
          description: "Vehicle details updated successfully"
        });
      } else {
        await createVehicle({
          ...formData,
          department: (formData.department || undefined) as Vehicle['department'],
          branchId,
          status: 'available',
        });
        toast({
          title: "Success",
          description: "Vehicle has been registered successfully"
        });
      }
      
      onSuccess();
    } catch (error) {
      console.error("Error saving vehicle:", error);
      toast({
        title: "Error",
        description: isEditMode ? "Failed to update vehicle" : "Failed to register vehicle",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Ownership Category */}
      <div className="space-y-2">
        <Label htmlFor="ownership">Ownership Category <span className="text-red-500">*</span></Label>
        <Select
          value={formData.ownership}
          onValueChange={(value) => handleSelectChange("ownership", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="company-owned">Company Owned (Fixed Fleet)</SelectItem>
            <SelectItem value="employee-owned">Employee Owned (Per KM Reimbursement)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {formData.ownership === 'company-owned' 
            ? "Company vehicles have fixed fueling with bill upload for expense records" 
            : "Employee vehicles get ₹/km reimbursement logged via Operations → Petrol module"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="model">Model <span className="text-red-500">*</span></Label>
          <Input
            id="model"
            name="model"
            placeholder="e.g. Toyota Innova"
            value={formData.model}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="type">Vehicle Type <span className="text-red-500">*</span></Label>
          <Select
            value={formData.type}
            onValueChange={(value) => handleSelectChange("type", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="car">Car</SelectItem>
              <SelectItem value="suv">SUV</SelectItem>
              <SelectItem value="van">Van</SelectItem>
              <SelectItem value="truck">Truck</SelectItem>
              <SelectItem value="bus">Bus</SelectItem>
              <SelectItem value="motorcycle">Motorcycle</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="registrationNumber">Registration Number <span className="text-red-500">*</span></Label>
          <Input
            id="registrationNumber"
            name="registrationNumber"
            placeholder="e.g. DL01AB1234"
            value={formData.registrationNumber}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="fuelType">Fuel Type <span className="text-red-500">*</span></Label>
          <Select
            value={formData.fuelType}
            onValueChange={(value) => handleSelectChange("fuelType", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="petrol">Petrol</SelectItem>
              <SelectItem value="diesel">Diesel</SelectItem>
              <SelectItem value="cng">CNG</SelectItem>
              <SelectItem value="electric">Electric</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Employee Selection - only for employee-owned */}
        {formData.ownership === 'employee-owned' && (
          <div className="space-y-2 col-span-1 md:col-span-2">
            <Label>Employee Name <span className="text-red-500">*</span></Label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employee by name or ID..."
                  className="pl-8"
                  value={employeeSearch}
                  onChange={(e) => {
                    setEmployeeSearch(e.target.value);
                    setShowEmployeeDropdown(true);
                    if (!e.target.value) {
                      setFormData(prev => ({ ...prev, ownerName: '', ownerEmployeeId: '' }));
                    }
                  }}
                  onFocus={() => setShowEmployeeDropdown(true)}
                  onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
                />
              </div>
              {showEmployeeDropdown && employeeSearch && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.slice(0, 10).map((emp) => (
                      <button
                        key={emp.id || emp.employeeId}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between items-center text-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleEmployeeSelect(emp)}
                      >
                        <span className="font-medium">{emp.name}</span>
                        <span className="text-xs text-muted-foreground">{emp.employeeId} · {emp.designation}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No employees found</div>
                  )}
                </div>
              )}
            </div>
            {formData.ownerName && (
              <p className="text-xs text-green-600">Selected: {formData.ownerName}</p>
            )}
          </div>
        )}

        {/* DL Number and Expiry - only for employee-owned */}
        {formData.ownership === 'employee-owned' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="dlNumber">Driving License No.</Label>
              <Input
                id="dlNumber"
                name="dlNumber"
                placeholder="e.g. DL-1420110012345"
                value={formData.dlNumber}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dlExpiryDate">DL Expiry Date</Label>
              <Input
                id="dlExpiryDate"
                name="dlExpiryDate"
                type="date"
                value={formData.dlExpiryDate}
                onChange={handleChange}
              />
            </div>
          </>
        )}

        {/* Department - only for employee-owned */}
        {formData.ownership === 'employee-owned' && (
          <div className="space-y-2 col-span-1 md:col-span-2">
            <Label>Department <span className="text-red-500">*</span></Label>
            <Select
              value={formData.department}
              onValueChange={(value) => handleSelectChange("department", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Department helps categorize travel costs for reimbursement and reporting
            </p>
          </div>
        )}

        {/* Traccar GPS Device - for employee-owned vehicles */}
        {formData.ownership === 'employee-owned' && (
          <div className="space-y-3 col-span-1 md:col-span-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-blue-600" />
              <Label className="text-sm font-semibold">GPS Tracking Device (Traccar)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Link a GPS device to this vehicle + employee for automatic KM tracking and reimbursement calculation
            </p>

            {/* Select existing device or create new */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Select
                    value={formData.traccarDeviceId || 'none'}
                    onValueChange={(value) => {
                      if (value === 'none') {
                        setFormData(prev => ({ ...prev, traccarDeviceId: '', traccarDeviceName: '' }));
                      } else {
                        const device = traccarDevices.find(d => d.uniqueId === value);
                        setFormData(prev => ({
                          ...prev,
                          traccarDeviceId: value,
                          traccarDeviceName: device?.name || value,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={traccarLoading ? "Loading devices..." : "Select GPS device..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No device linked —</SelectItem>
                      {traccarDevices.map(d => (
                        <SelectItem key={d.uniqueId} value={d.uniqueId}>
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${d.status === 'online' ? 'bg-green-500' : 'bg-gray-300'}`} />
                            {d.name} ({d.uniqueId})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateDevice(!showCreateDevice)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Device
                </Button>
              </div>

              {/* Create new device inline */}
              {showCreateDevice && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                  <p className="text-sm font-semibold text-blue-800">Register New GPS Device in Traccar</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-700">Device Identifier (uniqueId) *</Label>
                      <Input
                        placeholder="e.g. od05at8841-a3f2c1"
                        value={newDeviceId}
                        readOnly
                        className="bg-blue-100/50 font-mono text-xs"
                      />
                      <p className="text-[10px] text-blue-500">
                        Auto-generated with crypto suffix (anti-fraud). Employee enters this exact ID in Traccar Client app.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-700">Device Name (auto from employee)</Label>
                      <Input
                        value={formData.ownerName ? `${formData.ownerName} (${formData.department || 'field'})` : newDeviceId || '—'}
                        readOnly
                        className="bg-blue-100/50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-700">Phone (from employee)</Label>
                      <Input value={formData.ownerName || '—'} readOnly className="bg-blue-100/50" placeholder="Filled from employee" />
                      <p className="text-[10px] text-blue-500">Set manually in Traccar later if needed</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-700">Vehicle Model</Label>
                      <Input value={formData.model || '—'} readOnly className="bg-blue-100/50" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-700">Category</Label>
                      <Input value="person" readOnly className="bg-blue-100/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateTraccarDevice}
                      disabled={creatingDevice}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {creatingDevice ? 'Creating...' : 'Create Device in Traccar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowCreateDevice(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Show linked device info */}
              {formData.traccarDeviceId && (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-800">
                    <strong>Linked:</strong> {formData.traccarDeviceName || formData.traccarDeviceId}
                  </span>
                  <span className="text-xs text-green-600 ml-auto">
                    Device ID: <code className="bg-green-100 px-1 rounded">{formData.traccarDeviceId}</code>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="currentOdometer">Current Odometer (km)</Label>
          <Input
            id="currentOdometer"
            name="currentOdometer"
            type="number"
            min="0"
            value={formData.currentOdometer}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="ratePerKm">Rate per KM (₹) <span className="text-red-500">*</span></Label>
          <Input
            id="ratePerKm"
            name="ratePerKm"
            type="number"
            min="1"
            step="0.5"
            placeholder="e.g. 10"
            value={formData.ratePerKm}
            onChange={handleChange}
            required
          />
          <p className="text-xs text-muted-foreground">
            {formData.ownership === 'company-owned' 
              ? "Internal cost tracking rate" 
              : "Reimbursement rate for employee — used in Operations petrol module"}
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="maintenanceInterval">Service Interval (km)</Label>
          <Input
            id="maintenanceInterval"
            name="maintenanceInterval"
            type="number"
            min="1000"
            value={formData.maintenanceInterval}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="purchaseDate">Purchase Date</Label>
          <Input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            value={formData.purchaseDate}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="assignedDriver">Assigned Driver</Label>
          <Input
            id="assignedDriver"
            name="assignedDriver"
            value={formData.assignedDriver}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="insuranceExpiryDate">Insurance Expiry Date</Label>
          <Input
            id="insuranceExpiryDate"
            name="insuranceExpiryDate"
            type="date"
            value={formData.insuranceExpiryDate}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="pollutionCertExpiryDate">Pollution Certificate Expiry</Label>
          <Input
            id="pollutionCertExpiryDate"
            name="pollutionCertExpiryDate"
            type="date"
            value={formData.pollutionCertExpiryDate}
            onChange={handleChange}
          />
        </div>
      </div>
      
      <div className="mt-6 flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEditMode ? "Update Vehicle" : "Register Vehicle"}
        </Button>
      </div>
    </form>
  );
}
