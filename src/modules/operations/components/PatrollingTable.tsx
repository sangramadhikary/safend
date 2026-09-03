'use client';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mock data removed - patrol logs will be loaded from the database
const mockPatrollingData: any[] = [];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Completed":
      return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    case "In Progress":
      return <Badge className="bg-blue-500 hover:bg-blue-600">{status}</Badge>;
    case "Issues Reported":
      return <Badge className="bg-red-500 hover:bg-red-600">{status}</Badge>;
    case "Missed Checkpoints":
      return <Badge className="bg-amber-500 hover:bg-amber-600">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

interface PatrollingTableProps {
  filter: string;
  searchTerm?: string; // Make searchTerm optional
  onEdit: (patrol: any) => void;
}

export function PatrollingTable({ filter, searchTerm = '', onEdit }: PatrollingTableProps) {
  const { toast } = useToast();
  
  // Filter patrols based on selected filter and search term
  const filteredPatrols = mockPatrollingData.filter(patrol => {
    // Filter by status
    if (filter === "Active" && patrol.status !== "In Progress") {
      return false;
    } else if (filter === "Completed" && patrol.status !== "Completed") {
      return false;
    } else if (filter === "Missed" && patrol.status !== "Missed Checkpoints") {
      return false;
    } else if (filter === "Issues Reported" && patrol.status !== "Issues Reported") {
      return false;
    } else if (filter !== "All Patrols" && filter !== "Active" && 
               filter !== "Completed" && filter !== "Missed" && 
               filter !== "Issues Reported") {
      return false;
    }
    
    // Filter by search term
    if (searchTerm && !Object.values(patrol).some(value => 
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )) {
      return false;
    }
    
    return true;
  });
  
  const handleDelete = (id: string) => {
    toast({
      title: "Patrol Log Deleted",
      description: `Patrol log ${id} has been deleted successfully.`,
      duration: 3000,
    });
  };
  
  const handleView = (id: string) => {
    toast({
      title: "Viewing Patrol Details",
      description: `Viewing details for patrol log ${id}.`,
      duration: 3000,
    });
  };
  
  const handleReportIssue = (id: string) => {
    toast({
      title: "Report Issue",
      description: `Reporting issue for patrol ${id}.`,
      duration: 3000,
    });
  };
  
  const handleComplete = (id: string) => {
    toast({
      title: "Patrol Completed",
      description: `Patrol ${id} has been marked as completed.`,
      duration: 3000,
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>Security patrol logs</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Patrol ID</TableHead>
            <TableHead>Staff Name</TableHead>
            <TableHead>Post</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Checkpoints</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPatrols.length > 0 ? (
            filteredPatrols.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.id}</TableCell>
                <TableCell>{record.staffName}</TableCell>
                <TableCell>{record.post}</TableCell>
                <TableCell>{record.date}</TableCell>
                <TableCell>
                  {record.startTime} - {record.endTime}
                </TableCell>
                <TableCell>{record.checkpoints}</TableCell>
                <TableCell>{getStatusBadge(record.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleView(record.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {record.status === "In Progress" && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-amber-500 hover:text-amber-600"
                          onClick={() => handleReportIssue(record.id)}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-green-500 hover:text-green-600"
                          onClick={() => handleComplete(record.id)}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onEdit(record)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500 hover:text-red-600" 
                      onClick={() => handleDelete(record.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-6">
                No patrol logs found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
