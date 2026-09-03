'use client';

import { useAppData } from "@/contexts/AppDataContext";
import { VisitorManagement } from "./visitors/VisitorManagement";
import { BrandLoader } from "@/components/ui/brand-loader";

export function VisitorGatePass() {
  const { isLoading } = useAppData();
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-white rounded-lg">
        <BrandLoader size="lg" message="Loading visitors..." />
      </div>
    );
  }
  
  return <VisitorManagement />;
}
