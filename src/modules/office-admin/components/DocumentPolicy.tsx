'use client';

import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Clock, CheckCircle } from "lucide-react";

export function DocumentPolicy() {
  const { user } = useAppData();
  
  const policies = [
    {
      id: "POL-001",
      name: "Document Retention Policy",
      version: "2.1",
      lastUpdated: "2025-03-15",
      category: "Corporate",
      status: "Active",
    },
    {
      id: "POL-002",
      name: "Data Security Protocol",
      version: "3.0",
      lastUpdated: "2025-04-02",
      category: "IT",
      status: "Active",
    },
    {
      id: "POL-003",
      name: "Document Handling Guidelines",
      version: "1.5",
      lastUpdated: "2025-02-20",
      category: "Operations",
      status: "Active",
    },
    {
      id: "POL-004",
      name: "Document Archival Procedure",
      version: "2.0",
      lastUpdated: "2025-01-10",
      category: "Corporate",
      status: "Active",
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Document Policies</h2>
          <p className="text-muted-foreground">
            Company-wide document management policies and procedures
          </p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Request New Policy
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {policies.map((policy) => (
          <Card key={policy.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between">
                <CardTitle>{policy.name}</CardTitle>
                <div className="flex items-center text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {policy.status}
                </div>
              </div>
              <CardDescription>ID: {policy.id} • Version {policy.version}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1.5" />
                  Last updated on {new Date(policy.lastUpdated).toLocaleDateString()}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  Category: {policy.category}
                </div>
                <div className="flex justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Document Policy Compliance</CardTitle>
          <CardDescription>
            Your acknowledgment status for current document policies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h4 className="font-medium">Document Retention Policy v2.1</h4>
                <p className="text-sm text-muted-foreground">Required by: Apr 30, 2025</p>
              </div>
              <div className="flex items-center text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4 mr-1" />
                Acknowledged
              </div>
            </div>
            
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h4 className="font-medium">Data Security Protocol v3.0</h4>
                <p className="text-sm text-muted-foreground">Required by: Apr 15, 2025</p>
              </div>
              <div className="flex items-center text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4 mr-1" />
                Acknowledged
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium">Document Archival Procedure v2.0</h4>
                <p className="text-sm text-muted-foreground">Required by: May 10, 2025</p>
              </div>
              <Button size="sm" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Review & Acknowledge
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
