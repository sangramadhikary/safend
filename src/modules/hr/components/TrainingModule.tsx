'use client';

import { useState } from "react";
import { TrainingModuleProps } from "./index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  CheckCircle,
  Clock,
  Search,
  Filter,
  Plus,
  BookOpen,
  Users,
  FileText,
  ChevronRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

// Training programs (empty until real data integration)
const trainingPrograms: { id: string; name: string; status: string; startDate: string; endDate: string; enrolled: number; completed: number; instructor: string; type: string }[] = [];

// Employee training data (empty until real data integration)
const employeeTrainings: { id: string; employeeId: string; employeeName: string; trainingId: string; trainingName: string; status: string; progress: number; dueDate?: string; completedDate?: string }[] = [];

export function TrainingModule({ filter }: TrainingModuleProps) {
  const [activeTab, setActiveTab] = useState("programs");
  const [searchTerm, setSearchTerm] = useState("");
  
  const { toast } = useToast();
  
  // Filter training programs based on filter prop
  const filteredPrograms = filter === "All Training" 
    ? trainingPrograms 
    : trainingPrograms.filter(program => program.status === filter.toLowerCase());
  
  // Filter based on search term
  const searchFilteredPrograms = searchTerm
    ? filteredPrograms.filter(program => 
        program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.instructor.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredPrograms;
  
  const handleAddTraining = () => {
    toast({
      title: "New Training Program",
      description: "The form to add a new training program would open here",
    });
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ongoing":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Ongoing</Badge>;
      case "upcoming":
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-200">Upcoming</Badge>;
      case "completed":
        return <Badge className="bg-green-500 hover:bg-green-600">Completed</Badge>;
      case "in-progress":
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200">In Progress</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Training Management</h2>
          <p className="text-muted-foreground">
            Manage training programs and employee certifications
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search training..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[200px] md:w-[300px]"
            />
          </div>
          
          <Button variant="outline" size="icon" className="h-10 w-10">
            <Filter className="h-4 w-4" />
          </Button>
          
          <Button className="flex gap-2" onClick={handleAddTraining}>
            <Plus className="h-4 w-4" />
            New Training
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Programs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trainingPrograms.length}</div>
            <p className="text-sm text-muted-foreground">All training programs</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Ongoing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trainingPrograms.filter(p => p.status === "ongoing").length}
            </div>
            <p className="text-sm text-muted-foreground">Current trainings</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trainingPrograms.filter(p => p.status === "upcoming").length}
            </div>
            <p className="text-sm text-muted-foreground">Scheduled trainings</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trainingPrograms.filter(p => p.status === "completed").length}
            </div>
            <p className="text-sm text-muted-foreground">Finished trainings</p>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="programs">Training Programs</TabsTrigger>
          <TabsTrigger value="employees">Employee Progress</TabsTrigger>
        </TabsList>
        
        <TabsContent value="programs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Training Programs</CardTitle>
              <CardDescription>
                Manage all training programs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchFilteredPrograms.length > 0 ? (
                    searchFilteredPrograms.map((program) => (
                      <TableRow key={program.id}>
                        <TableCell className="font-medium">{program.name}</TableCell>
                        <TableCell>
                          <Badge variant={program.type === "Mandatory" ? "destructive" : "outline"}>
                            {program.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(program.startDate).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(program.endDate).toLocaleDateString()}</TableCell>
                        <TableCell>{program.instructor}</TableCell>
                        <TableCell>{program.enrolled}</TableCell>
                        <TableCell>{getStatusBadge(program.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24">
                              <Progress 
                                value={program.completed / program.enrolled * 100} 
                                className="h-2" 
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {program.completed}/{program.enrolled}
                            </span>
                            <Button variant="ghost" size="sm" className="h-8 w-8">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        No training programs found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="employees" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Employee Training Progress</CardTitle>
              <CardDescription>
                Track individual employee training completion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Training</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeTrainings.map((training) => (
                    <TableRow key={training.id}>
                      <TableCell className="font-medium">{training.employeeName}</TableCell>
                      <TableCell>{training.trainingName}</TableCell>
                      <TableCell>{getStatusBadge(training.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={training.progress} 
                            className="h-2 w-24" 
                          />
                          <span className="text-xs text-muted-foreground">
                            {training.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {training.status === "completed" 
                          ? `Completed: ${new Date(training.completedDate!).toLocaleDateString()}`
                          : `Due: ${new Date(training.dueDate).toLocaleDateString()}`
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="mr-1 h-4 w-4" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Upcoming Training Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trainingPrograms
                .filter(program => program.status === "upcoming")
                .map(program => (
                  <div key={program.id} className="flex justify-between items-center border-b pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{program.name}</p>
                      <p className="text-xs text-muted-foreground">Instructor: {program.instructor}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{new Date(program.startDate).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground">{program.enrolled} enrollments</p>
                    </div>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Recent Completions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <p className="font-medium">Sarah Johnson</p>
                  <p className="text-xs text-muted-foreground">Security Protocol Training</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Completed: April 28, 2025</p>
                  <Badge className="mt-1 bg-green-500 hover:bg-green-600">100%</Badge>
                </div>
              </div>
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <p className="font-medium">David Wilson</p>
                  <p className="text-xs text-muted-foreground">First Aid & Emergency Response</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Completed: April 22, 2025</p>
                  <Badge className="mt-1 bg-green-500 hover:bg-green-600">100%</Badge>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">Jennifer Lee</p>
                  <p className="text-xs text-muted-foreground">Security Protocol Training</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Completed: April 20, 2025</p>
                  <Badge className="mt-1 bg-green-500 hover:bg-green-600">100%</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
