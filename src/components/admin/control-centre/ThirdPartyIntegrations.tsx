'use client';

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CreditCard, Truck } from "lucide-react";
import { PaymentGateways } from "./integrations/PaymentGateways";
import { ShippingServices } from "./integrations/ShippingServices";

export function ThirdPartyIntegrations() {
  const [activeTab, setActiveTab] = useState("payment-gateways");
  
  return (
    <div className="w-full space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl font-bold">3rd Party Integrations</CardTitle>
          <CardDescription>
            Configure payment gateways and shipping services to enhance your financial and operational workflows
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-6 border-b border-gray-200 dark:border-gray-800">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="payment-gateways" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Gateways
                </TabsTrigger>
                <TabsTrigger value="shipping-services" className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Shipping Services
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="p-6">
              <TabsContent value="payment-gateways" className="mt-0">
                <PaymentGateways />
              </TabsContent>
              
              <TabsContent value="shipping-services" className="mt-0">
                <ShippingServices />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
