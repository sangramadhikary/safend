'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function SupervisorPlaceholder() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <Construction className="h-10 w-10 mx-auto mb-4 text-muted-foreground/40" />
        <h3 className="text-lg font-semibold mb-1">Coming Soon</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          This section is being built. You&apos;ll be able to manage deployments, leaves, patrols, and reports for your assigned posts here.
        </p>
      </CardContent>
    </Card>
  );
}
