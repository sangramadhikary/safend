'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, Users, ShieldCheck } from "lucide-react";
import type { OperationalPost } from "@/services/supabase/OperationalPostService";
import { aggregatePostMetrics } from "./postMetrics";

interface PostSummaryStripProps {
  posts: OperationalPost[];
  clientCount: number;
}

export function PostSummaryStrip({ posts, clientCount }: PostSummaryStripProps) {
  const activePosts = posts.filter((p) => p.status === "active").length;
  const metrics = aggregatePostMetrics(posts);

  const tiles = [
    { label: "Clients", value: clientCount, icon: Building2 },
    { label: "Active Posts", value: `${activePosts}/${posts.length}`, icon: MapPin },
    { label: "Total Guards", value: metrics.totalGuards, icon: Users },
    { label: "Day / Night", value: `${metrics.byShift.day} / ${metrics.byShift.night}`, icon: ShieldCheck },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Card key={t.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2 rounded-lg bg-secondary">
                <Icon className="h-5 w-5 text-safend-red" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{t.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
