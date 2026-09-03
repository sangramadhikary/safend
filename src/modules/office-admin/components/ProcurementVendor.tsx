'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/contexts/AppDataContext";
import { BrandLoader } from "@/components/ui/brand-loader";

export function ProcurementVendor() {
  const { isLoading } = useAppData();
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-white rounded-lg">
        <BrandLoader size="lg" message="Loading procurement..." />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Procurement & Vendor Management</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>Purchase Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">Create, track and approve purchase requests for your branch.</p>
          <Button>Create New Request</Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">Manage GST-compliant purchase orders and vendor relationships.</p>
          <Button>View Purchase Orders</Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Vendor Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">Track vendor performance, SLAs, and payment history.</p>
          <Button>View Vendors</Button>
        </CardContent>
      </Card>
    </div>
  );
}
