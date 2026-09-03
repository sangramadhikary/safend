'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, QrCode, Tag, Package, Car } from "lucide-react";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { getGatePasses, VisitorGatePass } from "@/services/visitors/VisitorService";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface GatePassListProps {
  searchQuery: string;
  branchId: string;
}

export function GatePassList({ searchQuery, branchId }: GatePassListProps) {
  const [gatePasses, setGatePasses] = useState<VisitorGatePass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadGatePasses = async () => {
      try {
        setIsLoading(true);
        const data = await getGatePasses(branchId);
        setGatePasses(data);
      } catch (error) {
        console.error("Failed to load gate passes:", error);
        toast({
          title: "Error",
          description: "Failed to load gate passes",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadGatePasses();
  }, [branchId, toast]);

  const handlePrintQR = (gatePassId: string) => {
    toast({
      title: "Printing QR Code",
      description: "Gate pass QR code has been sent to printer",
    });
  };
  
  const getPassTypeIcon = (type: string) => {
    switch (type) {
      case 'person':
        return <Tag className="h-4 w-4" />;
      case 'material':
        return <Package className="h-4 w-4" />;
      case 'vehicle':
        return <Car className="h-4 w-4" />;
      default:
        return <Tag className="h-4 w-4" />;
    }
  };
  
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'expired':
        return 'outline-solid';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline-solid';
    }
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (gatePasses.length === 0) {
    return (
      <div className="h-40 flex flex-col items-center justify-center text-center p-4">
        <div className="text-gray-400 mb-2">
          <QrCode className="h-8 w-8 mx-auto mb-2" />
          <p className="text-muted-foreground">No gate passes found</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Active gate passes for visitors and materials will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="text-left py-3 px-4 font-medium">Type</th>
            <th className="text-left py-3 px-4 font-medium">Details</th>
            <th className="text-left py-3 px-4 font-medium">Valid Period</th>
            <th className="text-left py-3 px-4 font-medium">Approved By</th>
            <th className="text-left py-3 px-4 font-medium">Status</th>
            <th className="text-left py-3 px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {gatePasses.map((pass) => (
            <tr key={pass.id} className="border-b border-gray-200 dark:border-gray-800">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {getPassTypeIcon(pass.type)}
                  <span className="capitalize">{pass.type}</span>
                </div>
              </td>
              <td className="py-3 px-4">
                {pass.type === 'material' && pass.itemDetails ? (
                  pass.itemDetails
                ) : pass.type === 'vehicle' && pass.vehicleNumber ? (
                  pass.vehicleNumber
                ) : (
                  "Visitor Pass"
                )}
              </td>
              <td className="py-3 px-4">
                <div className="flex flex-col">
                  <span>From: {new Date(pass.validFrom).toLocaleString()}</span>
                  <span>To: {new Date(pass.validTo).toLocaleString()}</span>
                </div>
              </td>
              <td className="py-3 px-4">{pass.approvedBy}</td>
              <td className="py-3 px-4">
                <Badge variant={getStatusVariant(pass.status)}>
                  {pass.status.charAt(0).toUpperCase() + pass.status.slice(1)}
                </Badge>
              </td>
              <td className="py-3 px-4">
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handlePrintQR(pass.id)}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <QrCode className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
