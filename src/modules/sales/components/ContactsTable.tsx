'use client';

import { useState, useEffect } from "react";
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
import { Eye, Edit, Trash2, Phone, Mail, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TablePagination } from "@/components/ui/table-pagination";

// Mock data for contacts
const mockContacts = [
  {
    id: 1,
    name: "John Smith",
    company: "Summit Security Limited",
    position: "Operations Director",
    phone: "020 7123 4567",
    email: "john@summitsecurity.com",
    type: "Customer",
    lastContact: "2025-05-01",
  },
  {
    id: 2,
    name: "Sarah Johnson",
    company: "Metro Building Management",
    position: "Facilities Manager",
    phone: "020 7234 5678",
    email: "sarah@metrobm.com",
    type: "Prospect",
    lastContact: "2025-04-28",
  },
  {
    id: 3,
    name: "Michael Davis",
    company: "Citywide Properties",
    position: "Security Manager",
    phone: "020 7345 6789",
    email: "mdavis@citywide.com",
    type: "Customer",
    lastContact: "2025-04-25",
  },
  {
    id: 4,
    name: "Emma Wilson",
    company: "Riverside Apartments",
    position: "Building Manager",
    phone: "020 7456 7890",
    email: "emma@riverside-apts.com",
    type: "Partner",
    lastContact: "2025-04-20",
  },
  {
    id: 5,
    name: "James Thompson",
    company: "Northern Rail Stations",
    position: "Security Officer",
    phone: "020 7567 8901",
    email: "james@northern-rail.co.uk",
    type: "Supplier",
    lastContact: "2025-04-18",
  }
];

const getTypeBadge = (type: string) => {
  switch (type) {
    case "Customer":
      return <Badge className="bg-green-500 hover:bg-green-600">{type}</Badge>;
    case "Prospect":
      return <Badge className="bg-blue-500 hover:bg-blue-600">{type}</Badge>;
    case "Partner":
      return <Badge className="bg-purple-500 hover:bg-purple-600">{type}</Badge>;
    case "Supplier":
      return <Badge className="bg-amber-500 hover:bg-amber-600">{type}</Badge>;
    default:
      return <Badge>{type}</Badge>;
  }
};

interface ContactsTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (contact: any) => void;
}

export function ContactsTable({ filter, searchTerm, onEdit }: ContactsTableProps) {
  const { toast } = useToast();
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  
  // Filter contacts based on selected filter and search term
  const filteredContacts = mockContacts.filter(contact => {
    // Filter by type
    if (filter !== "All Contacts" && !contact.type.includes(filter.replace("Contacts", "").trim())) {
      return false;
    }
    
    // Filter by search term
    if (searchTerm && !Object.values(contact).some(value => 
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )) {
      return false;
    }
    
    return true;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredContacts.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);
  
  const handleDelete = (id: number) => {
    toast({
      title: "Contact Deleted",
      description: `Contact #${id} has been deleted successfully.`,
      duration: 3000,
    });
  };
  
  const handleView = (id: number) => {
    toast({
      title: "Viewing Contact Details",
      description: `Viewing details for contact #${id}.`,
      duration: 3000,
    });
  };
  
  const handleContact = (method: string, name: string) => {
    toast({
      title: `Contact via ${method}`,
      description: `Contacting ${name} via ${method.toLowerCase()}.`,
      duration: 3000,
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>Complete contact list</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Company</TableHead>
            <TableHead className="hidden lg:table-cell">Position</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead className="hidden lg:table-cell">Last Contact</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedContacts.length > 0 ? (
            paginatedContacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">
                  {contact.name}
                  <div className="text-xs text-muted-foreground mt-1">
                    {contact.phone}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{contact.company}</TableCell>
                <TableCell className="hidden lg:table-cell">{contact.position}</TableCell>
                <TableCell className="hidden md:table-cell">{getTypeBadge(contact.type)}</TableCell>
                <TableCell className="hidden lg:table-cell">{contact.lastContact}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleContact("Phone", contact.name)}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleContact("Email", contact.name)}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleContact("Message", contact.name)}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleView(contact.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onEdit(contact)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500 hover:text-red-600" 
                      onClick={() => handleDelete(contact.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6">
                No contacts found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {filteredContacts.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredContacts.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
}
