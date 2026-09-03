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
  Truck,
  Check,
  FileText,
  Package,
  Settings,
  RefreshCw,
  Send,
  CheckCircle
} from "lucide-react";

type ShippingService = {
  id: string;
  name: string;
  logo: string;
  status: "connected" | "not_connected";
  description: string;
};

type DocumentType = {
  id: string;
  name: string;
  icon: React.ReactNode;
  available: boolean;
};

export function ShippingServices() {
  const [activeService, setActiveService] = useState<string>("nimbuspost");
  const [isConfiguring, setIsConfiguring] = useState<boolean>(false);
  const [configService, setConfigService] = useState<ShippingService | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewType, setPreviewType] = useState<string>("");
  const { toast } = useToast();
  
  // Mock data for shipping services
  const services: ShippingService[] = [
    {
      id: "nimbuspost",
      name: "Nimbuspost",
      logo: "/placeholder.svg", // Placeholder, would be replaced with actual logo
      status: "connected",
      description: "Integrated shipping API for e-commerce businesses with automated tracking and notifications"
    },
    {
      id: "shiprocket",
      name: "Shiprocket",
      logo: "/placeholder.svg",
      status: "not_connected",
      description: "India's leading shipping solution with multi-carrier shipping and COD facilities"
    }
  ];
  
  // Mock document types for each service
  const documentTypes: Record<string, DocumentType[]> = {
    nimbuspost: [
      { id: "quotation", name: "Quotation", icon: <FileText className="h-4 w-4" />, available: true },
      { id: "invoice", name: "Invoice", icon: <FileText className="h-4 w-4" />, available: true },
      { id: "aging_notice", name: "Aging Notice", icon: <FileText className="h-4 w-4" />, available: true },
      { id: "payment_reminder", name: "Payment Reminder", icon: <Send className="h-4 w-4" />, available: true }
    ],
    shiprocket: [
      { id: "quotation", name: "Quotation", icon: <FileText className="h-4 w-4" />, available: true },
      { id: "invoice", name: "Invoice", icon: <FileText className="h-4 w-4" />, available: true },
      { id: "aging_notice", name: "Aging Notice", icon: <FileText className="h-4 w-4" />, available: true },
      { id: "payment_reminder", name: "Payment Reminder", icon: <Send className="h-4 w-4" />, available: true },
      { id: "legal_notice", name: "Legal Notice", icon: <FileText className="h-4 w-4" />, available: true }
    ]
  };
  
  const handleConnectService = (service: ShippingService) => {
    setConfigService(service);
    setIsConfiguring(true);
  };
  
  const handleSaveConfig = () => {
    toast({
      title: "Service Connected",
      description: `${configService?.name} has been successfully connected.`,
    });
    setIsConfiguring(false);
    setConfigService(null);
  };
  
  const handlePreviewDocument = (documentType: string) => {
    setPreviewType(documentType);
    setIsPreviewOpen(true);
  };
  
  const handleSendDocument = (documentType: string) => {
    toast({
      title: "Document Sent",
      description: `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} has been sent successfully.`,
    });
  };
  
  const activeServiceData = services.find(s => s.id === activeService);
  
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-medium">Available Shipping Services</h3>
        <p className="text-sm text-muted-foreground">
          Connect shipping services to send documents, track deliveries, and manage shipping operations
        </p>
      </div>
      
      <Tabs value={activeService} onValueChange={setActiveService} className="w-full">
        <TabsList className="grid grid-cols-2 gap-2 mb-6">
          {services.map(service => (
            <TabsTrigger key={service.id} value={service.id} className="flex flex-col items-center gap-1 h-auto py-3 px-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-full mb-1 flex items-center justify-center">
                <Truck className="h-4 w-4" />
              </div>
              <span>{service.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                service.status === "connected" 
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
                  : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {service.status === "connected" ? "Connected" : "Not Connected"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        
        {services.map(service => (
          <TabsContent key={service.id} value={service.id} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{service.name}</CardTitle>
                    <CardDescription>
                      {service.description}
                    </CardDescription>
                  </div>
                  <Button 
                    variant={service.status === "connected" ? "outline-solid" : "destructive"}
                    onClick={() => handleConnectService(service)}
                  >
                    {service.status === "connected" ? "Update Configuration" : "Connect"}
                  </Button>
                </div>
                {service.status === "connected" && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span>Successfully connected and ready to use</span>
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="space-y-6">
                {service.status === "connected" ? (
                  <>
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">Available Document Types</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {documentTypes[service.id].map(docType => (
                          <Card key={docType.id} className="border-dashed">
                            <CardContent className="p-4 flex flex-col items-center text-center">
                              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-2">
                                {docType.icon}
                              </div>
                              <h5 className="font-medium text-sm mb-1">{docType.name}</h5>
                              <p className="text-xs text-muted-foreground mb-3">
                                Send {docType.name.toLowerCase()} to customers or vendors
                              </p>
                              <div className="flex gap-2 mt-2 w-full">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="flex-1"
                                  onClick={() => handlePreviewDocument(docType.id)}
                                >
                                  Preview
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  className="flex-1"
                                  onClick={() => handleSendDocument(docType.name)}
                                >
                                  Send
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                    
                    <div className="border-t pt-6">
                      <h4 className="text-sm font-medium mb-4">Document Delivery Settings</h4>
                      <div className="grid gap-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Delivery Tracking</Label>
                            <p className="text-sm text-muted-foreground">
                              Track when documents are delivered and opened
                            </p>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Delivery Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                              Receive notifications when documents are delivered
                            </p>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Automated Follow-ups</Label>
                            <p className="text-sm text-muted-foreground">
                              Send automatic follow-ups if documents aren't opened
                            </p>
                          </div>
                          <Switch defaultChecked={false} />
                        </div>
                      </div>
                    </div>
                    
                    <div className="border-t pt-6">
                      <h4 className="text-sm font-medium mb-4">Integration with Accounts Module</h4>
                      <div className="grid gap-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Auto-send Invoices</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically send invoices when generated in Accounts
                            </p>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div>
                            <Label className="text-base">Auto-send Payment Reminders</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically send reminders for overdue invoices
                            </p>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                      <Truck className="h-6 w-6 text-gray-500" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Not Connected</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                      Connect {service.name} to start sending documents, tracking deliveries, and automating shipping operations.
                    </p>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleConnectService(service)}
                    >
                      Connect {service.name}
                    </Button>
                  </div>
                )}
              </CardContent>
              
              {service.status === "connected" && (
                <CardFooter className="flex justify-between border-t pt-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Last synced: Today at 15:20</p>
                  </div>
                  <Button variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Sync Status
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      
      {/* Service Configuration Dialog */}
      <Dialog open={isConfiguring} onOpenChange={setIsConfiguring}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configure {configService?.name}</DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect to {configService?.name}
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
      
      {/* Document Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {previewType.charAt(0).toUpperCase() + previewType.slice(1)} Preview
            </DialogTitle>
            <DialogDescription>
              Preview how your document will look when sent via {activeServiceData?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto border rounded-md p-4 my-4 bg-white">
            {/* This would be replaced with an actual document preview */}
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Sample {previewType.charAt(0).toUpperCase() + previewType.slice(1)}</h2>
              <p className="text-sm text-muted-foreground">Generated on May 6, 2025</p>
            </div>
            
            <div className="p-6">
              <p>This is a sample {previewType} document that would be sent via {activeServiceData?.name}.</p>
              <p className="mt-4">The actual document would contain all the relevant details formatted according to your company templates.</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Close Preview
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                handleSendDocument(previewType);
                setIsPreviewOpen(false);
              }}
            >
              Send Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
