'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExclamationTriangleIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

interface ComplianceAdherenceReportProps {
  period: string;
}

// Mock compliance data
const complianceData = [
  { 
    name: "PSARA License", 
    status: "Compliant", 
    adherence: 100,
    lastUpdated: "2023-04-15",
    expiryDate: "2025-04-14",
    requiredAction: null
  },
  { 
    name: "Guard Licenses", 
    status: "Mostly Compliant", 
    adherence: 96,
    lastUpdated: "2023-05-20",
    expiryDate: "Various",
    requiredAction: "4 guards require license renewal"
  },
  { 
    name: "Worker Wage Compliance", 
    status: "Compliant", 
    adherence: 100,
    lastUpdated: "2023-05-31",
    expiryDate: "N/A",
    requiredAction: null
  },
  { 
    name: "PF/ESI Registration", 
    status: "Compliant", 
    adherence: 100,
    lastUpdated: "2023-01-10",
    expiryDate: "N/A",
    requiredAction: null
  },
  { 
    name: "Insurance Coverage", 
    status: "Attention Required", 
    adherence: 85,
    lastUpdated: "2023-03-11",
    expiryDate: "2023-09-10",
    requiredAction: "Policy renewal due, coverage gap for new clients"
  },
  { 
    name: "Training Certifications", 
    status: "Partially Compliant", 
    adherence: 78,
    lastUpdated: "2023-05-25",
    expiryDate: "Various",
    requiredAction: "22 guards require refresher training"
  },
];

// Compliance filings data
const complianceFilings = [
  { name: "PF Monthly Return", dueDate: "2023-06-15", status: "Pending", filingFee: 0 },
  { name: "ESI Monthly Contribution", dueDate: "2023-06-21", status: "Pending", filingFee: 0 },
  { name: "GST Payment", dueDate: "2023-06-20", status: "Pending", filingFee: 0 },
  { name: "Professional Tax", dueDate: "2023-06-30", status: "Pending", filingFee: 2500 },
  { name: "Quarterly Labor Return", dueDate: "2023-07-15", status: "Upcoming", filingFee: 0 },
];

export function ComplianceAdherenceReport({ period }: ComplianceAdherenceReportProps) {
  // Calculate overall compliance score
  const overallComplianceScore = Math.round(
    complianceData.reduce((sum, item) => sum + item.adherence, 0) / complianceData.length
  );
  
  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Compliant": return "bg-green-500 hover:bg-green-600";
      case "Mostly Compliant": return "bg-blue-500 hover:bg-blue-600";
      case "Partially Compliant": return "bg-amber-500 hover:bg-amber-600";
      case "Attention Required": return "bg-red-500 hover:bg-red-600";
      case "Pending": return "bg-amber-500 hover:bg-amber-600";
      case "Upcoming": return "bg-blue-500 hover:bg-blue-600";
      default: return "";
    }
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    if (dateString === "N/A" || dateString === "Various") return dateString;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <div className="text-2xl font-bold mr-2">{overallComplianceScore}%</div>
              {overallComplianceScore >= 90 ? (
                <Badge className="bg-green-500">Good</Badge>
              ) : overallComplianceScore >= 75 ? (
                <Badge className="bg-amber-500">Needs Attention</Badge>
              ) : (
                <Badge className="bg-red-500">Critical</Badge>
              )}
            </div>
            <Progress 
              value={overallComplianceScore} 
              className={`h-2 mt-2 ${
                overallComplianceScore >= 90 ? 'bg-green-500' : 
                overallComplianceScore >= 75 ? 'bg-amber-500' : 'bg-red-500'
              }`} 
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Filings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{complianceFilings.filter(filing => filing.status === "Pending").length}</div>
            <p className="text-xs text-muted-foreground">
              Due within next 30 days
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Documentation Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {complianceData.filter(item => item.status === "Compliant").length}/{complianceData.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Fully compliant records
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Compliance Status</CardTitle>
          <CardDescription>Key regulatory and license compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compliance Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Adherence</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Required Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complianceData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge className={getStatusBadgeColor(item.status)}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span className="w-8 text-sm">{item.adherence}%</span>
                      <Progress 
                        value={item.adherence} 
                        className={`h-2 ml-2 ${
                          item.adherence === 100 ? 'bg-green-500' : 
                          item.adherence >= 90 ? 'bg-blue-500' : 
                          item.adherence >= 75 ? 'bg-amber-500' : 'bg-red-500'
                        }`} 
                      />
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(item.lastUpdated)}</TableCell>
                  <TableCell>{formatDate(item.expiryDate)}</TableCell>
                  <TableCell>{item.requiredAction || "No action needed"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Compliance Filings</CardTitle>
          <CardDescription>Statutory forms and payments due</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filing Name</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filing Fee (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complianceFilings.map((filing, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{filing.name}</TableCell>
                  <TableCell>{formatDate(filing.dueDate)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusBadgeColor(filing.status)}>
                      {filing.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{filing.filingFee > 0 ? `₹${filing.filingFee.toLocaleString()}` : "No fee"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Alerts for critical items */}
      <div className="space-y-4">
        {complianceData.some(item => item.adherence < 90) && (
          <Alert variant="destructive">
            <ExclamationTriangleIcon className="h-4 w-4" />
            <AlertTitle>Compliance Issues Detected</AlertTitle>
            <AlertDescription>
              There are compliance gaps that require immediate attention. Please review the detailed report and take corrective actions.
            </AlertDescription>
          </Alert>
        )}
        
        {complianceFilings.some(filing => filing.status === "Pending" && new Date(filing.dueDate) <= new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000)) && (
          <Alert>
            <CheckCircleIcon className="h-4 w-4" />
            <AlertTitle>Upcoming Filing Deadlines</AlertTitle>
            <AlertDescription>
              You have compliance filings due within the next 7 days. Please ensure timely submission to avoid penalties.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
