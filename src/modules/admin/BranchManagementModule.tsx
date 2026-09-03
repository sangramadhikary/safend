'use client';
import React, { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Building2, 
  Search, 
  Plus, 
  Users, 
  Filter, 
  MapPin, 
  RefreshCw, 
  Download, 
  Settings,
  ChevronDown
} from "lucide-react";
import { BranchList } from "@/components/admin/branch/BranchList";
import { BranchUserAssignment } from "@/components/admin/branch/BranchUserAssignment";
import { BranchDetails } from "@/components/admin/branch/BranchDetails";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Branch } from "@/types/branch";

const initialBranches: Branch[] = [
  {
    id: "b1",
    name: "Mumbai HQ",
    code: "MUM-001",
    type: "main",
    address: "123 Marine Drive",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    postalCode: "400001",
    phone: "+91 22-12345678",
    email: "mumbai@safend.com",
    managerName: "Rahul Sharma",
    managerId: "u1",
    status: "active",
    createdAt: "2024-01-01T08:00:00Z",
    updatedAt: "2024-04-15T10:30:00Z",
  },
  {
    id: "b2",
    name: "Delhi Branch",
    code: "DEL-002",
    type: "sub",
    address: "456 Connaught Place",
    city: "New Delhi",
    state: "Delhi",
    country: "India",
    postalCode: "110001",
    phone: "+91 11-23456789",
    email: "delhi@safend.com",
    managerName: "Priya Patel",
    managerId: "u2",
    status: "active",
    createdAt: "2024-01-15T09:00:00Z",
    updatedAt: "2024-04-12T11:20:00Z",
  },
  {
    id: "b3",
    name: "Bangalore Office",
    code: "BLR-003",
    type: "sub",
    address: "789 MG Road",
    city: "Bangalore",
    state: "Karnataka",
    country: "India",
    postalCode: "560001",
    phone: "+91 80-34567890",
    email: "bangalore@safend.com",
    managerName: "Amit Singh",
    managerId: "u3",
    status: "active",
    createdAt: "2024-02-01T10:00:00Z",
    updatedAt: "2024-04-10T14:45:00Z",
  },
  {
    id: "b4",
    name: "Chennai Location",
    code: "CHN-004",
    type: "sub",
    address: "321 Anna Salai",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    postalCode: "600002",
    phone: "+91 44-45678901",
    email: "chennai@safend.com",
    managerName: "Deepika Kumar",
    managerId: "u4",
    status: "active",
    createdAt: "2024-02-15T11:00:00Z",
    updatedAt: "2024-04-05T16:30:00Z",
  },
  {
    id: "b5",
    name: "Hyderabad Center",
    code: "HYD-005",
    type: "sub",
    address: "654 Banjara Hills",
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    postalCode: "500034",
    phone: "+91 40-56789012",
    email: "hyderabad@safend.com",
    managerName: "Vijay Reddy",
    managerId: "u5",
    status: "inactive",
    createdAt: "2024-03-01T12:00:00Z",
    updatedAt: "2024-03-15T09:30:00Z",
  }
];

export function BranchManagementModule() {
  const [activeTab, setActiveTab] = useState("branches");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const filteredBranches = useMemo(() => {
    return branches.filter(branch => {
      const matchesSearch = 
        branch.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        branch.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        branch.city.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === "all" || branch.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [branches, searchTerm, filterStatus]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Simulate API refresh
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: "Data refreshed",
        description: "Branch data has been refreshed",
      });
    }, 1000);
  };

  const handleBranchSelect = (branch: Branch) => {
    setSelectedBranch(branch);
    setActiveTab("details");
  };

  const handleCreateBranch = () => {
    setSelectedBranch(null);
    setActiveTab("details");
  };

  return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-8 w-8 text-safend-red" />
              Branch Management
            </h1>
            <p className="text-muted-foreground">
              Manage branches and assign users with specific permissions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              className="gap-2"
              onClick={handleCreateBranch}
            >
              <Plus className="h-4 w-4" />
              <span>New Branch</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Branch Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Download className="mr-2 h-4 w-4" /> Export Branches
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MapPin className="mr-2 h-4 w-4" /> Map View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 md:w-auto">
            <TabsTrigger value="branches" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>Branches</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>User Assignment</span>
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>Branch Details</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {activeTab !== "details" && (
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${activeTab === "branches" ? "branches" : "users"}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex items-center gap-2">
                        <span>Filter: {filterStatus === "all" ? "All" : filterStatus}</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                        All
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus("active")}>
                        Active
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus("inactive")}>
                        Inactive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}

            <TabsContent value="branches" className="p-0">
              <BranchList 
                branches={filteredBranches} 
                onSelectBranch={handleBranchSelect}
                onUpdateBranch={(updatedBranch) => {
                  setBranches(branches.map(b => b.id === updatedBranch.id ? updatedBranch : b));
                  toast({
                    title: "Branch updated",
                    description: `${updatedBranch.name} has been updated.`,
                  });
                }}
                onDeleteBranch={(branchId) => {
                  setBranches(branches.filter(b => b.id !== branchId));
                  toast({
                    title: "Branch deleted",
                    description: "Branch has been removed from the system.",
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="users" className="p-0">
              <BranchUserAssignment 
                branches={branches}
                searchTerm={searchTerm}
              />
            </TabsContent>

            <TabsContent value="details" className="p-0">
              <BranchDetails 
                branch={selectedBranch}
                onSave={(branchData) => {
                  if (branchData.id) {
                    // Update existing branch
                    const updatedBranch: Branch = {
                      id: branchData.id,
                      name: branchData.name || "",
                      code: branchData.code || "",
                      type: branchData.type || "sub",
                      address: branchData.address || "",
                      city: branchData.city || "",
                      state: branchData.state || "",
                      country: branchData.country || "",
                      postalCode: branchData.postalCode || "",
                      phone: branchData.phone || "",
                      email: branchData.email || "",
                      managerName: branchData.managerName || "",
                      managerId: branchData.managerId || null,
                      status: branchData.status || "inactive",
                      createdAt: branchData.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                    
                    setBranches(branches.map(b => b.id === branchData.id ? updatedBranch : b));
                    toast({
                      title: "Branch updated",
                      description: `${updatedBranch.name} has been updated.`,
                    });
                  } else {
                    // Create new branch
                    const newBranch: Branch = {
                      id: `b${branches.length + 1}`,
                      name: branchData.name || "",
                      code: branchData.code || "",
                      type: branchData.type || "sub",
                      address: branchData.address || "",
                      city: branchData.city || "",
                      state: branchData.state || "",
                      country: branchData.country || "",
                      postalCode: branchData.postalCode || "",
                      phone: branchData.phone || "",
                      email: branchData.email || "",
                      managerName: branchData.managerName || "",
                      managerId: null,
                      status: branchData.status || "inactive",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                    
                    setBranches([...branches, newBranch]);
                    toast({
                      title: "Branch created",
                      description: `${newBranch.name} has been added to the system.`,
                    });
                  }
                  setActiveTab("branches");
                }}
                onCancel={() => setActiveTab("branches")}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
  );
}
