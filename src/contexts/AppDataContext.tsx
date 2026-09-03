'use client';
import React, { createContext, useContext, useState } from "react";
import { useBranch } from "@/contexts/BranchContext";

// Define the context type
interface AppDataContextType {
  branches: { id: string; name: string; city: string; status: string }[];
  inventory: any[];
  assets: any[];
  vehicles: any[];
  facilities: any[];
  tickets: any[];
  activeBranch: string;
  setActiveBranch: (branchId: string) => void;
  isLoading: boolean;
  user: any;
}

// Create the context
const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

// Provider component
export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // These are now derived from BranchContext (no more mock data)
  // We keep the interface for backward compatibility with components that use useAppData
  const value: AppDataContextType = {
    branches: [], // Will be populated via useAppData hook bridge
    inventory,
    assets,
    vehicles,
    facilities,
    tickets,
    activeBranch: "",
    setActiveBranch: () => {},
    isLoading,
    user: null, // Will be populated via useAppData hook bridge
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

// Custom hook for using the context
export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }

  // useBranch is called unconditionally (React hook rules). If BranchProvider
  // is missing from the tree, this will throw — which is intentional since
  // both providers are in the same <Providers> wrapper.
  const branchCtx = useBranch();
  const branchData = branchCtx.allBranches.map(b => ({
    id: b.id,
    name: b.name,
    city: b.city,
    status: b.status,
  }));
  const activeBranch = branchCtx.currentBranch?.id || "";
  const setActiveBranch = branchCtx.setCurrentBranchById;

  // User is derived from the Supabase session — components needing user data
  // should call supabaseClient.auth.getUser() directly.
  // This field is intentionally null; the context does not own auth state.

  return {
    ...context,
    branches: branchData,
    activeBranch,
    setActiveBranch,
    user: context.user,
  };
};
