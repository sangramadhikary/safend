'use client';

import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search,
  Filter,
  ArrowRight,
  HelpCircle,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Clock
} from "lucide-react";

export function HelpdeskSupport() {
  const { user } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Helpdesk & Support</h2>
          <p className="text-muted-foreground">
            Submit and manage help requests and access the knowledge base
          </p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="relative grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tickets or knowledge base..."
            className="pl-9 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          
          <Button variant="default" size="sm" className="flex items-center gap-1">
            <HelpCircle className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Support Tickets</CardTitle>
          <CardDescription>
            View and manage your recent support requests
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Printer not connecting</h4>
                  <Badge variant="outline">IT Hardware</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Opened 2 days ago · Ticket #HD-2023-0342
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-500">In Progress</Badge>
                <Button variant="ghost" size="sm">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Access to Payroll Module</h4>
                  <Badge variant="outline">Access Request</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Opened 5 days ago · Ticket #HD-2023-0339
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500">Resolved</Badge>
                <Button variant="ghost" size="sm">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Error in Sales Dashboard</h4>
                  <Badge variant="outline">Software Issue</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Opened 1 week ago · Ticket #HD-2023-0331
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500">Awaiting Info</Badge>
                <Button variant="ghost" size="sm">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Popular Knowledge Base Articles</CardTitle>
          <CardDescription>
            Find solutions to common questions and issues
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="p-4 hover:bg-accent/50 cursor-pointer rounded-md">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2">
                  <HelpCircle className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">How to Generate Monthly Reports</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Step-by-step guide to creating and customizing monthly reports for your branch.
                  </p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" /> Updated 3 days ago
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 hover:bg-accent/50 cursor-pointer rounded-md">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-green-100 dark:bg-green-900 p-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Setting Up Automated Backups</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Instructions for configuring and scheduling automatic backups of your important data.
                  </p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" /> Updated 1 week ago
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 hover:bg-accent/50 cursor-pointer rounded-md">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Troubleshooting Network Connectivity</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Common solutions for network and connectivity issues at branch locations.
                  </p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" /> Updated 2 weeks ago
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
