'use client';

import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RecentPenalty {
  id: string;
  staff_name: string;
  offense: string;
  status: string;
  violation_date: string;
}

interface ReportsSummaryWidgetProps {
  onViewAllReports: () => void;
}

export default function ReportsSummaryWidget({ onViewAllReports }: ReportsSummaryWidgetProps) {
  const { data: recentPenalties, isLoading } = useQuery<RecentPenalty[]>({
    queryKey: ['reports', 'widget-recent-penalties'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('penalties')
        .select('id, staff_name, offense, status, violation_date')
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw new Error(error.message);
      return (data ?? []) as RecentPenalty[];
    },
  });

  return (
    <Card className="h-[260px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center">
          <FileText className="h-4 w-4 mr-2" />
          Recent Penalties
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !recentPenalties || recentPenalties.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No penalties recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {recentPenalties.map((penalty) => (
              <div
                key={penalty.id}
                className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{penalty.staff_name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {penalty.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{penalty.violation_date}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onViewAllReports}
          >
            View All Reports
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
