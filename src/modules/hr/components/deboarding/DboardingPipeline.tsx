'use client';

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Clock, ArrowRight, IndianRupee,
  MessageSquare, FileSignature, CheckCircle2
} from "lucide-react";

const DEBOARD_STAGES = [
  { key: 'resignation_received', label: 'Resignation Received', icon: FileText },
  { key: 'notice_period', label: 'Notice Period', icon: Clock },
  { key: 'handover', label: 'Handover', icon: ArrowRight },
  { key: 'dues_settlement', label: 'Dues Settlement', icon: IndianRupee },
  { key: 'exit_interview', label: 'Exit Interview', icon: MessageSquare },
  { key: 'relieving_letter', label: 'Relieving Letter', icon: FileSignature },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

export function DboardingPipeline() {
  return (
    <div className="space-y-6">
      {/* Stage overview */}
      <div className="flex flex-wrap gap-2">
        {DEBOARD_STAGES.map((stage) => (
          <Badge
            key={stage.key}
            variant="outline"
            className="flex items-center gap-1.5 px-3 py-1.5"
          >
            <stage.icon className="h-3.5 w-3.5" />
            {stage.label}
          </Badge>
        ))}
      </div>

      {/* Empty state */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No Deboarding Entries</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Employee resignations will appear here as they are submitted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
