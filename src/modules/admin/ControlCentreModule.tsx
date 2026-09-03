'use client';

import React, { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Building2, 
  Search, 
  Users, 
  Filter, 
  RefreshCw, 
  Settings,
  Activity,
  Bell,
  Database
} from "lucide-react";
import { EnhancedButton as Button } from "@/components/ui/enhanced-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useBranch } from "@/contexts/BranchContext";
import { BranchManager } from "@/components/admin/control-centre/BranchManager";
import { UserRolesManager } from "@/components/admin/control-centre/UserRolesManager";
import { EmailNotificationSettings } from "@/components/admin/control-centre/EmailNotificationSettings";
import { ActivityAudit } from "@/components/admin/control-centre/ActivityAudit";
import { HealthMetrics } from "@/components/admin/control-centre/HealthMetrics";
import { ThirdPartyIntegrations } from "@/components/admin/control-centre/ThirdPartyIntegrations";
import { ClientUserManager } from "@/components/admin/control-centre/ClientUserManager";
import { EmployeeUserManager } from "@/components/admin/control-centre/EmployeeUserManager";
import { getSoundBus } from "@/services/SoundService";

export function ControlCentreModule() {
  const [activeTab, setActiveTab] = useState("branch-manager");
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { currentBranch, isMainBranch, isMainBranchUser } = useBranch();
  
  // Play welcome sound when control center loads
  useEffect(() => {
    if (typeof window !== 'undefined') getSoundBus().play('welcome');
  }, []);
  
  // Play sound when changing tabs
  const handleTabChange = (value: string) => {
    if (typeof window !== 'undefined') getSoundBus().play('click');
    setActiveTab(value);
  };

  // Handle refresh button click
  const handleRefresh = () => {
    setIsRefreshing(true);
    if (typeof window !== 'undefined') getSoundBus().play('click');
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };
  
  return (
      <div className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Settings className="h-8 w-8 text-red-600" />
              Control Centre
            </h1>
            <p className="text-muted-foreground">
              {isMainBranchUser 
                ? 'Unified administration and branch management system'
                : `Managing branch: ${currentBranch?.name} (${currentBranch?.code})`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Control Centre</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Database className="mr-2 h-4 w-4" /> Database Status
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="branch-manager" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Branch Manager</span>
            </TabsTrigger>
            <TabsTrigger value="users-roles" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Users & Roles</span>
            </TabsTrigger>
            <TabsTrigger value="client-users" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Client Portal</span>
            </TabsTrigger>
            <TabsTrigger value="employee-users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Employee Portal</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="activity-audit" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
            <TabsTrigger value="health-metrics" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Health</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 w-full">
            {activeTab === "branch-manager" && (
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search branches..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            )}

            <TabsContent value="branch-manager" className="p-0 w-full">
              <BranchManager searchTerm={searchTerm} />
            </TabsContent>

            <TabsContent value="users-roles" className="p-0 w-full">
              <UserRolesManager />
            </TabsContent>

            <TabsContent value="client-users" className="p-0 w-full">
              <ClientUserManager />
            </TabsContent>

            <TabsContent value="employee-users" className="p-0 w-full">
              <EmployeeUserManager />
            </TabsContent>

            <TabsContent value="notifications" className="p-0 w-full">
              <EmailNotificationSettings />
            </TabsContent>
            
            <TabsContent value="activity-audit" className="p-0 w-full">
              <ActivityAudit />
            </TabsContent>
            
            <TabsContent value="health-metrics" className="p-0 w-full">
              <HealthMetrics />
            </TabsContent>
          </div>
        </Tabs>
      </div>
  );
}
