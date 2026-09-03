'use client';

import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  MoreHorizontal, MapPin, CreditCard, FileCheck, 
  Calendar, ArrowRightLeft, DollarSign, FileText, 
  Eye, CheckCircle 
} from 'lucide-react';
import { CashAdvance } from '@/services/security/SecurityCashAdvanceService';
import { CashAdvanceSettlementForm } from "../forms/CashAdvanceSettlementForm";

interface CashAdvancesListProps {
  advances: CashAdvance[] | undefined;
  isLoading: boolean;
  title?: string;
  onSettlementComplete?: () => void;
}

export function CashAdvancesList({ 
  advances, 
  isLoading,
  title = "Cash Advances",
  onSettlementComplete 
}: CashAdvancesListProps) {
  const [selectedAdvance, setSelectedAdvance] = useState<CashAdvance | null>(null);
  const [showSettlementForm, setShowSettlementForm] = useState(false);

  const handleSettlementClick = (advance: CashAdvance) => {
    setSelectedAdvance(advance);
    setShowSettlementForm(true);
  };

  const handleSettlementComplete = () => {
    if (onSettlementComplete) {
      onSettlementComplete();
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'PATROL':
        return <MapPin className="h-4 w-4 mr-2 text-blue-500" />;
      case 'FUEL':
        return <CreditCard className="h-4 w-4 mr-2 text-green-500" />;
      case 'EQUIPMENT':
        return <FileCheck className="h-4 w-4 mr-2 text-amber-500" />;
      case 'TRAINING':
        return <Calendar className="h-4 w-4 mr-2 text-purple-500" />;
      default:
        return <ArrowRightLeft className="h-4 w-4 mr-2 text-gray-500" />;
    }
  };

  return (
    <Card>
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purpose</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Request Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                Loading cash advances...
              </TableCell>
            </TableRow>
          ) : !advances || advances.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                No cash advances found.
              </TableCell>
            </TableRow>
          ) : (
            advances.map((advance) => (
              <TableRow key={advance.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center">
                    {getCategoryIcon(advance.category)}
                    <span>{advance.purpose}</span>
                  </div>
                </TableCell>
                <TableCell>{advance.employeeName}</TableCell>
                <TableCell>
                  {advance.branchName || (
                    <span className="text-gray-500">N/A</span>
                  )}
                </TableCell>
                <TableCell>₹{advance.amount.toLocaleString()}</TableCell>
                <TableCell>{format(new Date(advance.requestDate), "dd/MM/yyyy")}</TableCell>
                <TableCell>
                  <AdvanceStatusBadge status={advance.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end items-center space-x-2">
                    <Button variant="ghost" size="icon" title="View Details">
                      <Eye className="h-4 w-4" />
                    </Button>
                    
                    {(advance.status === 'disbursed' || advance.status === 'partially_settled') && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleSettlementClick(advance)}
                        className="flex items-center"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Settle
                      </Button>
                    )}
                    
                    {advance.status === 'settled' && advance.receiptsAttached && (
                      <Button variant="ghost" size="icon" title="View Receipts">
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      
      {/* Settlement Form Dialog */}
      <CashAdvanceSettlementForm 
        isOpen={showSettlementForm}
        onClose={() => setShowSettlementForm(false)}
        advance={selectedAdvance}
        onSettlementComplete={handleSettlementComplete}
      />
    </Card>
  );
}

// Advance status badge component
export const AdvanceStatusBadge = ({ status }: { status: CashAdvance['status'] }) => {
  switch (status) {
    case 'requested':
      return <Badge variant="outline">Requested</Badge>;
    case 'approved':
      return <Badge variant="secondary">Approved</Badge>;
    case 'disbursed':
      return <Badge variant="default" className="bg-blue-500">Disbursed</Badge>;
    case 'settled':
      return <Badge variant="default" className="bg-green-500">Settled</Badge>;
    case 'partially_settled':
      return <Badge variant="secondary" className="bg-purple-500 text-white">Partially Settled</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};
