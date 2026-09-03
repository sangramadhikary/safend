'use client';

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { Save, RefreshCw, Lock, Mail, CloudUpload, Bell, Clock, Globe } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { UnifiedLoader } from "@/components/ui/unified-loader";

const securityFormSchema = z.object({
  passwordPolicy: z.object({
    minLength: z.number().min(8).max(30),
    requireUppercase: z.boolean(),
    requireLowercase: z.boolean(),
    requireNumbers: z.boolean(),
    requireSpecialChars: z.boolean(),
    expiryDays: z.number().min(0).max(365),
  }),
  loginAttempts: z.number().min(1).max(10),
  sessionTimeout: z.number().min(5).max(240),
  twoFactorAuth: z.boolean(),
  ipRestriction: z.boolean(),
});

const notificationFormSchema = z.object({
  emailNotifications: z.boolean(),
  loginAlerts: z.boolean(),
  systemUpdates: z.boolean(),
  failedLoginAttempts: z.boolean(),
  userCreationNotification: z.boolean(),
  roleChanges: z.boolean(),
  emailFooter: z.string().min(0).max(500),
});

const systemFormSchema = z.object({
  companyName: z.string().min(2).max(100),
  systemLogo: z.string().optional(),
  timeZone: z.string(),
  defaultLanguage: z.string(),
  dateFormat: z.string(),
  timeFormat: z.string(),
  fiscalYearStart: z.string(),
  currency: z.string(),
});

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState("security");
  const [isLoading, setIsLoading] = useState(false);

  const securityForm = useForm<z.infer<typeof securityFormSchema>>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: {
      passwordPolicy: {
        minLength: 10,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        expiryDays: 90,
      },
      loginAttempts: 5,
      sessionTimeout: 30,
      twoFactorAuth: true,
      ipRestriction: false,
    },
  });

  const notificationForm = useForm<z.infer<typeof notificationFormSchema>>({
    resolver: zodResolver(notificationFormSchema),
    defaultValues: {
      emailNotifications: true,
      loginAlerts: true,
      systemUpdates: true,
      failedLoginAttempts: true,
      userCreationNotification: true,
      roleChanges: true,
      emailFooter: "This email was sent from Safend HRM. Please do not reply to this email.",
    },
  });

  const systemForm = useForm<z.infer<typeof systemFormSchema>>({
    resolver: zodResolver(systemFormSchema),
    defaultValues: {
      companyName: "Safend HRM",
      systemLogo: "",
      timeZone: "Asia/Kolkata",
      defaultLanguage: "en-IN",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12",
      fiscalYearStart: "April",
      currency: "INR",
    },
  });

  const onSecuritySubmit = (data: z.infer<typeof securityFormSchema>) => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      toast.success("Security settings updated successfully!");
      setIsLoading(false);
    }, 1000);
  };

  const onNotificationSubmit = (data: z.infer<typeof notificationFormSchema>) => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      toast.success("Notification settings updated successfully!");
      setIsLoading(false);
    }, 1000);
  };

  const onSystemSubmit = (data: z.infer<typeof systemFormSchema>) => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      toast.success("System settings updated successfully!");
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">System Settings</h2>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid grid-cols-3 w-full mb-6">
          <TabsTrigger value="security" className="flex gap-2 items-center">
            <Lock className="h-4 w-4" />
            <span>Security</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex gap-2 items-center">
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="flex gap-2 items-center">
            <Globe className="h-4 w-4" />
            <span>System</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure system security settings, password policies and login requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...securityForm}>
                <form onSubmit={securityForm.handleSubmit(onSecuritySubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Password Policy</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={securityForm.control}
                        name="passwordPolicy.minLength"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Minimum Password Length</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Minimum number of characters required (8-30)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={securityForm.control}
                        name="passwordPolicy.expiryDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password Expiry (Days)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Number of days before password expires (0 for never)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={securityForm.control}
                        name="passwordPolicy.requireUppercase"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Require Uppercase</FormLabel>
                              <FormDescription>
                                Require at least one uppercase letter
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={securityForm.control}
                        name="passwordPolicy.requireLowercase"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Require Lowercase</FormLabel>
                              <FormDescription>
                                Require at least one lowercase letter
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={securityForm.control}
                        name="passwordPolicy.requireNumbers"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Require Numbers</FormLabel>
                              <FormDescription>
                                Require at least one number
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={securityForm.control}
                        name="passwordPolicy.requireSpecialChars"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Require Special Characters</FormLabel>
                              <FormDescription>
                                Require at least one special character
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="pt-4 border-t">
                      <h3 className="text-md font-medium mb-4">Login Security</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={securityForm.control}
                          name="loginAttempts"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Failed Login Attempts</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Number of attempts before account is locked (1-10)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={securityForm.control}
                          name="sessionTimeout"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Session Timeout (Minutes)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Inactive time before session expires (5-240)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <FormField
                          control={securityForm.control}
                          name="twoFactorAuth"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                              <div className="space-y-0.5">
                                <FormLabel>Two-Factor Authentication</FormLabel>
                                <FormDescription>
                                  Require 2FA for all admin users
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={securityForm.control}
                          name="ipRestriction"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                              <div className="space-y-0.5">
                                <FormLabel>IP Restriction</FormLabel>
                                <FormDescription>
                                  Restrict logins to specific IP addresses
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <UnifiedLoader variant="button" size="xs" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Security Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure system notifications and email alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...notificationForm}>
                <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Email Notifications</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={notificationForm.control}
                        name="emailNotifications"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Email Notifications</FormLabel>
                              <FormDescription>
                                Enable system email notifications
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={notificationForm.control}
                        name="loginAlerts"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Login Alerts</FormLabel>
                              <FormDescription>
                                Send email on successful login
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={notificationForm.control}
                        name="systemUpdates"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>System Updates</FormLabel>
                              <FormDescription>
                                Send email for system updates
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={notificationForm.control}
                        name="failedLoginAttempts"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Failed Login Attempts</FormLabel>
                              <FormDescription>
                                Send email on failed login attempts
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={notificationForm.control}
                        name="userCreationNotification"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>User Creation</FormLabel>
                              <FormDescription>
                                Send email when new users are created
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={notificationForm.control}
                        name="roleChanges"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                              <FormLabel>Role Changes</FormLabel>
                              <FormDescription>
                                Send email when user roles are modified
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="pt-4">
                      <FormField
                        control={notificationForm.control}
                        name="emailFooter"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Footer</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter standard email footer text"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Default text that appears at the bottom of all system emails
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <UnifiedLoader variant="button" size="xs" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Save Notification Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
              <CardDescription>
                Configure global system settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...systemForm}>
                <form onSubmit={systemForm.handleSubmit(onSystemSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Company Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={systemForm.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={systemForm.control}
                        name="systemLogo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>System Logo</FormLabel>
                            <FormControl>
                              <div className="flex gap-2 items-center">
                                <Input {...field} placeholder="Upload or enter logo URL" />
                                <Button type="button" variant="outline" size="icon">
                                  <CloudUpload className="h-4 w-4" />
                                </Button>
                              </div>
                            </FormControl>
                            <FormDescription>
                              Company logo displayed in the system (recommended size: 200x50px)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="pt-4 border-t">
                      <h3 className="text-md font-medium mb-4">Regional Settings</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={systemForm.control}
                          name="timeZone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Time Zone</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select time zone" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Asia/Kolkata">(GMT+5:30) India Standard Time</SelectItem>
                                  <SelectItem value="Asia/Dubai">(GMT+4:00) Dubai</SelectItem>
                                  <SelectItem value="Europe/London">(GMT+0:00) London</SelectItem>
                                  <SelectItem value="America/New_York">(GMT-5:00) New York</SelectItem>
                                  <SelectItem value="Australia/Sydney">(GMT+11:00) Sydney</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Default time zone for date/time display
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={systemForm.control}
                          name="defaultLanguage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Language</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select language" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="en-IN">English (India)</SelectItem>
                                  <SelectItem value="hi-IN">Hindi</SelectItem>
                                  <SelectItem value="ta-IN">Tamil</SelectItem>
                                  <SelectItem value="te-IN">Telugu</SelectItem>
                                  <SelectItem value="mr-IN">Marathi</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Default system language
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <FormField
                          control={systemForm.control}
                          name="dateFormat"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date Format</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select date format" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                                  <SelectItem value="DD-MMM-YYYY">DD-MMM-YYYY</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Format for displaying dates
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={systemForm.control}
                          name="timeFormat"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Time Format</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select time format" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="12">12 Hour (AM/PM)</SelectItem>
                                  <SelectItem value="24">24 Hour</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Format for displaying time
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <FormField
                          control={systemForm.control}
                          name="fiscalYearStart"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fiscal Year Start</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select month" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="January">January</SelectItem>
                                  <SelectItem value="April">April</SelectItem>
                                  <SelectItem value="July">July</SelectItem>
                                  <SelectItem value="October">October</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Beginning month of fiscal year
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={systemForm.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Currency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                                  <SelectItem value="USD">US Dollar ($)</SelectItem>
                                  <SelectItem value="EUR">Euro (€)</SelectItem>
                                  <SelectItem value="GBP">British Pound (£)</SelectItem>
                                  <SelectItem value="AED">UAE Dirham (AED)</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Default currency for financial data
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <UnifiedLoader variant="button" size="xs" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save System Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
