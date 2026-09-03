'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, Search, Filter, Download, QrCode } from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import { VisitorsList } from "./VisitorsList";
import { GatePassList } from "./GatePassList";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VisitorForm } from "./VisitorForm";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export function VisitorManagement() {
  const { activeBranch, branches, isLoading } = useAppData();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("visitors");
  const [isVisitorFormOpen, setIsVisitorFormOpen] = useState(false);
  const { toast } = useToast();
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingAnimation size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Visitor Management</h2>
      </div>
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search visitors or gate passes..."
            className="pl-8 w-full"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
          <Dialog open={isVisitorFormOpen} onOpenChange={setIsVisitorFormOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-1">
                <PlusCircle className="h-4 w-4" />
                <span>New Visitor</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Visitor Check-In</DialogTitle>
              </DialogHeader>
              <VisitorForm 
                branchId={activeBranch}
                onSuccess={() => {
                  setIsVisitorFormOpen(false);
                  toast({
                    title: "Visitor Checked In",
                    description: "Visitor has been successfully checked in",
                  });
                }} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            Visitor Management - {activeBranchName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="visitors">Visitors</TabsTrigger>
              <TabsTrigger value="gatePasses">Gate Passes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="visitors">
              <VisitorsList searchQuery={searchQuery} branchId={activeBranch} />
            </TabsContent>
            
            <TabsContent value="gatePasses">
              <GatePassList searchQuery={searchQuery} branchId={activeBranch} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
