'use client';

/**
 * Read-only employee reference card, opened from a picker or an assigned chip.
 *
 * Lives here so Deployments and Attendance show the same information about the
 * same person. Previously only Deployments had it.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail } from 'lucide-react';
import type { HREmployee } from '@/services/supabase/HREmployeeService';
import { calcAge, resolveServiceTypeKey, getServiceLabel } from './rotaShared';
import { EmployeeAvatar, type RecentWorkMap } from './EmployeePicker';

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value === undefined || value === null || value === '' ? '—' : value}</p>
    </div>
  );
}

export function EmployeeDetailDialog({
  employee, open, onOpenChange, recentWork,
}: {
  employee: HREmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recentWork?: RecentWorkMap;
}) {
  const age = employee ? calcAge(employee.dateOfBirth) : null;
  const history = employee ? recentWork?.[employee.id || ''] || [] : [];
  // The designation the rota engine actually derives, which can differ from the
  // free-text string on the record. Showing both makes an unrecognised
  // designation diagnosable instead of just mysteriously affecting eligibility.
  const resolved = employee ? resolveServiceTypeKey(employee.designation) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Employee details</DialogTitle>
          <DialogDescription className="sr-only">Reference information for the selected employee</DialogDescription>
        </DialogHeader>
        {employee && (
          <div className="space-y-4 py-1">
            <div className="flex items-center gap-4">
              <EmployeeAvatar employee={employee} size="lg" className="w-16 h-16 text-2xl" />
              <div className="min-w-0">
                <p className="font-bold text-base truncate">{employee.name}</p>
                <p className="text-sm text-muted-foreground">{employee.designation || 'No designation'}</p>
                <p className="text-xs font-mono text-muted-foreground">{employee.employeeId}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="outline"
                className={employee.status === 'Active' ? 'border-green-300 text-green-700 dark:text-green-300' : 'border-red-300 text-red-700 dark:text-red-300'}
              >
                {employee.status}
              </Badge>
              {resolved ? (
                <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
                  Deployable as {getServiceLabel(resolved)}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                  Designation not recognised
                </Badge>
              )}
              {(employee.monthlySalary || 0) <= 0 && (
                <Badge variant="outline" className="border-orange-300 text-orange-700 dark:text-orange-300">
                  No personal salary set
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Gender" value={employee.gender} />
              <Field label="Age" value={age ? `${age} yr` : undefined} />
              <Field label="Height" value={employee.height ? `${employee.height} cm` : undefined} />
              <Field label="Weight" value={employee.weight ? `${employee.weight} kg` : undefined} />
              <Field label="Blood group" value={employee.bloodGroup} />
              <Field label="Department" value={employee.department} />
              <Field
                label="Join date"
                value={employee.joinDate ? new Date(employee.joinDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined}
              />
              <Field label="Monthly salary" value={employee.monthlySalary ? `₹${employee.monthlySalary.toLocaleString('en-IN')}` : undefined} />
            </div>

            {(employee.phone || employee.email) && (
              <div className="flex flex-wrap gap-3 text-sm border-t pt-3">
                {employee.phone && (
                  <a href={`tel:${employee.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-[#D71920]">
                    <Phone className="h-3.5 w-3.5" />{employee.phone}
                  </a>
                )}
                {employee.email && (
                  <a href={`mailto:${employee.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-[#D71920] truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />{employee.email}
                  </a>
                )}
              </div>
            )}

            {history.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Last {history.length} deployed post{history.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {history.map((r, i) => (
                    <div key={`${r.postName}-${r.date}-${i}`} className="flex justify-between text-sm gap-3">
                      <span className="text-blue-600 dark:text-blue-400 truncate">{r.postName}</span>
                      <span className="text-muted-foreground shrink-0">
                        {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
