'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useVendorStore } from "./vendorStore";
import { VendorCategory, VENDOR_CATEGORY_LABELS } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface VendorFormProps {
  vendorId: string | null;
  branchId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function VendorForm({ vendorId, branchId, onSuccess, onCancel }: VendorFormProps) {
  const { vendors, addVendor, updateVendor } = useVendorStore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingVendor = vendorId ? vendors.find(v => v.id === vendorId) : null;

  const [formData, setFormData] = useState({
    name: '',
    category: '' as VendorCategory | '',
    contact_person: '',
    phone: '',
    alt_phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gst_number: '',
    pan_number: '',
    bank_name: '',
    bank_account: '',
    ifsc_code: '',
    property_type: '',
    rent_amount: '',
    lease_start: '',
    lease_end: '',
    service_type: '',
    subscription_amount: '',
    billing_cycle: '',
    warehouse_address: '',
    warehouse_city: '',
    warehouse_state: '',
    warehouse_pincode: '',
    warehouse_contact_person: '',
    warehouse_phone: '',
    status: 'active' as 'active' | 'inactive' | 'blacklisted',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form if editing
  useEffect(() => {
    if (existingVendor) {
      setFormData({
        name: existingVendor.name,
        category: existingVendor.category,
        contact_person: existingVendor.contact_person,
        phone: existingVendor.phone,
        alt_phone: existingVendor.alt_phone || '',
        email: existingVendor.email || '',
        address: existingVendor.address || '',
        city: existingVendor.city || '',
        state: existingVendor.state || '',
        pincode: existingVendor.pincode || '',
        gst_number: existingVendor.gst_number || '',
        pan_number: existingVendor.pan_number || '',
        bank_name: existingVendor.bank_name || '',
        bank_account: existingVendor.bank_account || '',
        ifsc_code: existingVendor.ifsc_code || '',
        property_type: existingVendor.property_type || '',
        rent_amount: existingVendor.rent_amount?.toString() || '',
        lease_start: existingVendor.lease_start || '',
        lease_end: existingVendor.lease_end || '',
        service_type: existingVendor.service_type || '',
        subscription_amount: existingVendor.subscription_amount?.toString() || '',
        billing_cycle: existingVendor.billing_cycle || '',
        warehouse_address: existingVendor.warehouse_address || '',
        warehouse_city: existingVendor.warehouse_city || '',
        warehouse_state: existingVendor.warehouse_state || '',
        warehouse_pincode: existingVendor.warehouse_pincode || '',
        warehouse_contact_person: existingVendor.warehouse_contact_person || '',
        warehouse_phone: existingVendor.warehouse_phone || '',
        status: existingVendor.status,
        notes: existingVendor.notes || '',
      });
    }
  }, [existingVendor]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Vendor name is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.contact_person.trim()) newErrors.contact_person = 'Contact person is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (formData.phone && !/^\d{10}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Enter a valid 10-digit phone number';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Enter a valid email address';
    }
    if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
      newErrors.gst_number = 'Enter a valid GST number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    const vendorData = {
      name: formData.name.trim(),
      category: formData.category as VendorCategory,
      contact_person: formData.contact_person.trim(),
      phone: formData.phone.trim(),
      alt_phone: formData.alt_phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      address: formData.address.trim() || undefined,
      city: formData.city.trim() || undefined,
      state: formData.state.trim() || undefined,
      pincode: formData.pincode.trim() || undefined,
      gst_number: formData.gst_number.trim() || undefined,
      pan_number: formData.pan_number.trim() || undefined,
      bank_name: formData.bank_name.trim() || undefined,
      bank_account: formData.bank_account.trim() || undefined,
      ifsc_code: formData.ifsc_code.trim() || undefined,
      property_type: formData.property_type.trim() || undefined,
      rent_amount: formData.rent_amount ? parseFloat(formData.rent_amount) : undefined,
      lease_start: formData.lease_start || undefined,
      lease_end: formData.lease_end || undefined,
      service_type: formData.service_type.trim() || undefined,
      subscription_amount: formData.subscription_amount ? parseFloat(formData.subscription_amount) : undefined,
      billing_cycle: formData.billing_cycle || undefined,
      warehouse_address: formData.warehouse_address.trim() || undefined,
      warehouse_city: formData.warehouse_city.trim() || undefined,
      warehouse_state: formData.warehouse_state.trim() || undefined,
      warehouse_pincode: formData.warehouse_pincode.trim() || undefined,
      warehouse_contact_person: formData.warehouse_contact_person.trim() || undefined,
      warehouse_phone: formData.warehouse_phone.trim() || undefined,
      status: formData.status,
      notes: formData.notes.trim() || undefined,
      branch_id: branchId,
      created_by: 'admin', // TODO: get from auth context
    };

    let result;
    if (vendorId) {
      result = await updateVendor(vendorId, vendorData);
    } else {
      result = await addVendor(vendorData as any);
    }

    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: vendorId ? "Vendor Updated" : "Vendor Added",
        description: `${formData.name} has been ${vendorId ? 'updated' : 'added'} successfully.`,
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

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Basic Information: 3-col row ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Vendor Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="e.g., Security Solutions Ltd."
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
                {Object.entries(VENDOR_CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={v => updateField('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Contact Details: 4-col row ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contact_person">Contact Person *</Label>
            <Input
              id="contact_person"
              value={formData.contact_person}
              onChange={e => updateField('contact_person', e.target.value)}
              placeholder="Full name"
              className={errors.contact_person ? 'border-destructive' : ''}
            />
            {errors.contact_person && <p className="text-xs text-destructive">{errors.contact_person}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={e => updateField('phone', e.target.value)}
              placeholder="10-digit number"
              className={errors.phone ? 'border-destructive' : ''}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="alt_phone">Alternate Phone</Label>
            <Input id="alt_phone" value={formData.alt_phone} onChange={e => updateField('alt_phone', e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email" type="email"
              value={formData.email}
              onChange={e => updateField('email', e.target.value)}
              placeholder="vendor@example.com"
              className={errors.email ? 'border-destructive' : ''}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Billing Address | Warehouse Address (or Property Address for property_owner) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0">
        {/* Billing Address */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {formData.category === 'property_owner' ? 'Landlord / Contact Address' : 'Billing Address'}
          </h3>
          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input id="address" value={formData.address} onChange={e => updateField('address', e.target.value)} placeholder="Street address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={formData.city} onChange={e => updateField('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" value={formData.state} onChange={e => updateField('state', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pincode">Pincode</Label>
              <Input id="pincode" value={formData.pincode} onChange={e => updateField('pincode', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="hidden lg:flex justify-center px-4">
          <div className="w-px bg-border h-full" />
        </div>

        {/* Right column — Property Address for property_owner, Warehouse for all others */}
        {formData.category === 'property_owner' ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Property Address</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Physical address of the rented / owned property.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse_address">Street Address</Label>
              <Input id="warehouse_address" value={formData.warehouse_address} onChange={e => updateField('warehouse_address', e.target.value)} placeholder="Property street address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="warehouse_city">City</Label>
                <Input id="warehouse_city" value={formData.warehouse_city} onChange={e => updateField('warehouse_city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_state">State</Label>
                <Input id="warehouse_state" value={formData.warehouse_state} onChange={e => updateField('warehouse_state', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="warehouse_pincode">Pincode</Label>
                <Input id="warehouse_pincode" value={formData.warehouse_pincode} onChange={e => updateField('warehouse_pincode', e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warehouse / Pickup Address</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Leave blank if same as registered address.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse_address">Street Address</Label>
              <Input id="warehouse_address" value={formData.warehouse_address} onChange={e => updateField('warehouse_address', e.target.value)} placeholder="Warehouse / pickup street address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="warehouse_city">City</Label>
                <Input id="warehouse_city" value={formData.warehouse_city} onChange={e => updateField('warehouse_city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_state">State</Label>
                <Input id="warehouse_state" value={formData.warehouse_state} onChange={e => updateField('warehouse_state', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="warehouse_pincode">Pincode</Label>
                <Input id="warehouse_pincode" value={formData.warehouse_pincode} onChange={e => updateField('warehouse_pincode', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_phone">Warehouse Phone</Label>
                <Input id="warehouse_phone" value={formData.warehouse_phone} onChange={e => updateField('warehouse_phone', e.target.value)} placeholder="10-digit number" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse_contact_person">Contact Person at Warehouse</Label>
              <Input id="warehouse_contact_person" value={formData.warehouse_contact_person} onChange={e => updateField('warehouse_contact_person', e.target.value)} placeholder="Name of person to contact at pickup" />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* ── Business & Banking: 3-col ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business & Banking</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gst_number">GST Number</Label>
            <Input
              id="gst_number"
              value={formData.gst_number}
              onChange={e => updateField('gst_number', e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              className={errors.gst_number ? 'border-destructive' : ''}
            />
            {errors.gst_number && <p className="text-xs text-destructive">{errors.gst_number}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pan_number">PAN Number</Label>
            <Input id="pan_number" value={formData.pan_number} onChange={e => updateField('pan_number', e.target.value.toUpperCase())} placeholder="AAAAA0000A" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input id="bank_name" value={formData.bank_name} onChange={e => updateField('bank_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account">Account Number</Label>
            <Input id="bank_account" value={formData.bank_account} onChange={e => updateField('bank_account', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ifsc_code">IFSC Code</Label>
            <Input id="ifsc_code" value={formData.ifsc_code} onChange={e => updateField('ifsc_code', e.target.value.toUpperCase())} />
          </div>
        </div>
      </div>

      {/* ── Category-specific fields ── */}
      {formData.category === 'property_owner' && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Property Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="property_type">Property Type</Label>
                <Select value={formData.property_type} onValueChange={v => updateField('property_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="land">Land</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rent_amount">Monthly Rent (₹)</Label>
                <Input id="rent_amount" type="number" value={formData.rent_amount} onChange={e => updateField('rent_amount', e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lease_start">Lease Start</Label>
                <Input id="lease_start" type="date" value={formData.lease_start} onChange={e => updateField('lease_start', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lease_end">Lease End</Label>
                <Input id="lease_end" type="date" value={formData.lease_end} onChange={e => updateField('lease_end', e.target.value)} />
              </div>
            </div>
          </div>
        </>
      )}

      {formData.category === 'digital_services' && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="service_type">Service Type</Label>
                <Select value={formData.service_type} onValueChange={v => updateField('service_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hosting">Hosting</SelectItem>
                    <SelectItem value="software">Software/SaaS</SelectItem>
                    <SelectItem value="internet">Internet</SelectItem>
                    <SelectItem value="cloud">Cloud Services</SelectItem>
                    <SelectItem value="domain">Domain</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription_amount">Subscription Amount (₹)</Label>
                <Input id="subscription_amount" type="number" value={formData.subscription_amount} onChange={e => updateField('subscription_amount', e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_cycle">Billing Cycle</Label>
                <Select value={formData.billing_cycle} onValueChange={v => updateField('billing_cycle', v)}>
                  <SelectTrigger><SelectValue placeholder="Select cycle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half_yearly">Half Yearly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* ── Notes ── */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={formData.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Any additional notes about this vendor..." rows={2} />
      </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : (vendorId ? 'Update Vendor' : 'Add Vendor')}
        </Button>
      </div>
    </form>
  );
}
