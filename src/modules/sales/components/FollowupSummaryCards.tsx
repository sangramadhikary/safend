'use client';
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Clock, Calendar, AlertTriangle } from "lucide-react";
import { useFollowupsData } from "@/contexts/FollowupsDataContext";

export function FollowupSummaryCards() {
  // Use centralized followups data from context
  const { followups } = useFollowupsData();

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Today's follow-ups
    const todayCount = followups.filter(followup => {
      if (!followup.dateTime) return false;
      const followupDate = new Date(followup.dateTime);
      const followupDay = new Date(followupDate.getFullYear(), followupDate.getMonth(), followupDate.getDate());
      return followupDay.getTime() === today.getTime() && followup.status !== "Completed";
    }).length;
    
    // This week's follow-ups (next 7 days including today)
    const thisWeekCount = followups.filter(followup => {
      if (!followup.dateTime) return false;
      const followupDate = new Date(followup.dateTime);
      return followupDate >= today && followupDate < sevenDaysFromNow && followup.status !== "Completed";
    }).length;
    
    // Overdue follow-ups
    const overdueCount = followups.filter(followup => {
      if (!followup.dateTime) return false;
      const followupDate = new Date(followup.dateTime);
      return followupDate < today && followup.status !== "Completed";
    }).length;
    
    return {
      today: todayCount,
      thisWeek: thisWeekCount,
      overdue: overdueCount
    };
  }, [followups]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-red">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
            <Clock className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-600 dark:text-gray-300">Today's Follow-ups</h4>
            <p className="text-3xl font-bold stat-text-red mt-1">{stats.today}</p>
            <p className="text-xs text-muted-foreground mt-1">Due today</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-black">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <Calendar className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-600 dark:text-gray-300">This Week's Follow-ups</h4>
            <p className="text-3xl font-bold stat-text-black mt-1">{stats.thisWeek}</p>
            <p className="text-xs text-muted-foreground mt-1">Next 7 days</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-gray">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-600 dark:text-gray-300">Overdue Follow-ups</h4>
            <p className="text-3xl font-bold stat-text-gray mt-1">{stats.overdue}</p>
            <p className="text-xs text-muted-foreground mt-1">Need attention</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
