'use client';
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Key, 
  Copy, 
  Plus, 
  Trash2, 
  ArrowRight, 
  ChevronDown, 
  Code,
  Check,
  Clock
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ApiTokenForm } from "./forms/ApiTokenForm";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ApiToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  permissions: string[];
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  status: "active" | "inactive";
  eventTypes: string[];
}

export function ApiTokensWebhooks() {
  const [activeTab, setActiveTab] = useState("api-tokens");
  const [tokenType, setTokenType] = useState("personal");
  const { toast } = useToast();
  
  // API Token state
  const [tokens, setTokens] = useState<ApiToken[]>([
    {
      id: "t1",
      name: "Dashboard API Token",
      token: "safend_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      createdAt: "May 1, 2025",
      expiresAt: "June 1, 2025",
      permissions: ["Read", "Write"]
    },
    {
      id: "t2",
      name: "Mobile App Token",
      token: "safend_9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
      createdAt: "April 15, 2025",
      expiresAt: "May 15, 2025",
      permissions: ["Read"]
    }
  ]);
  
  // Webhook state
  const [webhooks, setWebhooks] = useState<Webhook[]>([
    {
      id: "w1",
      name: "User Activity Webhook",
      url: "https://example.com/webhooks/safend-users",
      status: "active",
      eventTypes: ["User Events"]
    },
    {
      id: "w2",
      name: "Branch Update Webhook",
      url: "https://example.com/webhooks/safend-branches",
      status: "active",
      eventTypes: ["Branch Events"]
    }
  ]);
  
  // Form state
  const [isTokenFormOpen, setIsTokenFormOpen] = useState(false);
  const [tokenToCopy, setTokenToCopy] = useState<string | null>(null);
  const [tokenToDelete, setTokenToDelete] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<ApiToken | null>(null);
  
  const handleAddToken = () => {
    setIsTokenFormOpen(true);
  };
  
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setTokenToCopy(token);
    
    toast({
      title: "Token Copied",
      description: "API token has been copied to clipboard",
    });
    
    setTimeout(() => {
      setTokenToCopy(null);
    }, 2000);
  };
  
  const handleDeleteToken = (tokenId: string) => {
    setTokenToDelete(tokenId);
  };
  
  const confirmDeleteToken = () => {
    if (!tokenToDelete) return;
    
    const updatedTokens = tokens.filter(t => t.id !== tokenToDelete);
    setTokens(updatedTokens);
    
    toast({
      title: "Token Deleted",
      description: "API token has been revoked and deleted",
    });
    
    setTokenToDelete(null);
  };
  
  const handleSaveToken = (tokenData: any) => {
    // Generate token
    const characters = 'abcdef0123456789';
    let token = 'safend_';
    for (let i = 0; i < 64; i++) {
      token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + tokenData.expiry);
    
    // Create permissions array
    const permissions = [];
    if (tokenData.permissions.read) permissions.push('Read');
    if (tokenData.permissions.write) permissions.push('Write');
    if (tokenData.permissions.delete) permissions.push('Delete');
    
    const newToken: ApiToken = {
      id: `t${tokens.length + 1}`,
      name: tokenData.name,
      token,
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      expiresAt: expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      permissions
    };
    
    setTokens([...tokens, newToken]);
    setNewToken(newToken);
    
    toast({
      title: "Token Generated",
      description: "New API token has been created successfully",
    });
    
    setIsTokenFormOpen(false);
  };
  
  const handleToggleWebhook = (webhookId: string) => {
    const updatedWebhooks = webhooks.map(webhook => {
      if (webhook.id === webhookId) {
        // Explicitly cast the new status to the union type "active" | "inactive"
        const newStatus: "active" | "inactive" = webhook.status === "active" ? "inactive" : "active";
        return {
          ...webhook,
          status: newStatus
        };
      }
      return webhook;
    });
    
    setWebhooks(updatedWebhooks);
    
    toast({
      title: "Webhook Updated",
      description: "Webhook status has been updated",
    });
  };
  
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="api-tokens" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Tokens
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="api-tokens" className="space-y-6 mt-6">
          <Card className="control-centre-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-xl font-bold">API Tokens</CardTitle>
                <CardDescription>
                  Generate and manage API access tokens
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      {tokenType === "personal" ? "Personal Token" : "Service Token"}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setTokenType("personal")}>
                      Personal Token
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTokenType("service")}>
                      Service Token
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="destructive" className="gap-2" onClick={handleAddToken}>
                  <Plus className="h-4 w-4" />
                  New Token
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {newToken && (
                <div className="mb-6 p-4 border border-green-500 bg-green-50 dark:bg-green-900/20 rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600 text-white">New Token</Badge>
                      <h3 className="font-medium">{newToken.name}</h3>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => setNewToken(null)}
                    >
                      <Check className="h-4 w-4" />
                      Done
                    </Button>
                  </div>
                  
                  <p className="text-sm mb-2">
                    Please copy your new API token. For security reasons, it won't be shown again:
                  </p>
                  
                  <div className="relative">
                    <Input
                      readOnly
                      value={newToken.token}
                      className="font-mono text-xs pr-12"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-7"
                      onClick={() => handleCopyToken(newToken.token)}
                    >
                      {tokenToCopy === newToken.token ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {tokens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No API tokens found</p>
                    <Button 
                      variant="outline" 
                      className="mt-4 gap-2"
                      onClick={handleAddToken}
                    >
                      <Plus className="h-4 w-4" />
                      Generate your first token
                    </Button>
                  </div>
                ) : (
                  tokens.map(token => (
                    <div key={token.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{token.name}</h3>
                          <div className="flex gap-2 items-center text-sm text-muted-foreground">
                            <span>Created on {token.createdAt}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Expires: {token.expiresAt}
                            </span>
                          </div>
                          <div className="flex gap-2 mt-2">
                            {token.permissions.map(permission => (
                              <Badge key={permission} className="bg-black text-white">
                                {permission}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => handleCopyToken(token.token)}
                          >
                            {tokenToCopy === token.token ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 text-red-600"
                            onClick={() => handleDeleteToken(token.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Input
                          readOnly
                          value={`${token.token.substring(0, 12)}...${token.token.substring(token.token.length - 12)}`}
                          className="font-mono text-xs bg-gray-50 dark:bg-gray-900"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-lg font-medium mb-4">Token Settings</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Token Expiration</Label>
                      <p className="text-sm text-muted-foreground">Automatically expire tokens after 30 days</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Token Scope Restriction</Label>
                      <p className="text-sm text-muted-foreground">Limit token access based on IP address</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="webhooks" className="mt-6">
          <Card className="control-centre-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-xl font-bold">Webhooks</CardTitle>
                <CardDescription>
                  Configure outgoing webhook notifications with HMAC signing
                </CardDescription>
              </div>
              <Button variant="destructive" className="gap-2">
                <Plus className="h-4 w-4" />
                New Webhook
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {webhooks.map(webhook => (
                <div key={webhook.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{webhook.name}</h3>
                      <p className="text-sm text-muted-foreground">{webhook.url}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge className={webhook.status === "active" ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
                          {webhook.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                        {webhook.eventTypes.map(type => (
                          <Badge key={type} className="bg-black text-white">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Edit</Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={webhook.status === "active" ? "text-red-600" : "text-green-600"}
                        onClick={() => handleToggleWebhook(webhook.id)}
                      >
                        {webhook.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="pt-6 border-t">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Webhook Payload Example
                </h3>
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md">
                  <pre className="text-xs">{`{
  "event": "user.created",
  "timestamp": "2025-05-06T12:34:56Z",
  "data": {
    "userId": "u123",
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "branch": "b1"
  },
  "signature": "sha256=..."
}`}</pre>
                </div>
              </div>
              
              <div className="pt-6 border-t">
                <h3 className="text-lg font-medium mb-4">Webhook Settings</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">HMAC Signing</Label>
                      <p className="text-sm text-muted-foreground">Add SHA-256 HMAC signature to all webhooks</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Retry Failed Webhooks</Label>
                      <p className="text-sm text-muted-foreground">Attempt to redeliver failed webhooks up to 3 times</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* API Token Form */}
      <ApiTokenForm
        isOpen={isTokenFormOpen}
        onClose={() => setIsTokenFormOpen(false)}
        onSave={handleSaveToken}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!tokenToDelete} onOpenChange={() => setTokenToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently revoke this API token.
              Any applications using this token will no longer have access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteToken}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Revoke Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
