'use client';
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  IdCard,
  HeartPulse,
  Users,
  Calendar,
  FileText,
  Activity,
  Home,
} from "lucide-react";
import type { HREmployee } from "@/services/supabase/HREmployeeService";
import { cn } from "@/lib/utils";

interface EmployeeProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: HREmployee | null;
}

const formatDate = (d?: string) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getStatusBadge = (status?: string) => {
  switch (status) {
    case "Active":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "Inactive":
      return "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400";
    case "On Leave":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "Terminated":
      return "bg-gray-500/10 text-gray-700 border-gray-500/30 dark:text-gray-400";
    default:
      return "bg-gray-500/10 text-gray-700 border-gray-500/30";
  }
};

// Reusable info row
const InfoRow = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px]">
      {Icon && <Icon className="h-4 w-4 text-[#D71920]" />}
      <span>{label}</span>
    </div>
    <div className="text-sm font-medium text-right wrap-break-word">
      {value || <span className="text-muted-foreground">—</span>}
    </div>
  </div>
);

// Section card
const SectionCard = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) => (
  <Card className="border-[#D71920]/10">
    <CardContent className="p-5">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[#D71920]/10">
        <Icon className="h-4 w-4 text-[#D71920]" />
        <h4 className="font-semibold text-sm">{title}</h4>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </CardContent>
  </Card>
);

// Sidebar sections
const SECTIONS = [
  { value: "personal", label: "Personal", icon: User },
  { value: "physical-medical", label: "Physical & Medical", icon: Activity },
  { value: "employment", label: "Employment", icon: Briefcase },
  { value: "address", label: "Address", icon: Home },
  { value: "banking", label: "Banking", icon: CreditCard },
  { value: "documents", label: "Documents", icon: FileText },
] as const;

type SectionValue = (typeof SECTIONS)[number]["value"];

export function EmployeeProfileModal({
  open,
  onOpenChange,
  employee,
}: EmployeeProfileModalProps) {
  const [activeSection, setActiveSection] = useState<SectionValue>("personal");

  const initials = useMemo(() => {
    if (!employee?.name) return "?";
    return employee.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [employee?.name]);

  if (!employee) return null;

  const fullAddress = [
    employee.currentAddress || employee.address,
    employee.city,
    employee.state,
    employee.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const renderSection = () => {
    switch (activeSection) {
      case "personal":
        return (
          <div className="space-y-5">
            <SectionCard title="Basic Information" icon={User}>
              <InfoRow label="Full Name" icon={User} value={employee.name} />
              <InfoRow label="Gender" value={employee.gender ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1) : undefined} />
              <InfoRow label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
              <InfoRow label="Marital Status" value={employee.maritalStatus ? employee.maritalStatus.charAt(0).toUpperCase() + employee.maritalStatus.slice(1) : undefined} />
              <InfoRow label="Religion" value={employee.religion} />
              <InfoRow label="Nationality" value={employee.nationality} />
              <InfoRow label="Caste" value={employee.caste} />
            </SectionCard>

            <SectionCard title="Contact Information" icon={Mail}>
              <InfoRow label="Email" icon={Mail} value={employee.email} />
              <InfoRow label="Phone" icon={Phone} value={employee.phone} />
              <InfoRow label="Alternate Phone" icon={Phone} value={employee.alternatePhone} />
            </SectionCard>

            <SectionCard title="Emergency Contact" icon={Users}>
              <InfoRow label="Name" value={employee.emergencyContactName} />
              <InfoRow label="Relation" value={employee.emergencyContactRelation} />
              <InfoRow label="Phone" icon={Phone} value={employee.emergencyContactPhone} />
            </SectionCard>
          </div>
        );

      case "physical-medical":
        return (
          <div className="space-y-5">
            <SectionCard title="Physical Details" icon={Activity}>
              <InfoRow label="Height" value={employee.height ? `${employee.height} cm` : undefined} />
              <InfoRow label="Weight" value={employee.weight ? `${employee.weight} kg` : undefined} />
              <InfoRow label="Blood Group" icon={HeartPulse} value={employee.bloodGroup} />
            </SectionCard>
          </div>
        );

      case "employment":
        return (
          <div className="space-y-5">
            <SectionCard title="Job Details" icon={Briefcase}>
              <InfoRow label="Employee ID" icon={IdCard} value={employee.employeeId} />
              <InfoRow label="Department" icon={Building2} value={employee.department} />
              <InfoRow label="Designation" value={employee.designation} />
              <InfoRow label="Employment Type" value={employee.employmentType} />
              <InfoRow label="Join Date" icon={Calendar} value={formatDate(employee.joinDate)} />
              <InfoRow label="Work Location" icon={MapPin} value={employee.workLocation || employee.branch} />
              <InfoRow label="Status" value={employee.status} />
            </SectionCard>

            <SectionCard title="Compensation" icon={CreditCard}>
              <InfoRow label="Monthly Salary" value={employee.salary ? `₹${Number(employee.salary).toLocaleString("en-IN")}` : employee.monthlySalary ? `₹${Number(employee.monthlySalary).toLocaleString("en-IN")}` : undefined} />
            </SectionCard>
          </div>
        );

      case "address":
        return (
          <div className="space-y-5">
            <SectionCard title="Address" icon={Home}>
              <InfoRow label="Address" icon={MapPin} value={employee.currentAddress || employee.address} />
              <InfoRow label="City" value={employee.city} />
              <InfoRow label="State" value={employee.state} />
              <InfoRow label="Pincode" value={employee.pincode} />
              <InfoRow label="Full Address" value={fullAddress || undefined} />
            </SectionCard>
          </div>
        );

      case "banking":
        return (
          <div className="space-y-5">
            <SectionCard title="Bank Account Details" icon={CreditCard}>
              <InfoRow label="Bank Name" value={employee.bankName} />
              <InfoRow label="Account Number" value={employee.bankAccount} />
              <InfoRow label="IFSC Code" value={employee.ifscCode} />
            </SectionCard>
          </div>
        );

      case "documents":
        return (
          <div className="space-y-5">
            <SectionCard title="Identity Documents" icon={IdCard}>
              <InfoRow label="Aadhar Number" value={employee.aadharNumber} />
              <InfoRow label="PAN Number" value={employee.panNumber} />
              <InfoRow label="UAN Number" value={employee.uanNumber} />
              <InfoRow label="ESI Number" value={employee.esiNumber} />
            </SectionCard>

            <SectionCard title="Uploaded Documents" icon={FileText}>
              <InfoRow label="Photo" value={employee.photoUrl ? "Uploaded ✓" : "Not uploaded"} />
            </SectionCard>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[92vh] p-0 gap-0 bg-white dark:bg-[#0a0a0a]"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#D71920]/20">
          <DialogTitle className="sr-only">
            Employee Profile - {employee.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed profile information for {employee.name}
          </DialogDescription>

          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <Avatar className="h-20 w-20 md:h-24 md:w-24 border-4 border-white shadow-xl ring-2 ring-[#D71920]/20">
              <AvatarImage src={employee.avatar || employee.photoUrl} />
              <AvatarFallback className="bg-linear-to-br from-[#D71920] to-[#b8151b] text-white text-2xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold truncate">{employee.name}</h2>
                <Badge className={`${getStatusBadge(employee.status)} border`}>
                  {employee.status || "—"}
                </Badge>
              </div>
              <p className="text-[#D71920] font-medium mt-0.5">
                {employee.designation || "—"}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <IdCard className="h-3.5 w-3.5" />
                  <span className="font-mono">{employee.employeeId || "—"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {employee.department || "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Joined {formatDate(employee.joinDate)}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Body: Sidebar + Content */}
        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(92vh - 160px)" }}>
          {/* Sidebar */}
          <nav className="w-56 border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 py-3 px-2 shrink-0">
            <ul className="space-y-1">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.value;
                return (
                  <li key={section.value}>
                    <button
                      onClick={() => setActiveSection(section.value)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                        isActive
                          ? "bg-[#D71920] text-white shadow-xs"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-[#D71920]")} />
                      <span>{section.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content Area */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {renderSection()}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
