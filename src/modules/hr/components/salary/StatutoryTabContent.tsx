'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { ComplianceService } from "@/services/ComplianceService";

interface SalaryData {
  id: string;
  name: string;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  [key: string]: any;
}

interface StatutoryTabContentProps {
  salaryData: SalaryData[];
}

export function StatutoryTabContent({ salaryData }: StatutoryTabContentProps) {
  // Calculate employer contributions using our ComplianceService
  const employerPfContribution = salaryData.reduce((sum, emp) => {
    const { employerPfContribution } = ComplianceService.calculateStatutoryDeductions({
      ...emp,
      basic: emp.pfDeduction * 100 / 12, // Estimating basic from PF deduction
      grossSalary: emp.esiDeduction * 100 / 1.75 // Estimating gross from ESI deduction
    } as any, "DEFAULT");
    
    return sum + employerPfContribution;
  }, 0);
  
  const employerEsiContribution = salaryData.reduce((sum, emp) => {
    const { employerEsiContribution } = ComplianceService.calculateStatutoryDeductions({
      ...emp,
      basic: emp.pfDeduction * 100 / 12,
      grossSalary: emp.esiDeduction * 100 / 1.75
    } as any, "DEFAULT");
    
    return sum + employerEsiContribution;
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statutory Compliance</CardTitle>
        <CardDescription>
          PF, ESI, Professional Tax and other statutory deductions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">PF Contribution</CardTitle>
              <CardDescription>Employee: 12%, Employer: 13%</CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <div className="text-2xl font-bold">
                  ₹{salaryData.reduce((sum, emp) => sum + emp.pfDeduction, 0).toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Employee contribution</div>
              </div>
              <div className="mt-2">
                <div className="text-xl font-semibold text-gray-600 dark:text-gray-400">
                  ₹{employerPfContribution.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Employer contribution</div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">ESI Contribution</CardTitle>
              <CardDescription>Employee: 1.75%, Employer: 4.75%</CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <div className="text-2xl font-bold">
                  ₹{salaryData.reduce((sum, emp) => sum + emp.esiDeduction, 0).toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Employee contribution</div>
              </div>
              <div className="mt-2">
                <div className="text-xl font-semibold text-gray-600 dark:text-gray-400">
                  ₹{employerEsiContribution.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Employer contribution</div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Professional Tax</CardTitle>
              <CardDescription>As per state regulations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{salaryData.reduce((sum, emp) => sum + emp.professionalTax, 0).toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Total professional tax</div>
              
              <div className="mt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Total Employees:</span>
                  <span className="font-medium">{salaryData.length}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Eligible for PT:</span>
                  <span className="font-medium">{salaryData.filter(emp => emp.professionalTax > 0).length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Generate PF ECR
            </Button>
            
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Generate ESI Return
            </Button>
            
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Generate PT Challan
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground mt-4">
            <p>
              Note: For detailed compliance management and filing status, please visit the 
              <span className="font-medium text-primary"> Compliance</span> tab.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
