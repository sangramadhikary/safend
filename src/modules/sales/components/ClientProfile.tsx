'use client';

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Edit, Phone, Mail, MapPin, Building, User, Calendar, FileText, FileSignature, ClipboardList } from "lucide-react";
import { IndianRupee } from "@/components/icons/IndianRupee";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Mock data for client interactions
const mockInteractions = [
  {
    id: 1,
    type: "Call",
    date: "2025-05-05",
    contactPerson: "John Smith",
    notes: "Discussed upcoming contract renewal and potential service expansion.",
    outcome: "Positive",
    nextAction: "Send proposal for additional services",
    nextActionDate: "2025-05-10"
  },
  {
    id: 2,
    type: "Email",
    date: "2025-05-02",
    contactPerson: "Sarah Johnson",
    notes: "Sent monthly security report and performance metrics.",
    outcome: "Informational",
    nextAction: "Schedule follow-up call to discuss report findings",
    nextActionDate: "2025-05-08"
  },
  {
    id: 3,
    type: "Meeting",
    date: "2025-04-25",
    contactPerson: "Michael Davis",
    notes: "Site visit to assess additional security needs for new facility.",
    outcome: "Positive",
    nextAction: "Prepare quotation for expanded security coverage",
    nextActionDate: "2025-05-01"
  }
];

// Mock data for transactions
const mockTransactions = [
  {
    id: 1,
    invoiceNumber: "INV-2025-042",
    date: "2025-04-01",
    amount: "₹1,25,000",
    status: "Paid",
    paymentDate: "2025-04-10",
    paymentMethod: "Bank Transfer"
  },
  {
    id: 2,
    invoiceNumber: "INV-2025-031",
    date: "2025-03-01",
    amount: "₹1,25,000",
    status: "Paid",
    paymentDate: "2025-03-12",
    paymentMethod: "Bank Transfer"
  },
  {
    id: 3,
    invoiceNumber: "INV-2025-020",
    date: "2025-02-01",
    amount: "₹1,25,000",
    status: "Paid",
    paymentDate: "2025-02-11",
    paymentMethod: "Bank Transfer"
  }
];

// Mock data for quotations
const mockClientQuotations = [
  {
    id: "QT-2025-112",
    date: "2025-04-15",
    service: "Additional armed guards (4) for night shift",
    amount: "₹88,000",
    status: "Pending",
    validUntil: "2025-05-15"
  },
  {
    id: "QT-2025-097",
    date: "2025-03-10",
    service: "CCTV system upgrade (12 cameras)",
    amount: "₹54,000",
    status: "Accepted",
    validUntil: "2025-04-10"
  }
];

// Mock data for agreements
const mockClientAgreements = [
  {
    id: 1,
    reference: "AGR-2024-153",
    startDate: "2024-10-01",
    endDate: "2025-09-30",
    serviceScope: "Security guards (6) - 24/7 coverage",
    status: "Active",
    value: "₹12,50,000"
  }
];

// Mock data for workorders
const mockClientWorkorders = [
  {
    id: "WO-2024-153",
    startDate: "2024-10-01",
    location: "Headquarters Building, Mumbai",
    manpower: "4 Day Guards, 2 Night Guards",
    supervisor: "Rajesh Kumar",
    status: "Active"
  }
];

// Helper function to get badge for interaction outcome
const getOutcomeBadge = (outcome: string) => {
  switch (outcome) {
    case "Positive":
      return <Badge className="bg-green-500">Positive</Badge>;
    case "Neutral":
      return <Badge className="bg-blue-500">Neutral</Badge>;
    case "Negative":
      return <Badge className="bg-red-500">Negative</Badge>;
    default:
      return <Badge className="bg-gray-500">{outcome}</Badge>;
  }
};

interface ClientProfileProps {
  client: any;
  onBack: () => void;
  onEdit: (item: any, type: string) => void;
}

export function ClientProfile({ client, onBack, onEdit }: ClientProfileProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();
  
  const handleAddInteraction = () => {
    toast({
      title: "Add Interaction",
      description: "Interaction form would open here",
      duration: 3000,
    });
  };
  
  const handleEditContact = () => {
    onEdit(client, "contact");
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Client List
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleEditContact}
          className="flex items-center gap-2"
        >
          <Edit className="h-4 w-4" />
          Edit Client
        </Button>
      </div>
      
      <div className="bg-white dark:bg-black rounded-lg p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">{client.clientName}</h2>
            <div className="flex items-center gap-4 mt-2">
              <Badge className="bg-safend-red">{client.status}</Badge>
              <span className="text-muted-foreground">Client since Oct 2024</span>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-gray-500" />
                <span>Security Services</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <span>{client.contactPerson}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-500" />
                <span>{client.contactPhone || "+91 98765 43210"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <span>contact@{client.clientName.toLowerCase().replace(/ /g, '')}.com</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>Mumbai, Maharashtra</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Annual Contract Value</p>
              <p className="text-2xl font-bold text-safend-red">₹15,00,000</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Contract Expiry</p>
              <p className="text-2xl font-bold">Sep 2025</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Active Services</p>
              <p className="text-2xl font-bold">3</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Open Invoices</p>
              <p className="text-2xl font-bold">₹1,25,000</p>
            </div>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <TabsTrigger value="overview" className="flex gap-2 items-center">
            Overview
          </TabsTrigger>
          <TabsTrigger value="interactions" className="flex gap-2 items-center">
            Interactions
          </TabsTrigger>
          <TabsTrigger value="quotations" className="flex gap-2 items-center">
            <FileText className="h-4 w-4" />
            Quotations
          </TabsTrigger>
          <TabsTrigger value="agreements" className="flex gap-2 items-center">
            <FileSignature className="h-4 w-4" />
            Agreements
          </TabsTrigger>
          <TabsTrigger value="workorders" className="flex gap-2 items-center">
            <ClipboardList className="h-4 w-4" />
            Work Orders
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex gap-2 items-center">
            <IndianRupee className="h-4 w-4" />
            Transactions
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Interactions</CardTitle>
                  <CardDescription>Latest client communications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mockInteractions.slice(0, 2).map(interaction => (
                    <div key={interaction.id} className="border-b border-gray-200 dark:border-gray-800 pb-4 last:border-none last:pb-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{interaction.type}</p>
                          <p className="text-sm text-muted-foreground">{interaction.date}</p>
                        </div>
                        {getOutcomeBadge(interaction.outcome)}
                      </div>
                      <p className="text-sm mt-2">{interaction.notes}</p>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full mt-2">View All</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Active Agreements</CardTitle>
                  <CardDescription>Current contracts in force</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mockClientAgreements.map(agreement => (
                    <div key={agreement.id} className="border-b border-gray-200 dark:border-gray-800 pb-4 last:border-none last:pb-0">
                      <div className="flex justify-between items-start">
                        <p className="font-medium">{agreement.reference}</p>
                        <Badge className="bg-green-500">{agreement.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{agreement.startDate} to {agreement.endDate}</p>
                      <p className="text-sm mt-2">{agreement.serviceScope}</p>
                      <p className="font-medium mt-1">{agreement.value}</p>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full mt-2">View Details</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Transactions</CardTitle>
                  <CardDescription>Latest financial activity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mockTransactions.slice(0, 3).map(transaction => (
                    <div key={transaction.id} className="border-b border-gray-200 dark:border-gray-800 pb-4 last:border-none last:pb-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{transaction.invoiceNumber}</p>
                          <p className="text-sm text-muted-foreground">{transaction.date}</p>
                        </div>
                        <Badge className="bg-green-500">{transaction.status}</Badge>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-sm">Paid on {transaction.paymentDate}</p>
                        <p className="font-medium">{transaction.amount}</p>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full mt-2">View All</Button>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Service Overview</CardTitle>
                <CardDescription>Current security services provided</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Service</th>
                        <th className="text-left p-2">Location</th>
                        <th className="text-left p-2">Staff</th>
                        <th className="text-left p-2">Hours</th>
                        <th className="text-left p-2">Monthly Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2">Security Guards</td>
                        <td className="p-2">Headquarters Building</td>
                        <td className="p-2">6 Guards</td>
                        <td className="p-2">24/7</td>
                        <td className="p-2">₹1,25,000</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">CCTV Monitoring</td>
                        <td className="p-2">Headquarters Building</td>
                        <td className="p-2">12 Cameras</td>
                        <td className="p-2">24/7</td>
                        <td className="p-2">₹15,000</td>
                      </tr>
                      <tr>
                        <td className="p-2">Access Control</td>
                        <td className="p-2">Headquarters Building</td>
                        <td className="p-2">5 Points</td>
                        <td className="p-2">24/7</td>
                        <td className="p-2">₹8,500</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="interactions" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Client Interactions</h3>
              <Button className="bg-safend-red hover:bg-red-700" onClick={handleAddInteraction}>
                Add Interaction
              </Button>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Contact</th>
                        <th className="text-left p-2">Notes</th>
                        <th className="text-left p-2">Outcome</th>
                        <th className="text-left p-2">Next Action</th>
                        <th className="text-left p-2">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockInteractions.map(interaction => (
                        <tr key={interaction.id} className="border-b">
                          <td className="p-2">{interaction.date}</td>
                          <td className="p-2">{interaction.type}</td>
                          <td className="p-2">{interaction.contactPerson}</td>
                          <td className="p-2">{interaction.notes}</td>
                          <td className="p-2">{getOutcomeBadge(interaction.outcome)}</td>
                          <td className="p-2">{interaction.nextAction}</td>
                          <td className="p-2">{interaction.nextActionDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="quotations" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Client Quotations</h3>
              <Button className="bg-safend-red hover:bg-red-700" onClick={() => onEdit(client, "quotation")}>
                New Quotation
              </Button>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Quote #</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Service</th>
                        <th className="text-left p-2">Amount</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Valid Until</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockClientQuotations.map(quotation => (
                        <tr key={quotation.id} className="border-b">
                          <td className="p-2">{quotation.id}</td>
                          <td className="p-2">{quotation.date}</td>
                          <td className="p-2">{quotation.service}</td>
                          <td className="p-2">{quotation.amount}</td>
                          <td className="p-2">
                            <Badge className={quotation.status === "Accepted" ? "bg-green-500" : "bg-blue-500"}>
                              {quotation.status}
                            </Badge>
                          </td>
                          <td className="p-2">{quotation.validUntil}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="agreements" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Client Agreements</h3>
              <Button className="bg-safend-red hover:bg-red-700" onClick={() => onEdit(client, "agreement")}>
                New Agreement
              </Button>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Reference</th>
                        <th className="text-left p-2">Start Date</th>
                        <th className="text-left p-2">End Date</th>
                        <th className="text-left p-2">Service Scope</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockClientAgreements.map(agreement => (
                        <tr key={agreement.id} className="border-b">
                          <td className="p-2">{agreement.reference}</td>
                          <td className="p-2">{agreement.startDate}</td>
                          <td className="p-2">{agreement.endDate}</td>
                          <td className="p-2">{agreement.serviceScope}</td>
                          <td className="p-2">
                            <Badge className="bg-green-500">{agreement.status}</Badge>
                          </td>
                          <td className="p-2">{agreement.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="workorders" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Client Work Orders</h3>
              <Button className="bg-safend-red hover:bg-red-700" onClick={() => onEdit(client, "workorder")}>
                New Work Order
              </Button>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">WO #</th>
                        <th className="text-left p-2">Start Date</th>
                        <th className="text-left p-2">Location</th>
                        <th className="text-left p-2">Manpower</th>
                        <th className="text-left p-2">Supervisor</th>
                        <th className="text-left p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockClientWorkorders.map(workorder => (
                        <tr key={workorder.id} className="border-b">
                          <td className="p-2">{workorder.id}</td>
                          <td className="p-2">{workorder.startDate}</td>
                          <td className="p-2">{workorder.location}</td>
                          <td className="p-2">{workorder.manpower}</td>
                          <td className="p-2">{workorder.supervisor}</td>
                          <td className="p-2">
                            <Badge className="bg-green-500">{workorder.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="transactions" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Client Transactions</h3>
              <Button className="bg-safend-red hover:bg-red-700" onClick={() => onEdit(client, "aging")}>
                Add Collection Task
              </Button>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Invoice #</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Amount</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Payment Date</th>
                        <th className="text-left p-2">Payment Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockTransactions.map(transaction => (
                        <tr key={transaction.id} className="border-b">
                          <td className="p-2">{transaction.invoiceNumber}</td>
                          <td className="p-2">{transaction.date}</td>
                          <td className="p-2">{transaction.amount}</td>
                          <td className="p-2">
                            <Badge className="bg-green-500">{transaction.status}</Badge>
                          </td>
                          <td className="p-2">{transaction.paymentDate}</td>
                          <td className="p-2">{transaction.paymentMethod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
