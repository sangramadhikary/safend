'use client';

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  Check,
  X,
  QrCode,
  Link,
  Settings,
  RefreshCw,
  ArrowRight,
  CheckCircle
} from "lucide-react";

type PaymentGateway = {
  id: string;
  name: string;
  logo: string;
  status: "connected" | "not_connected";
  description: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  icon: React.ReactNode;
  available: boolean;
};

export function PaymentGateways() {
  const [activeGateway, setActiveGateway] = useState<string>("razorpay");
  const [isConfiguring, setIsConfiguring] = useState<boolean>(false);
  const [configGateway, setConfigGateway] = useState<PaymentGateway | null>(null);
  const { toast } = useToast();
  
  // Mock data for payment gateways
  const gateways: PaymentGateway[] = [
    {
      id: "razorpay",
      name: "Razorpay",
      logo: "/placeholder.svg", // Placeholder, would be replaced with actual logo
      status: "not_connected",
      description: "Fast, affordable payments solution that helps businesses accept and disburse payments"
    },
    {
      id: "cashfree",
      name: "Cashfree",
      logo: "/placeholder.svg",
      status: "not_connected",
      description: "Integrated payment solutions for Indian businesses with instant settlements"
    },
    {
      id: "axis_bank",
      name: "Axis Bank Corporate",
      logo: "/placeholder.svg",
      status: "connected",
      description: "Corporate banking solutions with direct bank transfers and payment reconciliation"
    },
    {
      id: "icici_bank",
      name: "ICICI Bank Corporate",
      logo: "/placeholder.svg",
      status: "not_connected",
      description: "Corporate banking solutions for businesses with automated payment workflows"
    }
  ];
  
  // Mock payment methods for each gateway
  const paymentMethods: Record<string, PaymentMethod[]> = {
    razorpay: [
      { id: "upi", name: "UPI Payments", icon: <QrCode className="h-4 w-4" />, available: true },
      { id: "link", name: "Payment Links", icon: <Link className="h-4 w-4" />, available: true },
      { id: "qr", name: "QR Codes", icon: <QrCode className="h-4 w-4" />, available: true },
      { id: "netbanking", name: "Net Banking", icon: <CreditCard className="h-4 w-4" />, available: true }
    ],
    cashfree: [
      { id: "upi", name: "UPI Payments", icon: <QrCode className="h-4 w-4" />, available: true },
      { id: "link", name: "Payment Links", icon: <Link className="h-4 w-4" />, available: true },
      { id: "qr", name: "QR Codes", icon: <QrCode className="h-4 w-4" />, available: true },
      { id: "netbanking", name: "Net Banking", icon: <CreditCard className="h-4 w-4" />, available: true }
    ],
    axis_bank: [
      { id: "direct_transfer", name: "Direct Transfer", icon: <ArrowRight className="h-4 w-4" />, available: true },
      { id: "batch_payments", name: "Batch Payments", icon: <CreditCard className="h-4 w-4" />, available: true },
      { id: "api_banking", name: "API Banking", icon: <Settings className="h-4 w-4" />, available: true }
    ],
    icici_bank: [
      { id: "direct_transfer", name: "Direct Transfer", icon: <ArrowRight className="h-4 w-4" />, available: true },
      { id: "batch_payments", name: "Batch Payments", icon: <CreditCard className="h-4 w-4" />, available: true },
      { id: "api_banking", name: "API Banking", icon: <Settings className="h-4 w-4" />, available: true }
    ]
  };
  
  const handleConnectGateway = (gateway: PaymentGateway) => {
    setConfigGateway(gateway);
    setIsConfiguring(true);
  };
  
  const handleSaveConfig = () => {
    toast({
      title: "Gateway Connected",
      description: `${configGateway?.name} has been successfully connected.`,
    });
    setIsConfiguring(false);
    setConfigGateway(null);
  };
  
  const handleGeneratePaymentLink = () => {
    toast({
      title: "Payment Link Generated",
      description: "Payment link has been created and copied to clipboard.",
    });
  };
  
  const handleGenerateQRCode = () => {
    toast({
      title: "QR Code Generated",
      description: "QR code has been generated and ready to download.",
    });
  };
  
  const handleBatchPayment = () => {
    toast({
      title: "Batch Payment Initiated",
      description: "Batch payment for vendor invoices has been initiated.",
    });
  };
  
  const handleSalaryPayment = () => {
    toast({
      title: "Salary Payment Prepared",
      description: "Salary payment batch is ready for approval.",
    });
  };
  
  const activeGatewayData = gateways.find(g => g.id === activeGateway);
  
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-medium">Available Payment Gateways</h3>
        <p className="text-sm text-muted-foreground">
          Connect payment gateways to process payments, generate payment links, and manage transactions
        </p>
      </div>
      
      <Tabs value={activeGateway} onValueChange={setActiveGateway} className="w-full">
        <TabsList className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
          {gateways.map(gateway => (
            <TabsTrigger key={gateway.id} value={gateway.id} className="flex flex-col items-center gap-1 h-auto py-3 px-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-full mb-1 flex items-center justify-center">
                <CreditCard className="h-4 w-4" />
              </div>
              <span>{gateway.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                gateway.status === "connected" 
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
                  : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {gateway.status === "connected" ? "Connected" : "Not Connected"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        
        {gateways.map(gateway => (
          <TabsContent key={gateway.id} value={gateway.id} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{gateway.name}</CardTitle>
                    <CardDescription>
                      {gateway.description}
                    </CardDescription>
                  </div>
                  <Button 
                    variant={gateway.status === "connected" ? "outline-solid" : "destructive"}
                    onClick={() => handleConnectGateway(gateway)}
                  >
                    {gateway.status === "connected" ? "Update Configuration" : "Connect"}
                  </Button>
                </div>
                {gateway.status === "connected" && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span>Successfully connected and ready to use</span>
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="space-y-6">
                {gateway.status === "connected" ? (
                  <>
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">Available Payment Methods</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {paymentMethods[gateway.id].map(method => (
                          <Card key={method.id} className="border-dashed">
                            <CardContent className="p-4 flex flex-col items-center text-center">
                              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-2">
                                {method.icon}
                              </div>
                              <h5 className="font-medium text-sm mb-1">{method.name}</h5>
                              <p className="text-xs text-muted-foreground mb-3">
                                Use for {method.id === "upi" || method.id === "qr" ? "receivables" : "payables"}
                              </p>
                              {(method.id === "link" || method.id === "qr") && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2 w-full" 
                                  onClick={method.id === "link" ? handleGeneratePaymentLink : handleGenerateQRCode}
                                >
                                  Generate {method.id === "link" ? "Link" : "QR"}
                                </Button>
                              )}
                              {(method.id === "batch_payments") && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2 w-full" 
                                  onClick={handleBatchPayment}
                                >
                                  Process Batch
                                </Button>
                              )}
                              {(method.id === "direct_transfer") && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2 w-full" 
                                  onClick={handleSalaryPayment}
                                >
                                  Salary Payment
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                    
                    <div className="border-t pt-6">
                      <h4 className="text-sm font-medium mb-4">Integration Settings</h4>
                      <div className="grid gap-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Auto Reconciliation</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically match payments with invoices and payables
                            </p>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Payment Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                              Send email notifications for successful payments
                            </p>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Payment Reminders</Label>
                            <p className="text-sm text-muted-foreground">
                              Send automatic reminders for overdue receivables
                            </p>
                          </div>
                          <Switch defaultChecked={false} />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                      <CreditCard className="h-6 w-6 text-gray-500" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Not Connected</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                      Connect {gateway.name} to start accepting payments, generating payment links, and processing transactions.
                    </p>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleConnectGateway(gateway)}
                    >
                      Connect {gateway.name}
                    </Button>
                  </div>
                )}
              </CardContent>
              
              {gateway.status === "connected" && (
                <CardFooter className="flex justify-between border-t pt-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Last synced: Today at 14:35</p>
                  </div>
                  <Button variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Sync Transactions
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      
      {/* Gateway Configuration Dialog */}
      <Dialog open={isConfiguring} onOpenChange={setIsConfiguring}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configure {configGateway?.name}</DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect to {configGateway?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input id="api-key" placeholder="Enter API key" />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="api-secret">API Secret</Label>
              <Input id="api-secret" type="password" placeholder="Enter API secret" />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="webhook-url">Webhook URL (optional)</Label>
              <Input id="webhook-url" placeholder="https://your-domain.com/webhook" />
            </div>
            
            <div className="flex items-center space-x-2 mt-2">
              <Switch id="test-mode" />
              <Label htmlFor="test-mode">Enable Test Mode</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfiguring(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} variant="destructive">
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
