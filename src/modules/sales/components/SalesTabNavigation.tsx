'use client';
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Filter, ChevronDown, FileSignature, Mail, UserPlus, Search } from "lucide-react";
import { IndianRupee } from "@/components/icons/IndianRupee";
import { motion } from "framer-motion";
import { salesTabs, filterOptions } from "../constants/salesTabs";

interface SalesTabNavigationProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  filterIsOpen: boolean;
  setFilterIsOpen: (open: boolean) => void;
  onShowAgreementForm: () => void;
  onShowAgingInvoiceForm: () => void;
  onShowLeadForm?: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export function SalesTabNavigation({
  activeTab,
  onTabChange,
  activeFilter,
  onFilterChange,
  filterIsOpen,
  setFilterIsOpen,
  onShowAgreementForm,
  onShowAgingInvoiceForm,
  onShowLeadForm,
  searchTerm,
  onSearchChange
}: SalesTabNavigationProps) {
  const getActionButton = () => {
    switch (activeTab) {
      case "crm":
        return (
          <Button className="bg-safend-red hover:bg-red-700" onClick={onShowLeadForm}>
            <UserPlus className="mr-2 h-4 w-4" />
            New Lead
          </Button>
        );
      case "contracts":
        return (
          <Button className="bg-safend-red hover:bg-red-700" onClick={onShowAgreementForm}>
            <FileSignature className="mr-2 h-4 w-4" />
            New Work Order
          </Button>
        );
      case "aging":
        return (
          <Button className="bg-safend-red hover:bg-red-700" onClick={onShowAgingInvoiceForm}>
            <IndianRupee className="mr-2 h-4 w-4" />
            Add Collection Task
          </Button>
        );
      default:
        return null;
    }
  };

  const currentFilters = filterOptions[activeTab as keyof typeof filterOptions];
  
  // Get search placeholder based on active tab
  const getSearchPlaceholder = () => {
    switch (activeTab) {
      case "quotations":
        return "Search by last 4 digits or client name...";
      case "crm":
        return "Search leads...";
      case "followups":
        return "Search follow-ups...";
      case "contracts":
        return "Search contracts...";
      case "aging":
        return "Search invoices...";
      default:
        return "Search...";
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      {/* Primary tab bar — hidden by CSS when ModuleHeaderBar is active */}
      <div data-module-primary-tabs="">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex md:grid md:grid-cols-7 gap-1 w-full md:w-auto bg-gray-100 dark:bg-gray-800 p-1 rounded-lg min-w-max">
            {salesTabs.map((tab) => (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="flex gap-2 items-center transition-all duration-200"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {/* Action bar + search — hidden on tabs that manage their own search/filter */}
      {activeTab !== "clients" && activeTab !== "quotations" && activeTab !== "contracts" && (
        <div className="px-6 pt-4 pb-5 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div className="flex items-center gap-3 w-full lg:w-auto">
              {getActionButton()}
              <DropdownMenu open={filterIsOpen} onOpenChange={setFilterIsOpen}>
                <DropdownMenuTrigger asChild>
                  <motion.button 
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 shadow-xs whitespace-nowrap"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Filter className="h-4 w-4" />
                    <span>{activeFilter}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${filterIsOpen ? 'rotate-180' : ''}`} />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="animate-in fade-in-80 w-56">
                  {currentFilters.map((filter) => (
                    <DropdownMenuItem 
                      key={filter} 
                      onClick={() => onFilterChange(filter)}
                      className={`cursor-pointer transition-colors ${filter === activeFilter ? 'bg-red-100 dark:bg-red-900/20 font-medium' : ''}`}
                    >
                      {filter}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Search Bar */}
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder={getSearchPlaceholder()}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 pr-4 py-2 w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Contracts tab: show the New Work Order button but no filter dropdown
          (ContractsManagement manages its own search and filtering) */}
      {activeTab === "contracts" && (
        <div className="px-6 pt-4 pb-5">
          {getActionButton()}
        </div>
      )}
    </div>
  );
}
