'use client';
import { useState } from 'react';
import { useAccountsData } from '@/hooks/accounts/useAccountsData';
import { 
  LicenseDocument, 
  ComplianceFee,
  getLicenseDocuments,
  getComplianceFees,
  createComplianceFee,
  updateLicenseDocument
} from '@/services/security/SecurityComplianceService';
import { 
  Table, TableHeader, TableBody, TableHead, 
  TableRow, TableCell 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from "date-fns";
import { 
  Search, Filter, Plus, FileText, Calendar, IndianRupee, 
  AlertTriangle, CheckCircle, Clock, FileCheck, MoreHorizontal,
  Download, Bell
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function SecurityComplianceView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('licenses');
  const { toast } = useToast();

  // Fetch license documents
  const { 
    data: licenses, 
    isLoading: isLoadingLicenses,
    refetch: refetchLicenses
  } = useAccountsData(
    () => getLicenseDocuments(),
    [searchQuery],
    [],
    "Failed to load license data"
  );
  
  // Fetch compliance fees
  const {
    data: fees,
    isLoading: isLoadingFees,
    refetch: refetchFees
  } = useAccountsData(
    () => getComplianceFees(),
    [searchQuery],
    [],
    "Failed to load compliance fees data"
  );
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refetchLicenses();
    refetchFees();
  };
  
  const handleAddComplianceFee = async (licenseId: string) => {
    const license = licenses?.find(lic => lic.id === licenseId);
    if (!license) return;
    
    try {
      await createComplianceFee({
        licenseId,
        type: 'RENEWAL',
        amount: 5000,
        dueDate: new Date().toISOString().split('T')[0],
        status: 'pending',
      });
      
      toast({
        title: "Fee Added",
        description: `A renewal fee has been added for ${license.name}`,
      });
      
      refetchFees();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add compliance fee",
        variant: "destructive",
      });
    }
  };
  
  const handleRenewLicense = async (licenseId: string) => {
    const license = licenses?.find(lic => lic.id === licenseId);
    if (!license) return;
    
    // Set expiry date to one year from now
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    
    try {
      await updateLicenseDocument(licenseId, {
        expiryDate: expiryDate.toISOString().split('T')[0],
        status: 'active'
      });
      
      toast({
        title: "License Renewed",
        description: `${license.name} has been renewed until ${format(expiryDate, "dd/MM/yyyy")}`,
      });
      
      refetchLicenses();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to renew license",
        variant: "destructive",
      });
    }
  };
  
  // Render licenses table
  const renderLicenses = () => {
    if (isLoadingLicenses) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            Loading license data...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!licenses || licenses.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            No licenses found.
          </TableCell>
        </TableRow>
      );
    }
    
    return licenses.map((license) => (
      <TableRow key={license.id}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {license.type === 'PSARA' ? 
              <FileCheck className="h-4 w-4 text-blue-500" /> : 
              <FileText className="h-4 w-4 text-gray-500" />
            }
            <span>{license.name}</span>
          </div>
        </TableCell>
        <TableCell>{license.type}</TableCell>
        <TableCell>{license.number}</TableCell>
        <TableCell>{license.issuedBy}</TableCell>
        <TableCell>{format(new Date(license.expiryDate), "dd/MM/yyyy")}</TableCell>
        <TableCell>
          <LicenseStatusBadge status={license.status} />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            {(license.status === 'pending_renewal' || license.status === 'expired') && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleRenewLicense(license.id)}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Renew
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => handleAddComplianceFee(license.id)}
            >
              <IndianRupee className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));
  };
  
  // Render fees table
  const renderFees = () => {
    if (isLoadingFees) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            Loading compliance fees data...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!fees || fees.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            No compliance fees found.
          </TableCell>
        </TableRow>
      );
    }
    
    return fees.map((fee) => {
      const license = licenses?.find(lic => lic.id === fee.licenseId);
      
      return (
        <TableRow key={fee.id}>
          <TableCell className="font-medium">
            {license?.name || fee.licenseId}
          </TableCell>
          <TableCell>{fee.type}</TableCell>
          <TableCell>₹{fee.amount.toLocaleString()}</TableCell>
          <TableCell>{format(new Date(fee.dueDate), "dd/MM/yyyy")}</TableCell>
          <TableCell>
            <FeeStatusBadge status={fee.status} />
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              {fee.status === 'pending' && (
                <Button 
                  variant="outline" 
                  size="sm"
                >
                  <IndianRupee className="h-4 w-4 mr-2" />
                  Pay
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    });
  };
  
  // Render reminders and expiry notifications
  const renderReminders = () => {
    // Filter licenses that are expiring soon or expired
    const expiringLicenses = licenses?.filter(license => 
      license.status === 'pending_renewal' || license.status === 'expired'
    ) || [];
    
    // Filter pending or overdue fees
    const pendingFees = fees?.filter(fee => 
      fee.status === 'pending' || fee.status === 'overdue'
    ) || [];
    
    if (expiringLicenses.length === 0 && pendingFees.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10">
          <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
          <h3 className="text-lg font-medium">All Compliances Up to Date</h3>
          <p className="text-sm text-muted-foreground">No pending renewals or payments required</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {expiringLicenses.length > 0 && (
          <>
            <h3 className="text-lg font-medium">License Renewals</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringLicenses.map((license) => (
                  <TableRow key={license.id}>
                    <TableCell className="font-medium">
                      {license.name}
                    </TableCell>
                    <TableCell>{license.type}</TableCell>
                    <TableCell>{format(new Date(license.expiryDate), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <LicenseStatusBadge status={license.status} />
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm"
                        onClick={() => handleRenewLicense(license.id)}
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Renew Now
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        
        {pendingFees.length > 0 && (
          <>
            <h3 className="text-lg font-medium mt-6">Pending Payments</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingFees.map((fee) => {
                  const license = licenses?.find(lic => lic.id === fee.licenseId);
                  
                  return (
                    <TableRow key={fee.id}>
                      <TableCell className="font-medium">
                        {license?.name || fee.licenseId}
                      </TableCell>
                      <TableCell>{fee.type}</TableCell>
                      <TableCell>₹{fee.amount.toLocaleString()}</TableCell>
                      <TableCell>{format(new Date(fee.dueDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <FeeStatusBadge status={fee.status} />
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="sm"
                          variant={fee.status === 'overdue' ? 'default' : 'outline'}
                        >
                          <IndianRupee className="h-4 w-4 mr-2" />
                          Pay Now
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Security Compliance</h2>
        <p className="text-muted-foreground">
          Manage PSARA licenses, guard licenses, and statutory compliance
        </p>
      </div>
      
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="Search licenses..."
            className="max-w-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit" variant="default">
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
        </form>
        
        <div className="flex items-center gap-2">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New License
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="licenses" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
          <TabsTrigger value="fees">Compliance Fees</TabsTrigger>
          <TabsTrigger value="reminders">Reminders & Due Dates</TabsTrigger>
        </TabsList>
        
        <TabsContent value="licenses" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">
                <span className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Security Licenses
                </span>
              </CardTitle>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>License Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>License Number</TableHead>
                    <TableHead>Issued By</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderLicenses()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="fees" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">
                <span className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5" />
                  Compliance Fees
                </span>
              </CardTitle>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>License</TableHead>
                    <TableHead>Fee Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderFees()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="reminders" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">
                <span className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Compliance Reminders
                </span>
              </CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              {renderReminders()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// License status badge component
const LicenseStatusBadge = ({ status }: { status: LicenseDocument['status'] }) => {
  switch (status) {
    case 'active':
      return <Badge variant="default" className="bg-green-500">Active</Badge>;
    case 'expired':
      return <Badge variant="destructive">Expired</Badge>;
    case 'pending_renewal':
      return <Badge variant="secondary" className="bg-amber-500 text-white">Renewal Due</Badge>;
    case 'cancelled':
      return <Badge variant="outline" className="border-gray-400 text-gray-500">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

// Fee status badge component
const FeeStatusBadge = ({ status }: { status: ComplianceFee['status'] }) => {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'paid':
      return <Badge variant="default" className="bg-green-500">Paid</Badge>;
    case 'overdue':
      return <Badge variant="destructive">Overdue</Badge>;
    case 'cancelled':
      return <Badge variant="outline" className="border-gray-400 text-gray-500">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};
