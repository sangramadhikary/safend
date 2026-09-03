'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LogOut, 
  Printer, 
  QrCode,
  FileText,
} from "lucide-react";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { getVisitors, Visitor, checkOutVisitor } from "@/services/visitors/VisitorService";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface VisitorsListProps {
  searchQuery: string;
  branchId: string;
}

export function VisitorsList({ searchQuery, branchId }: VisitorsListProps) {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadVisitors = async () => {
      try {
        setIsLoading(true);
        const data = await getVisitors(branchId, searchQuery);
        setVisitors(data);
      } catch (error) {
        console.error("Failed to load visitors:", error);
        toast({
          title: "Error",
          description: "Failed to load visitors",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadVisitors();
  }, [branchId, searchQuery, toast]);

  const handleCheckOut = async (visitorId: string) => {
    try {
      setCheckingOutId(visitorId);
      await checkOutVisitor(visitorId);
      
      // Update the visitors list
      setVisitors(prevVisitors => 
        prevVisitors.map(visitor => 
          visitor.id === visitorId 
            ? { ...visitor, status: 'checked_out', checkOutTime: new Date().toISOString() } 
            : visitor
        )
      );
      
      toast({
        title: "Success",
        description: "Visitor has been checked out",
      });
    } catch (error) {
      console.error("Failed to check out visitor:", error);
      toast({
        title: "Error",
        description: "Failed to check out visitor",
        variant: "destructive",
      });
    } finally {
      setCheckingOutId(null);
    }
  };
  
  const handlePrintBadge = (visitorId: string) => {
    toast({
      title: "Printing Badge",
      description: "Visitor badge has been sent to printer",
    });
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (visitors.length === 0) {
    return (
      <div className="h-40 flex flex-col items-center justify-center text-center p-4">
        <div className="text-gray-400 mb-2">
          <QrCode className="h-8 w-8 mx-auto mb-2" />
          <p className="text-muted-foreground">No visitors found</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {searchQuery 
            ? "Try adjusting your search query" 
            : "When visitors check in, they will appear here"}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="text-left py-3 px-4 font-medium">Name</th>
            <th className="text-left py-3 px-4 font-medium">Company</th>
            <th className="text-left py-3 px-4 font-medium">Host</th>
            <th className="text-left py-3 px-4 font-medium">Purpose</th>
            <th className="text-left py-3 px-4 font-medium">Check-In Time</th>
            <th className="text-left py-3 px-4 font-medium">Status</th>
            <th className="text-left py-3 px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visitors.map((visitor) => (
            <tr key={visitor.id} className="border-b border-gray-200 dark:border-gray-800">
              <td className="py-3 px-4">
                <div className="flex flex-col">
                  <span className="font-medium">{visitor.name}</span>
                  <span className="text-sm text-muted-foreground">{visitor.phone}</span>
                </div>
              </td>
              <td className="py-3 px-4">{visitor.company || "-"}</td>
              <td className="py-3 px-4">{visitor.hostName}</td>
              <td className="py-3 px-4">{visitor.purpose}</td>
              <td className="py-3 px-4">
                {formatDistanceToNow(new Date(visitor.checkInTime), { addSuffix: true })}
              </td>
              <td className="py-3 px-4">
                <Badge variant={visitor.status === "checked_in" ? "default" : "outline-solid"}>
                  {visitor.status === "checked_in" ? "Checked In" : "Checked Out"}
                </Badge>
              </td>
              <td className="py-3 px-4">
                <div className="flex space-x-2">
                  {visitor.status === "checked_in" && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleCheckOut(visitor.id)}
                      disabled={checkingOutId === visitor.id}
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Check Out
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handlePrintBadge(visitor.id)}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  {visitor.agreementSigned && (
                    <Button variant="outline" size="icon">
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
