'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserPermissions } from "@/components/admin/UserPermissions";
import { UserActivity } from "@/components/admin/UserActivity";
import { RoleManagement } from "@/components/admin/RoleManagement";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { Card } from "@/components/ui/card";
import { Settings, Users, Shield, ActivitySquare, Filter, ChevronDown } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";

// Filter options
const filterOptions = {
  "user-permissions": ["All Users", "Active Users", "Inactive Users", "New Users"],
  "role-management": ["All Roles", "Admin Roles", "User Roles", "Custom Roles"],
  "user-activity": ["All Activity", "Today", "This Week", "This Month"],
  "settings": ["General", "Security", "Notifications", "Integrations"]
};

export function AdminControlPanel() {
  const [activeTab, setActiveTab] = useState("user-permissions");
  const [activeFilter, setActiveFilter] = useState<string>("All Users");
  const [userRole, setUserRole] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [filterIsOpen, setFilterIsOpen] = useState(false);
  
  // Simulated getting user role from auth context
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // In a real app, this would come from an auth context or API
    const storedRole = localStorage.getItem("userRole");
    if (storedRole) {
      setUserRole(storedRole);
    }
    
    // For branch users, we'd get their branch ID
    if (storedRole === "branch") {
      const simulatedBranchId = localStorage.getItem("branchId") || "branch-001";
      setBranchId(simulatedBranchId);
    }
  }, []);
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    
    // Reset filter to first option when changing tabs
    setActiveFilter(filterOptions[value as keyof typeof filterOptions][0]);
  };
  
  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setFilterIsOpen(false);
  };
  
  const currentFilters = filterOptions[activeTab as keyof typeof filterOptions];
  
  return (
      <motion.div 
        className="space-y-6 page-transition"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-3xl font-bold">Admin Control Panel</h1>
          <p className="text-muted-foreground">
            Manage user permissions, roles, and monitor system activity
          </p>
        </div>
        
        <Card className="glass-card p-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex justify-between items-center mb-6">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="user-permissions" className="flex gap-2 items-center">
                  <Users className="h-4 w-4" />
                  <span>User Permissions</span>
                </TabsTrigger>
                <TabsTrigger value="role-management" className="flex gap-2 items-center">
                  <Shield className="h-4 w-4" />
                  <span>Role Management</span>
                </TabsTrigger>
                <TabsTrigger value="user-activity" className="flex gap-2 items-center">
                  <ActivitySquare className="h-4 w-4" />
                  <span>User Activity</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex gap-2 items-center">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </TabsTrigger>
              </TabsList>
              
              <DropdownMenu open={filterIsOpen} onOpenChange={setFilterIsOpen}>
                <DropdownMenuTrigger asChild>
                  <motion.button 
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-secondary hover:bg-secondary/80 transition-all duration-300 btn-press-effect"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Filter className="h-4 w-4" />
                    <span>{activeFilter}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${filterIsOpen ? 'rotate-180' : ''}`} />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="animate-spring-in">
                  {currentFilters.map((filter) => (
                    <DropdownMenuItem 
                      key={filter} 
                      onClick={() => handleFilterChange(filter)}
                      className={`cursor-pointer transition-colors ${filter === activeFilter ? 'bg-safend-red/10 font-medium' : ''}`}
                    >
                      {filter}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div>
              <TabsContent value="user-permissions" className="space-y-4 animate-fade-in">
                <UserPermissions branchFilter={branchId} />
              </TabsContent>
              
              <TabsContent value="role-management" className="space-y-4 animate-fade-in">
                <RoleManagement branchFilter={branchId} />
              </TabsContent>
              
              <TabsContent value="user-activity" className="space-y-4 animate-fade-in">
                <UserActivity branchFilter={branchId} />
              </TabsContent>
              
              <TabsContent value="settings" className="space-y-4 animate-fade-in">
                <AdminSettings />
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </motion.div>
  );
}
