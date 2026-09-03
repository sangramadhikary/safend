'use client';
import {
  Users,
  FileText,
  MessageSquare,
  BarChart2,
  Calendar,
  FileSignature,
  Building2
} from "lucide-react";
import { IndianRupee } from "@/components/icons/IndianRupee";

export const salesTabs = [
  { id: "clients", label: "Clients", icon: Building2 },
  { id: "crm", label: "Leads", icon: Users },
  { id: "quotations", label: "Quotations", icon: FileText },
  { id: "contracts", label: "Contracts", icon: FileSignature },
  { id: "aging", label: "Collections", icon: IndianRupee },
  { id: "reports", label: "Reports", icon: BarChart2 },
  { id: "calendar", label: "Calendar", icon: Calendar }
];

export const filterOptions = {
  "clients": ["All Clients", "Active", "Expiring Soon", "Dues Pending", "Inactive"],
  "crm": ["All Clients", "New Leads", "Qualified Leads", "Opportunities", "Existing Clients", "Inactive Clients", "Today's Follow-ups", "This Week's Follow-ups", "Overdue Follow-ups"],
  "quotations": ["All Quotations", "Draft", "Sent", "Revised", "Accepted", "Rejected"],
  "contracts": ["All Contracts", "Draft", "Active", "Completed", "Expiring"],
  "reports": ["Sales Performance", "Revenue Analysis", "Pipeline Status", "Conversion Rate", "Activity Reports"],
  "calendar": ["All Events", "Sales Meetings", "Site Visits", "Contract Deadlines", "HR Interviews", "Operations Planning", "Office Admin Meetings", "Compliance Deadlines"],
  "aging": ["All Invoices", "0-30 Days", "31-60 Days", "61-90 Days", "90+ Days"]
};
