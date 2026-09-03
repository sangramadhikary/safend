'use client';

export interface ComponentWithFilterProps {
  filter: string;
}

// Add specific interfaces for each Accounts component
export interface AccountsPayableProps extends ComponentWithFilterProps {}
export interface BillingReceivablesProps extends ComponentWithFilterProps {}
export interface BankingCashProps extends ComponentWithFilterProps {}
export interface FixedAssetsProps extends ComponentWithFilterProps {}
export interface FinancialsMISProps extends ComponentWithFilterProps {}
export interface GSTComplianceProps extends ComponentWithFilterProps {}
export interface TDSComplianceProps extends ComponentWithFilterProps {}
export interface InterfacesProps extends ComponentWithFilterProps {}

// Create and export the Interfaces component
export function Interfaces({ filter }: InterfacesProps) {
  return (
    <div>
      <h3 className="text-xl font-medium mb-4">System Interfaces</h3>
      <p>Filter: {filter}</p>
      {/* Content for the interfaces component */}
    </div>
  );
}
