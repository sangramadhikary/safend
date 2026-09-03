'use client';
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { subscribeToWorkflowPipeline } from "@/services/supabase/WorkflowFirebaseService";
import { FileSignature, ClipboardList, TrendingUp } from "lucide-react";

export function WorkflowPipelineCards() {
  const [pipeline, setPipeline] = useState({
    pendingAgreements: [] as any[],
    signedAgreements: [] as any[],
    activeWorkOrders: [] as any[]
  });

  useEffect(() => {
    const unsubscribe = subscribeToWorkflowPipeline((data) => {
      setPipeline(data);
    });
    
    return () => unsubscribe();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-yellow-500">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Pending Agreements</h4>
          <FileSignature className="h-5 w-5 text-yellow-500" />
        </div>
        <p className="text-3xl font-bold text-yellow-600 mt-2">
          {pipeline.pendingAgreements.length}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Awaiting signature</p>
        {pipeline.pendingAgreements.length > 0 && (
          <div className="mt-3 space-y-1">
            {pipeline.pendingAgreements.slice(0, 3).map((agreement) => (
              <div key={agreement.id} className="text-xs truncate">
                <Badge variant="outline" className="text-xs">
                  {agreement.clientName}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-blue-500">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Agreements Signed</h4>
          <FileSignature className="h-5 w-5 text-blue-500" />
        </div>
        <p className="text-3xl font-bold text-blue-600 mt-2">
          {pipeline.signedAgreements.length}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Ready for work orders</p>
        {pipeline.signedAgreements.length > 0 && (
          <div className="mt-3 space-y-1">
            {pipeline.signedAgreements.slice(0, 3).map((agreement) => (
              <div key={agreement.id} className="text-xs truncate">
                <Badge variant="outline" className="text-xs">
                  {agreement.clientName}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-green-500">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Active Contracts</h4>
          <ClipboardList className="h-5 w-5 text-green-500" />
        </div>
        <p className="text-3xl font-bold text-green-600 mt-2">
          {pipeline.activeWorkOrders.length}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Service delivery</p>
        {pipeline.activeWorkOrders.length > 0 && (
          <div className="mt-3 space-y-1">
            {pipeline.activeWorkOrders.slice(0, 3).map((workOrder) => (
              <div key={workOrder.id} className="text-xs truncate">
                <Badge variant="outline" className="text-xs">
                  {workOrder.clientName}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
