'use client';

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Plus, Lock, Key, RefreshCw, Shield } from "lucide-react";

export function SecretsVault() {
  const [showSecrets, setShowSecrets] = useState(false);
  
  // Mock secrets data
  const secrets = [
    { id: 1, name: "AWS_ACCESS_KEY", value: "AKIA1234567890ABCDEF", type: "API Key" },
    { id: 2, name: "STRIPE_SECRET", value: "sk_test_dummy_mock_key_0000000000", type: "Payment" },
    { id: 3, name: "SENDGRID_API_KEY", value: "SG.abcdefghijklmnopqrstuvwxyz", type: "Communication" },
    { id: 4, name: "MAPS_API_KEY", value: "AIza1234567890abcdefghijklmnopqrstuvwxyz", type: "Maps" }
  ];
  
  return (
    <div className="space-y-6">
      <Card className="control-centre-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-600" />
              Secrets Vault
            </CardTitle>
            <CardDescription>
              Securely store and manage application secrets and API keys
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSecrets(!showSecrets)} className="gap-2">
              {showSecrets ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide Values
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Show Values
                </>
              )}
            </Button>
            <Button variant="destructive" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Secret
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {secrets.map(secret => (
              <div key={secret.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1 mb-3 md:mb-0">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-red-600" />
                    <Label className="text-base font-medium">{secret.name}</Label>
                    <Badge variant="outline">{secret.type}</Badge>
                  </div>
                  <div className="font-mono bg-gray-100 dark:bg-gray-900 rounded p-2 text-sm">
                    {showSecrets ? secret.value : "••••••••••••••••••••••••"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Copy</Button>
                  <Button variant="outline" size="sm">Edit</Button>
                  <Button variant="outline" size="sm" className="text-red-600">Delete</Button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-6 border-t">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-600" />
              Add New Secret
            </h3>
            <div className="grid gap-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Secret Name</Label>
                  <Input placeholder="e.g. API_KEY" />
                </div>
                <div className="space-y-2">
                  <Label>Secret Type</Label>
                  <select className="w-full h-10 px-3 border rounded-md">
                    <option>API Key</option>
                    <option>Database</option>
                    <option>Payment</option>
                    <option>Communication</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Secret Value</Label>
                <Input type="password" placeholder="Enter secret value" />
                <p className="text-xs text-muted-foreground">
                  Values are encrypted with AES-256 before being stored in the database
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input placeholder="Enter a description for this secret" />
              </div>
              
              <Button className="w-full md:w-auto">Create Secret</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="control-centre-card">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Vault Integration</CardTitle>
          <CardDescription>
            Connect to external secret management systems
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="bg-black p-3 rounded">
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-medium">Keycloak Vault Integration</h3>
                  <p className="text-sm text-muted-foreground">Use Keycloak's secure credential storage</p>
                </div>
              </div>
              <Badge className="bg-green-600 text-white">Connected</Badge>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="bg-gray-200 dark:bg-gray-800 p-3 rounded">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-medium">HashiCorp Vault</h3>
                  <p className="text-sm text-muted-foreground">Enterprise-grade secrets management</p>
                </div>
              </div>
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Connect
              </Button>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="bg-gray-200 dark:bg-gray-800 p-3 rounded">
                  <Key className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-medium">AWS Secrets Manager</h3>
                  <p className="text-sm text-muted-foreground">Cloud-based secrets management</p>
                </div>
              </div>
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Connect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
