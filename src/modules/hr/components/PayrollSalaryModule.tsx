'use client';
import { useState } from "react";
import { ComponentWithFilterProps } from "./index";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Briefcase, IndianRupee, FileText, AlertCircle, Clock
} from "lucide-react";

import { PostWiseSalaryStep } from "./payroll-steps/PostWiseSalaryStep";
import { SalarySlipsStep } from "./payroll-steps/SalarySlipsStep";
import { ProcessPayrollStep } from "./payroll-steps/ProcessPayrollStep";
import { HeldSalariesStep } from "./payroll-steps/HeldSalariesStep";
import { PaymentHistoryStep } from "./payroll-steps/PaymentHistoryStep";

const PAYROLL_TABS = [
  { id: "process", label: "Process Payroll", icon: IndianRupee },
  { id: "held", label: "Held Salaries", icon: AlertCircle },
  { id: "history", label: "Payment History", icon: Clock },
  { id: "slips", label: "Salary Slips", icon: FileText },
  { id: "postwise", label: "Post-wise Salary", icon: Briefcase },
] as const;

type TabId = typeof PAYROLL_TABS[number]["id"];

export function PayrollSalaryModule({ filter }: ComponentWithFilterProps) {
  const [activeTab, setActiveTab] = useState<TabId>("process");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Payroll & Salary</h2>
        <p className="text-muted-foreground mt-1">
          Manage salary slips, process payments, and define post-wise rates
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {PAYROLL_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={`flex items-center gap-2 transition-all duration-200 ${
                activeTab === tab.id ? "bg-safend-red text-white" : ""
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden md:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="process" className="mt-4">
          <ProcessPayrollStep filter={filter} />
        </TabsContent>

        <TabsContent value="held" className="mt-4">
          <HeldSalariesStep />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <PaymentHistoryStep />
        </TabsContent>

        <TabsContent value="slips" className="mt-4">
          <SalarySlipsStep />
        </TabsContent>

        <TabsContent value="postwise" className="mt-4">
          <PostWiseSalaryStep />
        </TabsContent>
      </Tabs>
    </div>
  );
}
