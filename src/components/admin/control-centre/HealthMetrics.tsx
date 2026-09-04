'use client';

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Server, Database, Cpu, Wifi } from "lucide-react";

// Health status component
const StatusIndicator = ({ status }: { status: 'healthy' | 'warning' | 'critical' | 'unknown' }) => {
  const colors = {
    healthy: "bg-green-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-gray-400"
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colors[status]}`}></div>
      <span className="capitalize">{status}</span>
    </div>
  );
};

export function HealthMetrics() {
  const [refreshing, setRefreshing] = useState(false);
  const [systemHealth, setSystemHealth] = useState({
    cpuUsage: 35,
    memoryUsage: 42,
    diskUsage: 67,
    networkLatency: 120,
    servicesOnline: 18,
    servicesTotal: 20,
    lastUpdated: new Date().toISOString()
  });
  
  // Simulate health data updates
  useEffect(() => {
    const fetchHealthData = () => {
      setSystemHealth(prevState => ({
        ...prevState,
        cpuUsage: Math.round(Math.random() * 50) + 10,
        networkLatency: Math.floor(Math.random() * 50) + 100,
        lastUpdated: new Date().toISOString()
      }));
    };
    
    fetchHealthData();
    const intervalId = setInterval(fetchHealthData, 30000);
    return () => clearInterval(intervalId);
  }, []);
  
  // Handle refresh button click
  const handleRefresh = async () => {
    setRefreshing(true);
    setSystemHealth(prevState => ({
      ...prevState,
      cpuUsage: Math.round(Math.random() * 50) + 10,
      networkLatency: Math.floor(Math.random() * 50) + 100,
      lastUpdated: new Date().toISOString()
    }));
    setTimeout(() => setRefreshing(false), 500);
  };
  
  // Determine overall system status
  const getOverallStatus = (): 'healthy' | 'warning' | 'critical' => {
    if (systemHealth.cpuUsage > 80 || systemHealth.memoryUsage > 90 || systemHealth.diskUsage > 90) {
      return 'critical';
    } else if (systemHealth.cpuUsage > 70 || systemHealth.memoryUsage > 70 || systemHealth.diskUsage > 80) {
      return 'warning';
    }
    return 'healthy';
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">System Health</h2>
          <p className="text-sm text-muted-foreground">
            Last updated: {formatDate(systemHealth.lastUpdated)}
          </p>
        </div>
        <button 
          onClick={handleRefresh} 
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-red-600" /> 
              System Overview
            </div>
            <Badge variant={getOverallStatus() === 'healthy' ? 'default' : getOverallStatus() === 'warning' ? 'outline' : 'destructive'}>
              {getOverallStatus()}
            </Badge>
          </CardTitle>
          <CardDescription>
            Services online: {systemHealth.servicesOnline}/{systemHealth.servicesTotal}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>CPU Usage</span>
              <span>{systemHealth.cpuUsage}%</span>
            </div>
            <Progress 
              value={systemHealth.cpuUsage} 
              className={`h-2 ${
                systemHealth.cpuUsage > 80 ? 'bg-red-200' : 
                systemHealth.cpuUsage > 60 ? 'bg-amber-200' : 'bg-green-200'
              }`}
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>Memory Usage</span>
              <span>{systemHealth.memoryUsage}%</span>
            </div>
            <Progress 
              value={systemHealth.memoryUsage} 
              className={`h-2 ${
                systemHealth.memoryUsage > 80 ? 'bg-red-200' : 
                systemHealth.memoryUsage > 60 ? 'bg-amber-200' : 'bg-green-200'
              }`}
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>Disk Usage</span>
              <span>{systemHealth.diskUsage}%</span>
            </div>
            <Progress 
              value={systemHealth.diskUsage} 
              className={`h-2 ${
                systemHealth.diskUsage > 80 ? 'bg-red-200' : 
                systemHealth.diskUsage > 60 ? 'bg-amber-200' : 'bg-green-200'
              }`}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Database</span>
                </div>
                <StatusIndicator status="healthy" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">API Services</span>
                </div>
                <StatusIndicator status="healthy" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Network</span>
                </div>
                <div className="text-sm">{systemHealth.networkLatency} ms</div>
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Authentication</span>
                </div>
                <StatusIndicator status="healthy" />
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
