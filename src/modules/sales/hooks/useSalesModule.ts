'use client';
import { useState, useEffect, useEffectEvent } from "react";
import { filterOptions } from "../constants/salesTabs";
import { useTabWithHash } from "@/hooks/useTabWithHash";

const validTabs = Object.keys(filterOptions);

export function useSalesModule() {
  const [activeTab, setActiveTab] = useTabWithHash("crm", validTabs);
  const [activeFilter, setActiveFilter] = useState("All Clients");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIsOpen, setFilterIsOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTabChange = (value: string) => {
    setIsLoading(true);
    setActiveTab(value);
    setActiveFilter(filterOptions[value as keyof typeof filterOptions][0]);
    
    setTimeout(() => {
      setIsLoading(false);
    }, 600);
  };

  // useEffectEvent: reads the latest handleTabChange without needing it in deps
  const onNavigateToTab = useEffectEvent((event: CustomEvent<{ tab: string }>) => {
    const { tab } = event.detail;
    if (tab && filterOptions[tab as keyof typeof filterOptions]) {
      handleTabChange(tab);
    }
  });

  // Listen for custom navigation events (e.g., from QuotationActionButtons)
  useEffect(() => {
    window.addEventListener('navigateToTab', onNavigateToTab as EventListener);
    return () => {
      window.removeEventListener('navigateToTab', onNavigateToTab as EventListener);
    };
  }, []);
  
  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setFilterIsOpen(false);
  };
  
  const handleClientSelect = (client: any) => {
    setSelectedClient(client);
  };

  return {
    // State
    activeTab,
    activeFilter,
    searchTerm,
    filterIsOpen,
    selectedClient,
    isLoading,
    
    // Setters
    setSearchTerm,
    setFilterIsOpen,
    setSelectedClient,
    setActiveTab,
    
    // Handlers
    handleTabChange,
    handleFilterChange,
    handleClientSelect
  };
}
