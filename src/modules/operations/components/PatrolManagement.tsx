'use client';

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clipboard, AlertTriangle } from "lucide-react";
import { PenaltyManagement } from "./PenaltyManagement";
import { UnifiedIncidents } from "./fieldops/UnifiedIncidents";

export function PatrolManagement() {
  const [activeTab, setActiveTab] = useState("discipline");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold">Field Operations</h3>
        <p className="text-muted-foreground">
          Track discipline, compliance, and field incidents
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-11 p-1 bg-muted">
          <TabsTrigger value="discipline" className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium">
            <Clipboard className="h-4 w-4" />
            Discipline
          </TabsTrigger>
          <TabsTrigger value="incidents" className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Incidents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discipline" className="mt-6">
          <PenaltyManagement />
        </TabsContent>

        <TabsContent value="incidents" className="mt-6">
          <UnifiedIncidents />
        </TabsContent>
      </Tabs>
    </div>
  );
}
