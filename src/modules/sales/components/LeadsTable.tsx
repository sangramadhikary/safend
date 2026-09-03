'use client';
import { useState, useEffect, useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MoreVertical, Edit, Eye, Trash2, Phone, Mail, MapPin, Building2, FileText, Check, MessageSquare } from "lucide-react";
import { updateFollowup } from "@/services/supabase/FollowupFirebaseService";
import { deleteLead } from "@/services/supabase/LeadFirebaseService";
import { useToast } from "@/hooks/use-toast";
import { CallClientModal } from "./CallClientModal";
import { EmailClientModal } from "./EmailClientModal";
import { TablePagination } from "@/components/ui/table-pagination";
import { DeleteRequestModal } from "@/components/sales/DeleteRequestModal";
import { AdminDeleteConfirmModal } from "@/components/sales/AdminDeleteConfirmModal";
import { LeadDetailModal } from "./LeadDetailModal";
import { LeadConversationDrawer } from "./LeadConversationDrawer";
import { useLeadsData } from "@/contexts/LeadsDataContext";
import { useFollowupsData } from "@/contexts/FollowupsDataContext";
import { useQuotationsData } from "@/contexts/QuotationsDataContext";

const FOLLOWUP_FILTERS = ["Today's Follow-ups", "This Week's Follow-ups", "Overdue Follow-ups"];

interface Lead {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  source: string;
  status: string;
  assignedTo: string;
  budget: string;
  priority?: string;
  urgency?: string;
  createdAt: Date;
}
interface LeadsTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (lead: Lead) => void;
  onClientSelect?: (client: Lead) => void;
  onCreateQuotation?: (lead: Lead) => void;
}

export function LeadsTable({
  filter,
  searchTerm,
  onEdit,
  onCreateQuotation
}: LeadsTableProps) {
  const { leads: contextLeads, isLoading } = useLeadsData();
  const { followups } = useFollowupsData();
  const { quotations } = useQuotationsData();
  const { toast } = useToast();

  // Track which leads already have a quotation (by leadId or client name match)
  const leadsWithQuotation = useMemo(() => {
    const set = new Set<string>();
    // Match by leadId
    quotations.forEach((q: any) => {
      if (q.leadId) set.add(q.leadId);
    });
    // Fallback: match by client name for old quotations without leadId
    if (contextLeads.length > 0) {
      const quotationClientNames = new Set(
        quotations.filter((q: any) => !q.leadId && q.client).map((q: any) => q.client.toLowerCase().trim())
      );
      contextLeads.forEach((lead: any) => {
        if (lead.name && quotationClientNames.has(lead.name.toLowerCase().trim())) {
          set.add(lead.id);
        }
      });
    }
    return set;
  }, [quotations, contextLeads]);

  const isFollowupFilter = FOLLOWUP_FILTERS.includes(filter);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modal states
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [conversationDrawerOpen, setConversationDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const leads = useMemo(() => {
    return contextLeads.map((lead: any) => ({
      ...lead,
      createdAt: lead.createdAt instanceof Date ? lead.createdAt : new Date(lead.createdAt || Date.now())
    }));
  }, [contextLeads]);

  // Follow-up rows mapped to Lead shape for unified display
  const filteredFollowupRows = useMemo(() => {
    if (!isFollowupFilter) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return followups.filter(f => {
      if (!f.dateTime) return false;
      const d = new Date(f.dateTime);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (filter === "Today's Follow-ups") return day.getTime() === today.getTime() && f.status !== "Completed";
      if (filter === "This Week's Follow-ups") return d >= today && d < sevenDaysFromNow && f.status !== "Completed";
      if (filter === "Overdue Follow-ups") return d < today && f.status !== "Completed";
      return false;
    });
  }, [followups, filter, isFollowupFilter]);

  const filteredLeads = useMemo(() => {
    if (isFollowupFilter) return [];
    let filtered = leads;
    if (filter !== "All Clients") {
      filtered = filtered.filter(lead => {
        switch (filter) {
          case "New Leads": return lead.status === "New Lead";
          case "Qualified Leads": return lead.status === "Qualified Lead";
          case "Opportunities": return lead.status === "Opportunity";
          case "Existing Clients": return lead.status === "Client";
          case "Inactive Clients": return lead.status === "Inactive";
          default: return true;
        }
      });
    }
    if (searchTerm) {
      filtered = filtered.filter(lead =>
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm) ||
        lead.city.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return filtered;
  }, [leads, filter, searchTerm, isFollowupFilter]);

  const getStatusBadge = useCallback((status: string) => {
    const variants: Record<string, any> = {
      "New Lead": "default", "Qualified Lead": "secondary",
      "Opportunity": "outline-solid", "Client": "default", "Inactive": "secondary"
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  }, []);

  const handleDeleteClick = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    const userRole = typeof window !== 'undefined' ? localStorage.getItem("userRole") : "";
    if (userRole === "admin") {
      setAdminDeleteModalOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  }, []);

  const handleAdminDirectDelete = async () => {
    if (!selectedLead?.id) return;
    const result = await deleteLead(selectedLead.id);
    if (result.success) {
      toast({ title: "Lead Deleted", description: `Lead "${selectedLead.name}" has been permanently deleted.` });
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete lead", variant: "destructive" });
    }
    setAdminDeleteModalOpen(false);
    setSelectedLead(null);
  };
  const handleViewClick = useCallback((lead: Lead) => { setSelectedLead(lead); setViewModalOpen(true); }, []);
  const handleCallClick = useCallback((lead: Lead) => { setSelectedLead(lead); setCallModalOpen(true); }, []);
  const handleEmailClick = useCallback((lead: Lead) => { setSelectedLead(lead); setEmailModalOpen(true); }, []);
  const handleRowClick = useCallback((lead: Lead) => { setSelectedLead(lead); setConversationDrawerOpen(true); }, []);

  const handleMarkFollowupComplete = useCallback(async (id: string) => {
    const result = await updateFollowup(id, { status: "Completed" });
    toast(result.success
      ? { title: "Follow-up Completed", description: "Marked as completed.", duration: 3000 }
      : { title: "Error", description: result.error || "Failed to update", variant: "destructive" }
    );
  }, [toast]);

  const activeRows = isFollowupFilter ? filteredFollowupRows : filteredLeads;
  const totalPages = useMemo(() => Math.ceil(activeRows.length / pageSize), [activeRows.length, pageSize]);
  const paginatedRows = activeRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [filter, searchTerm]);

  return (
    <Card className="w-full">
      <div className="p-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {isFollowupFilter ? (
                  <>
                    <TableHead>Contact</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Name & Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isFollowupFilter ? 7 : 8} className="text-center py-8">
                    <div className="text-gray-500">
                      <Building2 className="h-8 w-8 mx-auto mb-2" />
                      <p>{isFollowupFilter ? "No follow-ups found" : "No leads found"}</p>
                      <p className="text-sm">Try adjusting your filter criteria</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isFollowupFilter ? (
                // Follow-up rows
                (paginatedRows as any[]).map((f) => {
                  const dt = new Date(f.dateTime);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.contact}</TableCell>
                      <TableCell>{f.company}</TableCell>
                      <TableCell>{f.type}</TableCell>
                      <TableCell>{dt.toLocaleDateString('en-IN')} at {dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell>{f.subject}</TableCell>
                      <TableCell>
                        <Badge className={f.status === "Overdue" ? "bg-red-500" : f.status === "Completed" ? "bg-green-500" : "bg-blue-500"}>
                          {f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {f.status !== "Completed" && (
                            <Button variant="ghost" size="icon" className="text-green-500 hover:text-green-600"
                              onClick={() => handleMarkFollowupComplete(f.id)} title="Mark Complete">
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                // Lead rows
                (paginatedRows as Lead[]).map((lead, index) => (
                  <TableRow key={lead.id || `lead-${index}`} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => handleRowClick(lead)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-semibold">{lead.name}</p>
                          <p className="text-sm text-gray-500">{lead.companyName}</p>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <MessageSquare className="h-3.5 w-3.5 text-gray-300 hover:text-red-500 transition-colors shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent><p>View conversation history</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">{lead.email}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">{lead.phone}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        <span className="text-sm">{lead.city}, {lead.state}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
                    <TableCell><span className="text-sm">{lead.assignedTo}</span></TableCell>
                    <TableCell><span className="text-sm font-medium">{lead.budget}</span></TableCell>
                    <TableCell><span className="text-sm text-gray-500">{lead.createdAt.toLocaleDateString()}</span></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => { e.stopPropagation(); handleEmailClick(lead); }}>
                                <Mail className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Send Email</p></TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={(e) => { e.stopPropagation(); handleCallClick(lead); }}>
                                <Phone className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Call Client</p></TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={(e) => { e.stopPropagation(); handleViewClick(lead); }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>View Details</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => handleViewClick(lead)} className="text-[#D71920]">
                              <Eye className="mr-2 h-4 w-4" />View Details
                            </DropdownMenuItem>
                            {onCreateQuotation && !leadsWithQuotation.has(lead.id) && (
                              <DropdownMenuItem onClick={() => onCreateQuotation(lead)} className="text-blue-600">
                                <FileText className="mr-2 h-4 w-4" />Create Quotation
                              </DropdownMenuItem>
                            )}
                            {!leadsWithQuotation.has(lead.id) && (
                              <DropdownMenuItem onClick={() => onEdit(lead)}>
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDeleteClick(lead)} className="text-red-600 focus:text-white focus:bg-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {activeRows.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={activeRows.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </div>

      {selectedLead && (
        <>
          <CallClientModal isOpen={callModalOpen} onClose={() => setCallModalOpen(false)}
            clientName={selectedLead.name} clientPhone={selectedLead.phone} />
          <EmailClientModal isOpen={emailModalOpen} onClose={() => setEmailModalOpen(false)}
            clientName={selectedLead.name} clientEmail={selectedLead.email} companyName={selectedLead.companyName} />
          <DeleteRequestModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}
            itemType="lead" itemId={selectedLead.id} clientName={selectedLead.name}
            contactEmail={selectedLead.email} contactPhone={selectedLead.phone}
            additionalInfo={`Company: ${selectedLead.companyName}`} />
          <AdminDeleteConfirmModal
            isOpen={adminDeleteModalOpen}
            onClose={() => { setAdminDeleteModalOpen(false); setSelectedLead(null); }}
            onConfirm={handleAdminDirectDelete}
            itemType="Lead"
            itemName={selectedLead.name}
            itemId={selectedLead.id}
          />
          <LeadDetailModal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} lead={selectedLead} />
          <LeadConversationDrawer isOpen={conversationDrawerOpen} onClose={() => setConversationDrawerOpen(false)} lead={selectedLead} />
        </>
      )}
    </Card>
  );
}
