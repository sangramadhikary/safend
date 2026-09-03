'use client';

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw } from "lucide-react";

export function DataWarehouseStatus() {
  const [lastRefresh, setLastRefresh] = useState("2025-05-08T03:15:00Z");
  const [isLoading, setIsLoading] = useState(false);
  
  const refreshTime = new Date(lastRefresh);
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(refreshTime);
  
  const handleRefresh = () => {
    setIsLoading(true);
    // Simulating a refresh operation
    setTimeout(() => {
      setLastRefresh(new Date().toISOString());
      setIsLoading(false);
    }, 1500);
  };
  
  return (
    <div className="flex items-center gap-2">
      <HoverCard>
        <HoverCardTrigger asChild>
          <Badge variant="outline" className="flex items-center gap-1 px-3 py-1 cursor-help">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Data: {formattedTime}</span>
          </Badge>
        </HoverCardTrigger>
        <HoverCardContent className="w-80">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Data Warehouse Status</h4>
            <div className="text-sm">
              <p className="text-muted-foreground">Last ETL refresh: {new Date(lastRefresh).toLocaleString()}</p>
              <ul className="mt-2 space-y-1">
                <li className="flex justify-between">
                  <span>Control Centre</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700">Up to date</Badge>
                </li>
                <li className="flex justify-between">
                  <span>Sales</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700">Up to date</Badge>
                </li>
                <li className="flex justify-between">
                  <span>Operations</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700">Up to date</Badge>
                </li>
                <li className="flex justify-between">
                  <span>HR</span>
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700">15 min delay</Badge>
                </li>
                <li className="flex justify-between">
                  <span>Accounts</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700">Up to date</Badge>
                </li>
                <li className="flex justify-between">
                  <span>Office Admin</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700">Up to date</Badge>
                </li>
              </ul>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh data</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Refresh data warehouse status</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
