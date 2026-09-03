'use client';

import { useClientProfile, useClientComplianceDocs } from '../hooks/useClientData';
import { Download, FileText, Shield, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClientCompliance() {
  const { data: profile } = useClientProfile();
  const { data: docs, isLoading } = useClientComplianceDocs(profile?.client_name);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  // Group by category
  const esicDocs = (docs || []).filter((d: any) => d.category === 'ESIC');
  const epfDocs = (docs || []).filter((d: any) => d.category === 'EPF');

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#D71920]" />
          <h3 className="font-semibold text-foreground dark:text-white">Compliance Documents</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Download ESIC and EPF/EOF challans filed for your deployed workforce
        </p>
      </div>

      {(docs || []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FileText className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">No compliance documents available</p>
          <p className="text-sm mt-1">Filed challans will appear here for download</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ESIC Section */}
          {esicDocs.length > 0 && (
            <ComplianceSection
              title="ESIC Challans"
              subtitle="Employee State Insurance Corporation filings"
              icon={Shield}
              docs={esicDocs}
            />
          )}

          {/* EPF Section */}
          {epfDocs.length > 0 && (
            <ComplianceSection
              title="EPF / EOF Challans"
              subtitle="Employees' Provident Fund filings"
              icon={FileText}
              docs={epfDocs}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ComplianceSection({
  title,
  subtitle,
  icon: Icon,
  docs,
}: {
  title: string;
  subtitle: string;
  icon: any;
  docs: any[];
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#D71920]" />
        <div>
          <h4 className="font-medium text-foreground dark:text-white text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {docs.map((doc: any) => (
          <div
            key={doc.id}
            className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                <FileText className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground dark:text-white truncate">
                  {doc.sub_type}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Period: {doc.period}</span>
                  {doc.filing_date && (
                    <span>· Filed: {new Date(doc.filing_date).toLocaleDateString('en-IN')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ₹{(doc.amount || 0).toLocaleString('en-IN')}
              </span>
              {doc.reference_number && (
                <Button variant="ghost" size="sm" className="text-[#D71920] hover:text-[#b8151b]">
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
