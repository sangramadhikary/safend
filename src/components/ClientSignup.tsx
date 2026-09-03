'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, UserPlus } from "lucide-react";

export default function ClientSignup() {
  return (
    <Card className="w-full max-w-sm hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
          <Building className="w-6 h-6 text-blue-600" />
        </div>
        <CardTitle className="text-lg">Client Onboarding</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Register your organization for security services
        </p>
        <Button className="w-full">
          <UserPlus className="w-4 h-4 mr-2" />
          Get Started
        </Button>
      </CardContent>
    </Card>
  );
}
