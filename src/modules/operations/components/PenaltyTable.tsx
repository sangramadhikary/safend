'use client';
import { useState } from "react";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Edit, Trash2 } from "lucide-react";
import { PenaltyRecord } from "../schemas/penaltySchema";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Pending HR Review": return <Badge className="bg-amber-500 hover:bg-amber-600">{status}</Badge>;
    case "Financial Penalty Applied": return <Badge className="bg-red-500 hover:bg-red-600">Financial Penalty</Badge>;
    case "Suspended": return <Badge className="bg-orange-500 hover:bg-orange-600">{status}</Badge>;
    case "Show Cause Issued": return <Badge className="bg-blue-500 hover:bg-blue-600">Show Cause</Badge>;
    case "Terminated": return <Badge className="bg-red-700 hover:bg-red-800">{status}</Badge>;
    case "Dismissed": return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

const getOffenseTypeBadge = (type: string) => {
  switch (type) {
    case "Disciplinary": return <Badge className="bg-orange-500 hover:bg-orange-600">{type}</Badge>;
    case "Integrity": return <Badge className="bg-purple-500 hover:bg-purple-600">{type}</Badge>;
    case "Criminal": return <Badge className="bg-red-500 hover:bg-red-600">{type}</Badge>;
    default: return <Badge>{type}</Badge>;
  }
};

interface PenaltyTableProps {
  penalties: PenaltyRecord[];
  filter: string;
  searchTerm?: string;
  onEdit: (penalty: PenaltyRecord) => void;
  onDelete: (id: string) => void;
}

export function PenaltyTable({
  penalties, filter, searchTerm = '',
  onEdit, onDelete
}: PenaltyTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filteredPenalties = penalties.filter(penalty => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      penalty.staff_name.toLowerCase().includes(s) ||
      penalty.post_name.toLowerCase().includes(s) ||
      penalty.offense.toLowerCase().includes(s) ||
      penalty.offense_type.toLowerCase().includes(s) ||
      penalty.description.toLowerCase().includes(s)
    );
  });

  const handleDeleteClick = (id: string) => {
    setPendingDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (pendingDeleteId) {
      onDelete(pendingDeleteId);
      setDeleteDialogOpen(false);
      setPendingDeleteId(null);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
        <Table>
          <TableCaption>Staff penalty records</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Name</TableHead>
              <TableHead className="hidden md:table-cell">Post</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Offense</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPenalties.length > 0 ? (
              filteredPenalties.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.staff_name}</TableCell>
                  <TableCell className="hidden md:table-cell">{record.post_name}</TableCell>
                  <TableCell>{new Date(record.violation_date).toLocaleDateString()}</TableCell>
                  <TableCell><span className="text-xs">{record.source_of_information}</span></TableCell>
                  <TableCell>{getOffenseTypeBadge(record.offense_type)}</TableCell>
                  <TableCell><span className="text-sm">{record.offense}</span></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      record.weight >= 4 ? 'bg-red-100 text-red-700 ring-1 ring-red-300' :
                      record.weight >= 3 ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300' :
                      'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                    }`}>
                      {record.weight}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(record.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onEdit(record)} title="Edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteClick(record.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6">
                  No penalty records found matching your criteria
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Penalty Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this penalty record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setPendingDeleteId(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
