'use client';
import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, 
  Bell, 
  Calendar, 
  CheckCircle, 
  Clock, 
  FileText, 
  RefreshCw,
  TrendingUp,
  Users,
  AlertCircle,
  ArrowRight,
  Phone,
  Mail,
  ClipboardList
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Agreement } from "@/services/supabase/AgreementFirebaseService";
import { WorkOrder } from "@/services/supabase/WorkOrderFirebaseService";
import {
  calculateDaysUntilExpiry,
  getRenewalStatus,
  getRenewalPriority,
  generateActionPlan,
  ContractRenewal
} from "@/services/supabase/ContractRenewalService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAgreementsData } from "@/contexts/AgreementsDataContext";
import { useWorkOrdersData } from "@/contexts/WorkOrdersDataContext";
import { CountUp } from "@/components/dashboard/CountUp";

interface ContractWithRenewal extends Agreement {
  workOrder?: WorkOrder;
  daysUntilExpiry: number;
  renewalStatus: ContractRenewal['renewalStatus'];
  priority: ContractRenewal['priority'];
  actionPlan: string;
  expiryDate: Date;
  isAutoRenewal: boolean;
  contractDurationMonths: number;
}

interface ContractOverviewProps {
  onViewContract: (contract: any) => void;
  onRenewContract: (contract: any) => void;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-600 text-white';
    case 'high': return 'bg-orange-500 text-white';
    case 'medium': return 'bg-yellow-500 text-black';
    case 'low': return 'bg-green-500 text-white';
    default: return 'bg-gray-500 text-white';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'overdue': return 'bg-red-100 text-red-800 border-red-300';
    case 'due': return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'upcoming': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'renewed': return 'bg-green-100 text-green-800 border-green-300';
    case 'terminated': return 'bg-gray-100 text-gray-800 border-gray-300';
    default: return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

export function ContractOverview({ onViewContract, onRenewContract }: ContractOverviewProps) {
  // Use centralized data from contexts
  const { agreements, isLoading: agreementsLoading } = useAgreementsData();
  const { workOrders, isLoading: workOrdersLoading } = useWorkOrdersData();
  const [selectedContract, setSelectedContract] = useState<ContractWithRenewal | null>(null);
  const [actionPlanModalOpen, setActionPlanModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'expiring' | 'active'>('all');
  const { toast } = useToast();

  // Process contracts with renewal information
  const contractsWithRenewal = useMemo(() => {
    // Show ALL agreements, not just Signed/Active - let the UI filter them
    const processedContracts: ContractWithRenewal[] = agreements
      .map(agreement => {
        const workOrder = workOrders.find(wo => wo.linkedAgreementId === agreement.id);
        
        // Get contract duration from legalTerms (default 12 months)
        const contractDurationMonths = parseInt((agreement as any).legalTerms?.contractDuration || '12', 10);
        const isAutoRenewal = (agreement as any).legalTerms?.automaticRenewal || false;
        
        // Calculate contract end date using validUntil field first, then fallback to calculation
        let endDate: Date;
        
        if ((agreement as any).validUntil) {
          endDate = new Date((agreement as any).validUntil);
        } else if ((agreement as any).signedOn) {
          const signedDate = new Date((agreement as any).signedOn);
          endDate = new Date(signedDate);
          endDate.setMonth(endDate.getMonth() + contractDurationMonths);
        } else if ((agreement as any).signedDate) {
          const signedDate = (agreement as any).signedDate instanceof Date 
            ? (agreement as any).signedDate 
            : new Date((agreement as any).signedDate);
          endDate = new Date(signedDate);
          endDate.setMonth(endDate.getMonth() + contractDurationMonths);
        } else if (agreement.createdAt) {
          const createdDate = agreement.createdAt instanceof Date 
            ? agreement.createdAt 
            : new Date(agreement.createdAt);
          endDate = new Date(createdDate);
          endDate.setMonth(endDate.getMonth() + contractDurationMonths);
        } else {
          endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 3);
        }
        
        const daysUntilExpiry = calculateDaysUntilExpiry(endDate);
        const renewalStatus = getRenewalStatus(daysUntilExpiry);
        const priority = getRenewalPriority(daysUntilExpiry);
        const actionPlan = generateActionPlan(daysUntilExpiry, agreement.clientName);
        
        return {
          ...agreement,
          workOrder,
          daysUntilExpiry,
          renewalStatus,
          priority,
          actionPlan,
          expiryDate: endDate,
          isAutoRenewal,
          contractDurationMonths
        } as ContractWithRenewal;
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    
    return processedContracts;
  }, [agreements, workOrders]);

  // Filter contracts based on active filter
  const filteredContracts = contractsWithRenewal.filter(contract => {
    switch (activeFilter) {
      case 'critical':
        return contract.priority === 'critical' || contract.priority === 'high';
      case 'expiring':
        return contract.daysUntilExpiry <= 30;
      case 'active':
        return contract.workOrder?.status === 'In Progress' || contract.workOrder?.status === 'Scheduled';
      default:
        return true;
    }
  });

  // Stats calculations - count all agreements
  const stats = {
    total: contractsWithRenewal.length,
    expiringSoon: contractsWithRenewal.filter(c => c.daysUntilExpiry <= 10 && c.daysUntilExpiry >= 0 && (c.status === 'Signed' || c.status === 'Active')).length,
    overdue: contractsWithRenewal.filter(c => c.daysUntilExpiry < 0 && (c.status === 'Signed' || c.status === 'Active')).length,
    active: contractsWithRenewal.filter(c => c.workOrder?.status === 'In Progress' || c.workOrder?.status === 'Scheduled').length,
    totalValue: contractsWithRenewal.reduce((sum, c) => {
      const value = parseFloat(c.value?.replace(/[₹,]/g, '') || '0');
      return sum + value;
    }, 0)
  };

  const handleViewActionPlan = (contract: ContractWithRenewal) => {
    setSelectedContract(contract);
    setActionPlanModalOpen(true);
  };

  const handleInitiateRenewal = (contract: ContractWithRenewal) => {
    onRenewContract(contract);
    toast({
      title: "Renewal Process Started",
      description: `Initiating renewal for ${contract.clientName}`,
      duration: 3000,
    });
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner for Critical Contracts */}
      {(stats.overdue > 0 || stats.expiringSoon > 0) && (
        <div className={`p-4 rounded-lg border-2 ${stats.overdue > 0 ? 'bg-red-50 border-red-300 dark:bg-red-900/20' : 'bg-orange-50 border-orange-300 dark:bg-orange-900/20'}`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-6 w-6 ${stats.overdue > 0 ? 'text-red-600' : 'text-orange-600'}`} />
            <div className="flex-1">
              <h4 className={`font-semibold ${stats.overdue > 0 ? 'text-red-800 dark:text-red-300' : 'text-orange-800 dark:text-orange-300'}`}>
                {stats.overdue > 0 
                  ? `🚨 ${stats.overdue} Contract(s) EXPIRED - Immediate Action Required!`
                  : `⚠️ ${stats.expiringSoon} Contract(s) Expiring Within 10 Days`
                }
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Review the contracts below and take necessary action to ensure service continuity.
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setActiveFilter('critical')}
              className="border-red-300 text-red-600 hover:bg-red-100"
            >
              View Critical
            </Button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveFilter('all')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Contracts</p>
                <p className="text-2xl font-bold"><CountUp to={stats.total} duration={2} separator="," /></p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow border-red-200" onClick={() => setActiveFilter('critical')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Expiring (10 days)</p>
                <p className="text-2xl font-bold text-red-600"><CountUp to={stats.expiringSoon} duration={2} separator="," /></p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow border-orange-200" onClick={() => setActiveFilter('critical')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">Overdue</p>
                <p className="text-2xl font-bold text-orange-600"><CountUp to={stats.overdue} duration={2} separator="," /></p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow border-green-200" onClick={() => setActiveFilter('active')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Active</p>
                <p className="text-2xl font-bold text-green-600"><CountUp to={stats.active} duration={2} separator="," /></p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">₹{(stats.totalValue / 100000).toFixed(1)}L</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button 
          variant={activeFilter === 'all' ? 'default' : 'outline-solid'} 
          size="sm"
          onClick={() => setActiveFilter('all')}
        >
          All Contracts ({contractsWithRenewal.length})
        </Button>
        <Button 
          variant={activeFilter === 'critical' ? 'default' : 'outline-solid'} 
          size="sm"
          onClick={() => setActiveFilter('critical')}
          className={activeFilter === 'critical' ? 'bg-red-600 hover:bg-red-700' : 'border-red-300 text-red-600'}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Critical ({contractsWithRenewal.filter(c => c.priority === 'critical' || c.priority === 'high').length})
        </Button>
        <Button 
          variant={activeFilter === 'expiring' ? 'default' : 'outline-solid'} 
          size="sm"
          onClick={() => setActiveFilter('expiring')}
          className={activeFilter === 'expiring' ? 'bg-orange-600 hover:bg-orange-700' : 'border-orange-300 text-orange-600'}
        >
          <Clock className="h-4 w-4 mr-1" />
          Expiring Soon ({contractsWithRenewal.filter(c => c.daysUntilExpiry <= 30).length})
        </Button>
        <Button 
          variant={activeFilter === 'active' ? 'default' : 'outline-solid'} 
          size="sm"
          onClick={() => setActiveFilter('active')}
          className={activeFilter === 'active' ? 'bg-green-600 hover:bg-green-700' : 'border-green-300 text-green-600'}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Active ({stats.active})
        </Button>
      </div>

      {/* Contracts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Contract Renewal Status
          </CardTitle>
          <CardDescription>
            Monitor contract expiry dates and take timely action for renewals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredContracts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No contracts found matching the selected filter</p>
              </div>
            ) : (
              filteredContracts.map((contract) => (
                <div 
                  key={contract.id} 
                  className={`border rounded-lg p-4 hover:shadow-md transition-all ${
                    contract.daysUntilExpiry < 0 ? 'border-red-300 bg-red-50/50 dark:bg-red-900/10' :
                    contract.daysUntilExpiry <= 10 ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-900/10' :
                    'border-gray-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Contract Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h5 className="font-semibold text-lg">{contract.clientName}</h5>
                        <Badge className={getPriorityColor(contract.priority)}>
                          {contract.priority.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusColor(contract.renewalStatus)}>
                          {contract.renewalStatus === 'overdue' ? 'EXPIRED' : 
                           contract.renewalStatus === 'due' ? 'EXPIRING SOON' :
                           contract.renewalStatus.toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Quote Ref:</span>
                          <span className="ml-2 font-medium">{contract.linkedQuoteId || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Value:</span>
                          <span className="ml-2 font-medium">{contract.value}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="ml-2 font-medium">{contract.contractDurationMonths} months</span>
                          {contract.isAutoRenewal && (
                            <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-700 border-blue-200">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Auto-Renew
                            </Badge>
                          )}
                        </div>
                        <div className={`font-semibold ${
                          contract.daysUntilExpiry < 0 ? 'text-red-600' :
                          contract.daysUntilExpiry <= 10 ? 'text-orange-600' :
                          contract.daysUntilExpiry <= 30 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {contract.daysUntilExpiry < 0 
                            ? `⚠️ Expired ${Math.abs(contract.daysUntilExpiry)} days ago`
                            : contract.daysUntilExpiry === 0 
                              ? '🚨 Expires TODAY!'
                              : `📅 ${contract.daysUntilExpiry} days until expiry`
                          }
                        </div>
                      </div>
                      
                      {/* Expiry Date Display */}
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">Expiry Date:</span>
                        <span className="ml-2 font-medium">
                          {contract.expiryDate.toLocaleDateString('en-IN', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </span>
                        {contract.signedOn && (
                          <>
                            <span className="text-muted-foreground ml-4">Signed On:</span>
                            <span className="ml-2 font-medium">
                              {new Date(contract.signedOn).toLocaleDateString('en-IN', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar for Expiry */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Contract Timeline</span>
                          <span>{contract.daysUntilExpiry > 0 ? `${contract.daysUntilExpiry} days remaining` : 'Expired'}</span>
                        </div>
                        <Progress 
                          value={Math.max(0, Math.min(100, (contract.daysUntilExpiry / 365) * 100))} 
                          className={`h-2 ${
                            contract.daysUntilExpiry < 0 ? '[&>div]:bg-red-500' :
                            contract.daysUntilExpiry <= 10 ? '[&>div]:bg-orange-500' :
                            contract.daysUntilExpiry <= 30 ? '[&>div]:bg-yellow-500' :
                            '[&>div]:bg-green-500'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 lg:flex-col">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleViewActionPlan(contract)}
                        className="flex-1 lg:flex-none"
                      >
                        <ClipboardList className="h-4 w-4 mr-1" />
                        Action Plan
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => handleInitiateRenewal(contract)}
                        className={`flex-1 lg:flex-none ${
                          contract.daysUntilExpiry <= 10 
                            ? 'bg-red-600 hover:bg-red-700' 
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        {contract.daysUntilExpiry <= 10 ? 'Renew Now' : 'Initiate Renewal'}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewContract(contract)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Plan Modal */}
      <Dialog open={actionPlanModalOpen} onOpenChange={setActionPlanModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              Contract Renewal Action Plan
            </DialogTitle>
            <DialogDescription>
              Recommended actions for {selectedContract?.clientName}
            </DialogDescription>
          </DialogHeader>

          {selectedContract && (
            <div className="space-y-4">
              {/* Contract Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Client:</span>
                    <span className="ml-2 font-medium">{selectedContract.clientName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Value:</span>
                    <span className="ml-2 font-medium">{selectedContract.value}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contract Duration:</span>
                    <span className="ml-2 font-medium">{selectedContract.contractDurationMonths} months</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Auto-Renewal:</span>
                    <Badge className={`ml-2 ${selectedContract.isAutoRenewal ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                      {selectedContract.isAutoRenewal ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expiry Date:</span>
                    <span className="ml-2 font-medium">
                      {selectedContract.expiryDate.toLocaleDateString('en-IN', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Days Until Expiry:</span>
                    <span className={`ml-2 font-bold ${
                      selectedContract.daysUntilExpiry < 0 ? 'text-red-600' :
                      selectedContract.daysUntilExpiry <= 10 ? 'text-orange-600' :
                      'text-green-600'
                    }`}>
                      {selectedContract.daysUntilExpiry < 0 
                        ? `Expired ${Math.abs(selectedContract.daysUntilExpiry)} days ago`
                        : `${selectedContract.daysUntilExpiry} days`
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority:</span>
                    <Badge className={`ml-2 ${getPriorityColor(selectedContract.priority)}`}>
                      {selectedContract.priority.toUpperCase()}
                    </Badge>
                  </div>
                  {selectedContract.signedOn && (
                    <div>
                      <span className="text-muted-foreground">Signed On:</span>
                      <span className="ml-2 font-medium">
                        {new Date(selectedContract.signedOn).toLocaleDateString('en-IN', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-Renewal Notice */}
              {selectedContract.isAutoRenewal && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-300">Auto-Renewal Enabled</p>
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        This contract will automatically renew unless terminated with proper notice.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Plan */}
              <div>
                <Label className="text-base font-semibold">Recommended Actions</Label>
                <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200">
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {selectedContract.actionPlan}
                  </pre>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline">
                  <Phone className="h-4 w-4 mr-1" />
                  Call Client
                </Button>
                <Button size="sm" variant="outline">
                  <Mail className="h-4 w-4 mr-1" />
                  Send Email
                </Button>
                <Button size="sm" variant="outline">
                  <Calendar className="h-4 w-4 mr-1" />
                  Schedule Meeting
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionPlanModalOpen(false)}>
              Close
            </Button>
            <Button 
              onClick={() => {
                if (selectedContract) {
                  handleInitiateRenewal(selectedContract);
                  setActionPlanModalOpen(false);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Start Renewal Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
