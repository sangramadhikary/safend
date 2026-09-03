'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/contexts/AppDataContext";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Filter, Wrench, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MaintenanceTicketForm } from "./maintenance/MaintenanceTicketForm";
import { MaintenanceScheduleForm } from "./maintenance/MaintenanceScheduleForm";
import { MaintenanceTicketsList } from "./maintenance/MaintenanceTicketsList";
import { MaintenanceSchedulesList } from "./maintenance/MaintenanceSchedulesList";

export function MaintenanceRepairs() {
  const { activeBranch, isLoading } = useAppData();
  const [activeTab, setActiveTab] = useState("tickets");
  const [searchQuery, setSearchQuery] = useState("");
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingAnimation size="lg" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Maintenance & Repairs</h2>
        
        <div className="flex gap-2">
          <Dialog open={isTicketFormOpen} onOpenChange={setIsTicketFormOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-1">
                <PlusCircle className="h-4 w-4" />
                <span>New Ticket</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create Maintenance Ticket</DialogTitle>
              </DialogHeader>
              <MaintenanceTicketForm 
                branchId={activeBranch} 
                onSuccess={() => setIsTicketFormOpen(false)} 
              />
            </DialogContent>
          </Dialog>
          
          <Dialog open={isScheduleFormOpen} onOpenChange={setIsScheduleFormOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Schedule Maintenance</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create Maintenance Schedule</DialogTitle>
              </DialogHeader>
              <MaintenanceScheduleForm 
                branchId={activeBranch} 
                onSuccess={() => setIsScheduleFormOpen(false)} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search maintenance records..."
            className="pl-8 w-full"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Button variant="outline" size="sm" className="flex items-center gap-1">
          <Filter className="h-4 w-4" />
          <span>Filter</span>
        </Button>
      </div>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium">
            Maintenance Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="tickets" className="flex items-center gap-1">
                <Wrench className="h-4 w-4" />
                <span>Maintenance Tickets</span>
              </TabsTrigger>
              <TabsTrigger value="schedules" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Maintenance Schedule</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="tickets">
              <MaintenanceTicketsList 
                branchId={activeBranch} 
                searchQuery={searchQuery} 
              />
            </TabsContent>
            
            <TabsContent value="schedules">
              <MaintenanceSchedulesList 
                branchId={activeBranch} 
                searchQuery={searchQuery} 
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
