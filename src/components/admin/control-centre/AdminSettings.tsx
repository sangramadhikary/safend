'use client';

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Bell, Settings, Save } from "lucide-react";

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState("security");
  
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="security" className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="security" className="space-y-6 mt-6">
          <Card className="control-centre-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Security Settings</CardTitle>
              <CardDescription>
                Configure authentication and IP restrictions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Authentication</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Enforce MFA</Label>
                      <p className="text-sm text-muted-foreground">Require multi-factor authentication for all users</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Password Complexity</Label>
                      <p className="text-sm text-muted-foreground">Require strong passwords with special characters</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">Minutes of inactivity before automatic logout</p>
                    </div>
                    <Input type="number" defaultValue={30} className="w-24" />
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-medium">Login Limits</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Login Attempt Limit</Label>
                      <p className="text-sm text-muted-foreground">Failed attempts before temporary lockout</p>
                    </div>
                    <Input type="number" defaultValue={5} className="w-24" />
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-medium">IP Allow List</h3>
                <div className="flex gap-2 flex-wrap">
                  <Badge className="bg-black text-white p-2">
                    192.168.1.0/24
                    <button className="ml-2">×</button>
                  </Badge>
                  <Badge className="bg-black text-white p-2">
                    10.0.0.0/8
                    <button className="ml-2">×</button>
                  </Badge>
                  <div className="flex gap-2">
                    <Input placeholder="Add IP or CIDR" className="w-40" />
                    <Button variant="outline">Add</Button>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t p-4">
              <Button variant="default" className="gap-2">
                <Save className="h-4 w-4" />
                Save Security Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="mt-6">
          <Card className="control-centre-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Notification Settings</CardTitle>
              <CardDescription>
                Configure email, SMS, and WebSocket notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Email Notifications</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">User Registration</Label>
                      <p className="text-sm text-muted-foreground">Send welcome email to new users</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Password Reset</Label>
                      <p className="text-sm text-muted-foreground">Send password reset instructions</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Role Assignment</Label>
                      <p className="text-sm text-muted-foreground">Notify when users are assigned new roles</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-medium">SMS Notifications</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">MFA Verification</Label>
                      <p className="text-sm text-muted-foreground">Send one-time password via SMS</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Security Alerts</Label>
                      <p className="text-sm text-muted-foreground">Notify about suspicious login attempts</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-medium">WebSocket Notifications</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Real-time Updates</Label>
                      <p className="text-sm text-muted-foreground">Push notifications for system events</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">User Activity</Label>
                      <p className="text-sm text-muted-foreground">Broadcast user activity to admins</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t p-4">
              <Button variant="default" className="gap-2">
                <Save className="h-4 w-4" />
                Save Notification Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="system" className="mt-6">
          <Card className="control-centre-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold">System Settings</CardTitle>
              <CardDescription>
                Configure branding, maintenance, and system behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Branding</h3>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-base">Company Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-black flex items-center justify-center text-white">LOGO</div>
                      <Button variant="outline">Upload New Logo</Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-base">Theme Colors</Label>
                    <div className="flex gap-4">
                      <div>
                        <div className="w-10 h-10 bg-black rounded-full mb-1"></div>
                        <p className="text-xs text-center">Primary</p>
                      </div>
                      <div>
                        <div className="w-10 h-10 bg-red-600 rounded-full mb-1"></div>
                        <p className="text-xs text-center">Accent</p>
                      </div>
                      <div>
                        <div className="w-10 h-10 bg-white border rounded-full mb-1"></div>
                        <p className="text-xs text-center">Background</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-medium">Maintenance</h3>
                <div className="grid gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base">Maintenance Mode</Label>
                      <p className="text-sm text-muted-foreground">Temporarily disable access for maintenance</p>
                    </div>
                    <Switch />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-base">Backup Schedule</Label>
                    <div className="flex gap-2">
                      <select className="w-full px-3 py-2 border rounded-md">
                        <option>Daily at 2:00 AM</option>
                        <option>Weekly on Sunday</option>
                        <option>Monthly on 1st</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t p-4">
              <Button variant="default" className="gap-2">
                <Save className="h-4 w-4" />
                Save System Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
