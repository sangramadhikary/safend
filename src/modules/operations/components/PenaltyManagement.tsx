'use client';

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/ui/brand-loader";
import {
  Search, Filter, Download, Plus,
  AlertCircle, CheckCircle, Calendar
} from "lucide-react";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { PenaltyForm } from "./PenaltyForm";
import { PenaltyTable } from "./PenaltyTable";
import { usePenalties } from "../hooks/usePenalties";

export function PenaltyManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState(null);
  const { toast } = useToastWithSound();

  // Determine filter options based on active tab
  const penaltyOptions = {
    status: activeTab === "patrol" ? undefined : (activeTab === "all" ? "all" as const : activeTab),
    sourceOfInformation: activeTab === "patrol" ? "Patrol" : undefined,
  };

  const {
    penalties,
    isLoading,
    createPenalty,
    updatePenalty,
    deletePenalty,
  } = usePenalties(penaltyOptions);

  const handleAddPenalty = () => {
    setEditData(null);
    setShowForm(true);
  };

  const handleEdit = (data: any) => {
    setEditData(data);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditData(null);
  };

  const handleFormSubmit = async (data: any) => {
    try {
      if (editData && (editData as any).id) {
        await updatePenalty((editData as any).id, data);
        toast.success({ title: "Success", description: "Penalty record updated successfully." });
      } else {
        await createPenalty(data);
        toast.success({ title: "Success", description: "New penalty record created successfully." });
      }
      setShowForm(false);
      setEditData(null);
    } catch (error: any) {
      toast.error({ title: "Error", description: error.message || "Failed to save penalty record." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePenalty(id);
      toast.success({ title: "Success", description: "Penalty record deleted." });
    } catch (error: any) {
      toast.error({ title: "Error", description: error.message || "Failed to delete." });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold">Discipline & Compliance</h3>
          <p className="text-muted-foreground">Track violations, penalties, and HR actions</p>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleAddPenalty} className="flex gap-2 items-center bg-[#D71920] hover:bg-[#B01419]">
            <Plus className="h-4 w-4" />
            <span>Record Penalty</span>
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="all" className="px-3 h-8">
                  <AlertCircle className="h-4 w-4 mr-2" />All
                </TabsTrigger>
                <TabsTrigger value="Open" className="px-3 h-8">
                  <AlertCircle className="h-4 w-4 mr-2" />Open
                </TabsTrigger>
                <TabsTrigger value="Resolved" className="px-3 h-8">
                  <CheckCircle className="h-4 w-4 mr-2" />Resolved
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search penalties..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-9">
                <Calendar className="h-4 w-4 mr-2" /><span>Date Range</span>
              </Button>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="h-4 w-4 mr-2" /><span>Filter</span>
              </Button>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="h-4 w-4 mr-2" /><span>Export</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-[400px] bg-white rounded-lg">
              <BrandLoader size="lg" message="Loading penalties..." />
            </div>
          ) : (
            <PenaltyTable
              filter={activeTab}
              searchTerm={searchTerm}
              penalties={penalties}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      </Card>

      {showForm && (
        <PenaltyForm
          isOpen={showForm}
          onClose={handleFormClose}
          onSubmit={handleFormSubmit}
          editData={editData}
        />
      )}
    </div>
  );
}
