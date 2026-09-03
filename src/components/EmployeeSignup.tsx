'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, UserCheck } from "lucide-react";

export default function EmployeeSignup() {
  return (
    <Card className="w-full max-w-sm hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
          <Shield className="w-6 h-6 text-green-600" />
        </div>
        <CardTitle className="text-lg">Employee Onboarding</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Join our security team and start your career
        </p>
        <Button className="w-full">
          <UserCheck className="w-4 h-4 mr-2" />
          Apply Now
        </Button>
      </CardContent>
    </Card>
  );
}
