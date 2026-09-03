'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { postsApi } from "@/services/operations/api";
import { Post } from "@/types/operations";
import { 
  ChevronLeft, 
  Building, 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Edit, 
  Trash2,
  FileText,
  ClipboardList,
  Table,
  CheckCircle
} from "lucide-react";
import { format } from "date-fns";

interface PostDetailViewProps {
  postId: string;
  onBack: () => void;
  onEdit: (post: Post) => void;
}

export function PostDetailView({ postId, onBack, onEdit }: PostDetailViewProps) {
  const [activeTab, setActiveTab] = useState("overview");
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => postsApi.getPostById(postId)
  });
  
  const post = data?.data;
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, yyyy");
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    switch (status) {
      case "active":
        return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
      case "inactive":
        return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
      case "completed":
        return <Badge className="bg-blue-500 hover:bg-blue-600">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <LoadingAnimation size="lg" color="red" showPercentage={true} />
      </div>
    );
  }
  
  if (error || !post) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ChevronLeft className="mr-2 h-4 w-4" /> Back to Posts
        </Button>
        
        <Card className="p-6 text-center">
          <p className="text-red-500">Error loading post details. Post may not exist or you may not have permission to view it.</p>
          <Button onClick={onBack} className="mt-4">
            Return to Posts List
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <Button variant="ghost" onClick={onBack} className="mr-2">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h3 className="text-xl font-bold">{post.name}</h3>
          {getStatusBadge(post.status)}
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onEdit(post)}>
            <Edit className="mr-2 h-4 w-4" /> Edit Post
          </Button>
        </div>
      </div>
      
      <Card>
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
          <div className="border-b px-6 py-4">
            <TabsList>
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Building className="h-4 w-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="staff" className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Staff
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Schedule
              </TabsTrigger>
              <TabsTrigger value="attendance" className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Attendance
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Reports
              </TabsTrigger>
            </TabsList>
          </div>
          
          <div className="p-6">
            <TabsContent value="overview" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <h4 className="text-lg font-medium mb-4 flex items-center">
                      <Building className="h-5 w-5 mr-2" />
                      Post Details
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Post Code</p>
                        <p className="font-medium">{post.code}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Type</p>
                        <p className="font-medium capitalize">{post.type}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Client</p>
                        <p className="font-medium">{post.clientName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Duty Type</p>
                        <p className="font-medium">{post.dutyType} Shifts</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Start Date</p>
                        <p className="font-medium">{formatDate(post.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">End Date</p>
                        <p className="font-medium">{post.endDate ? formatDate(post.endDate) : "Ongoing"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Work Order Reference</p>
                        <p className="font-medium">{post.workOrderId || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <p>{getStatusBadge(post.status)}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium mb-4 flex items-center">
                      <Users className="h-5 w-5 mr-2" />
                      Staff Requirements
                    </h4>
                    <div className="space-y-4">
                      {post.requiredStaff && post.requiredStaff.length > 0 ? (
                        post.requiredStaff.map((req, index) => (
                          <Card key={index} className="p-4">
                            <div className="flex justify-between">
                              <div>
                                <p className="font-medium">{req.role}</p>
                                <p className="text-sm text-muted-foreground">{req.shift} Shift</p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium">{req.count} Staff</p>
                                <p className="text-sm text-muted-foreground">
                                  {req.startTime} - {req.endTime}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 flex gap-1">
                              {(req.days || []).map((day) => (
                                <Badge key={day} variant="outline" className="capitalize">
                                  {day}
                                </Badge>
                              ))}
                            </div>
                          </Card>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No staff requirements specified.</p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Security Services (Read Only, inherited from Quotation) */}
                <div>
                  <h4 className="text-lg font-medium mb-4 flex items-center">
                    <ClipboardList className="h-5 w-5 mr-2" />
                    Security Services for this Post
                  </h4>
                  {(() => {
                    const svcInstances = (post as any)?.serviceInstances || {};
                    const securityServices = (post as any)?.securityServices || {};
                    const hasNew =
                      svcInstances &&
                      Object.keys(svcInstances).length > 0 &&
                      ['unarmedGuards','armedGuards','supervisors','patrolOfficers'].some(
                        k => Array.isArray(svcInstances[k])
                      );
                    
                    if (hasNew) {
                      const renderType = (key: string, title: string) => {
                        const list = svcInstances[key] || [];
                        const anyEnabled = Array.isArray(list) && list.some(
                          (inst: any) => inst?.shifts?.day?.enabled || inst?.shifts?.afternoon?.enabled || inst?.shifts?.night?.enabled
                        );
                        if (!anyEnabled) return null;
                        return (
                          <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900 mb-3">
                            <h6 className="font-semibold mb-3">{title}</h6>
                            {list.map((inst: any, idx: number) => {
                              const day = inst?.shifts?.day;
                              const aft = inst?.shiftType === '8H' ? inst?.shifts?.afternoon : null;
                              const night = inst?.shifts?.night;
                              if (!day?.enabled && !aft?.enabled && !night?.enabled) return null;
                              return (
                                <div key={inst?.id || idx} className="mb-2 p-3 bg-white dark:bg-gray-800 rounded border">
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs text-muted-foreground">Instance {idx + 1}</span>
                                    <Badge variant="outline" className="text-xs">{inst?.shiftType === '8H' ? '8-Hour' : '12-Hour'}</Badge>
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    {day?.enabled && (
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="w-16">Day</span>
                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{day.quantity}</span>
                                      </div>
                                    )}
                                    {aft?.enabled && (
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="w-16">Afternoon</span>
                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{aft.quantity}</span>
                                      </div>
                                    )}
                                    {night?.enabled && (
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="w-16">Night</span>
                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{night.quantity}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      };
                      
                      return (
                        <div className="space-y-3">
                          {renderType('unarmedGuards','Unarmed Guards')}
                          {renderType('armedGuards','Armed Guards')}
                          {renderType('supervisors','Supervisors')}
                          {renderType('patrolOfficers','Patrol Officers')}
                        </div>
                      );
                    }
                    
                    // Old format
                    const svc = securityServices || {};
                    const renderOld = (key: string, title: string) => {
                      const entry = svc[key];
                      if (!entry) return null;
                      const is8H = (entry.shiftType || '8H') === '8H';
                      const day = entry?.shifts?.day;
                      const aft = is8H ? entry?.shifts?.afternoon : null;
                      const night = entry?.shifts?.night;
                      return (
                        <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900 mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <h6 className="font-semibold">{title}</h6>
                            <Badge variant="outline" className="text-xs">{is8H ? '8-Hour' : '12-Hour'}</Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            {day?.enabled && (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="w-16">Day</span>
                                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{day.quantity}</span>
                              </div>
                            )}
                            {aft?.enabled && (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="w-16">Afternoon</span>
                                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{aft.quantity}</span>
                              </div>
                            )}
                            {night?.enabled && (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="w-16">Night</span>
                                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{night.quantity}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    };
                    
                    return (
                      <div className="space-y-3">
                        {renderOld('unarmedGuards','Unarmed Guards')}
                        {renderOld('armedGuards','Armed Guards')}
                        {renderOld('supervisors','Supervisors')}
                        {renderOld('patrolOfficers','Patrol Officers')}
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium mb-4 flex items-center">
                      <MapPin className="h-5 w-5 mr-2" />
                      Location
                    </h4>
                    <div className="border rounded-md p-4">
                      <p className="mb-2 whitespace-pre-wrap">{post.address}</p>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Latitude</p>
                          <p className="font-mono text-sm">{post.location?.latitude}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Longitude</p>
                          <p className="font-mono text-sm">{post.location?.longitude}</p>
                        </div>
                      </div>
                      <div className="h-[200px] bg-gray-100 rounded-md flex items-center justify-center">
                        <span className="text-gray-500">Map view will be here</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium mb-4 flex items-center">
                      <ClipboardList className="h-5 w-5 mr-2" />
                      Quick Actions
                    </h4>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start">
                        <Calendar className="mr-2 h-4 w-4" />
                        View Rota
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <Clock className="mr-2 h-4 w-4" />
                        Mark Attendance
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <Table className="mr-2 h-4 w-4" />
                        View Reports
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="staff" className="mt-0 min-h-[400px]">
              <div className="flex flex-col items-center justify-center h-full">
                <Users className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium mb-2">Staff Management</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  This section will show staff assigned to this post, their schedules, and allow you to manage staff assignments.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="schedule" className="mt-0 min-h-[400px]">
              <div className="flex flex-col items-center justify-center h-full">
                <Calendar className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium mb-2">Schedule Management</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Here you'll be able to view and manage staff schedules, create and modify rota plans, and handle shift assignments.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="attendance" className="mt-0 min-h-[400px]">
              <div className="flex flex-col items-center justify-center h-full">
                <Clock className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium mb-2">Attendance Tracking</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  This section will display attendance records, allow marking attendance, and show historical attendance patterns.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="reports" className="mt-0 min-h-[400px]">
              <div className="flex flex-col items-center justify-center h-full">
                <FileText className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium mb-2">Post Reports</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Generate and view reports related to this post, including attendance summaries, incident reports, and performance metrics.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>
    </div>
  );
}
