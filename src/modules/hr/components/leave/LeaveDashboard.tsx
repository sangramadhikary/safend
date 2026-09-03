'use client';

import { useState, useEffect } from "react";
import { LeaveDashboardProps, UninformedLeave, AbscondCase } from "../index";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { LeaveHeatMap } from "./LeaveHeatMap";
import { UninformedLeaveList } from "./UninformedLeaveList";
import { AbscondCaseList } from "./AbscondCaseList";
import { CountUp } from "@/components/dashboard/CountUp";

export function LeaveDashboard({ filter = "All" }: LeaveDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [activeTab, setActiveTab] = useState("overview");
  const [uninformedLeaves, setUninformedLeaves] = useState<UninformedLeave[]>([]);
  const [abscondCases, setAbscondCases] = useState<AbscondCase[]>([]);
  const [branch, setBranch] = useState<string>("all");
  const { toast } = useToast();

  // Stats calculations (derived from real data when available)
  const plannedLeaveCount = 0;
  const unplannedLeaveCount = 0;
  const uninformedLeaveCount = uninformedLeaves.filter(leave => !leave.resolution).length;
  const abscondCount = abscondCases.filter(kase => kase.status === "PENDING").length;

  // Handle resolving uninformed leave
  const handleResolveUninformedLeave = (leaveId: string, resolution: 'Regularized' | 'Converted' | 'Marked Abscond') => {
    setUninformedLeaves(leaves => 
      leaves.map(leave => 
        leave.id === leaveId 
          ? { ...leave, resolution, resolvedBy: "HR Manager" } 
          : leave
      )
    );
    
    toast({
      title: "Leave Updated",
      description: `Leave has been ${resolution.toLowerCase()}`,
    });
    
    // If marked as abscond, create abscond case
    if (resolution === 'Marked Abscond') {
      const leave = uninformedLeaves.find(l => l.id === leaveId);
      if (leave) {
        const newAbscondCase: AbscondCase = {
          id: `ABS${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
          employeeId: leave.employeeId,
          employeeName: leave.employeeName,
          startDate: leave.date,
          lastContact: new Date(new Date(leave.date).getTime() - 86400000).toISOString().split('T')[0],
          status: "PENDING",
          remarks: "Created from uninformed leave.",
          createdAt: new Date().toISOString(),
          salaryCut: true
        };
        
        setAbscondCases([...abscondCases, newAbscondCase]);
        toast({
          title: "Abscond Case Created",
          description: `Employee ${leave.employeeName} marked as abscond`,
          variant: "destructive"
        });
      }
    }
  };

  // Handle closing abscond case
  const handleCloseAbscondCase = (caseId: string, remarks: string) => {
    setAbscondCases(cases => 
      cases.map(c => 
        c.id === caseId 
          ? { 
              ...c, 
              status: "CLOSED", 
              closedAt: new Date().toISOString(),
              closedBy: "HR Manager",
              remarks: remarks
            } 
          : c
      )
    );
    
    toast({
      title: "Case Closed",
      description: "Abscond case has been closed",
    });
  };

  // Filter based on selected branch
  const filteredUninformedLeaves = branch === "all" 
    ? uninformedLeaves 
    : uninformedLeaves.filter(leave => leave.branchId === branch);
  
  // Generate months for dropdown
  const generateMonthOptions = () => {
    const options = [];
    const currentDate = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate);
      date.setMonth(currentDate.getMonth() - i);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Leave Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor leave patterns, uninformed absences, and abscond cases
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            <Select
              value={selectedMonth}
              onValueChange={setSelectedMonth}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {generateMonthOptions().map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              <SelectItem value="BR001">Main Branch</SelectItem>
              <SelectItem value="BR002">North Branch</SelectItem>
              <SelectItem value="BR003">East Branch</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Planned Leaves</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><CountUp to={plannedLeaveCount} duration={2} separator="," /></div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unplanned Leaves</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><CountUp to={unplannedLeaveCount} duration={2} separator="," /></div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uninformed Leaves</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600"><CountUp to={uninformedLeaveCount} duration={2} separator="," /></div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Abscond Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600"><CountUp to={abscondCount} duration={2} separator="," /></div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="uninformed">Uninformed Leaves</TabsTrigger>
          <TabsTrigger value="abscond">Abscond Cases</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Heat Map</CardTitle>
              <CardDescription>
                Visualize leave patterns and identify potential issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaveHeatMap month={selectedMonth} />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="uninformed" className="mt-4">
          <UninformedLeaveList 
            leaves={filteredUninformedLeaves} 
            onResolve={handleResolveUninformedLeave}
          />
        </TabsContent>
        
        <TabsContent value="abscond" className="mt-4">
          <AbscondCaseList 
            cases={abscondCases} 
            onClose={handleCloseAbscondCase}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
