'use client';

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Activity {
  id: number;
  user: {
    name: string;
    avatar?: string;
  };
  action: string;
  target: string;
  time: string;
}

interface ActivityCardProps {
  activities: Activity[];
  className?: string;
}

export function ActivityCard({ activities, className }: ActivityCardProps) {
  return (
    <Card className={cn("glass-card hover-scale", className)}>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div 
              key={activity.id}
              className="flex items-start gap-4 p-3 hover:bg-secondary rounded-lg transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium overflow-hidden">
                {activity.user.avatar ? (
                  <img src={activity.user.avatar} alt={activity.user.name} className="w-full h-full object-cover" />
                ) : (
                  activity.user.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">{activity.user.name}</span>{" "}
                  <span className="text-muted-foreground">{activity.action}</span>{" "}
                  <span className="font-medium">{activity.target}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
