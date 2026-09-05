'use client';

import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { BadgeDelta, DeltaType } from "@/components/ui/badge-delta";
import { ArrowTrendingUpIcon, CurrencyRupeeIcon, BanknotesIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import { formatINR, formatINRShort } from "@/lib/format";

interface InvoiceStatusCardsProps {
  totalOutstanding: number;
  totalCollected: number;
  totalBilled: number;
  collectionEfficiency: string;
}

export function InvoiceStatusCards({
  totalOutstanding,
  totalCollected,
  totalBilled,
  collectionEfficiency
}: InvoiceStatusCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="text-sm font-medium">Total Outstanding</div>
          <CurrencyRupeeIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" title={formatINR(totalOutstanding)}>{formatINRShort(totalOutstanding)}</div>
          <p className="text-xs text-muted-foreground">
            From {formatINR(totalBilled)} total billed
          </p>
        </CardContent>
        <CardFooter className="pb-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <BadgeDelta deltaType="moderateIncrease" className="mr-1" />
            <span>+4.3% from last month</span>
          </div>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="text-sm font-medium">Total Collected</div>
          <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" title={formatINR(totalCollected)}>{formatINRShort(totalCollected)}</div>
          <p className="text-xs text-muted-foreground">
            In current financial year
          </p>
        </CardContent>
        <CardFooter className="pb-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <BadgeDelta deltaType="increase" className="mr-1" />
            <span>+12.7% from previous year</span>
          </div>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="text-sm font-medium">Billed This Month</div>
          <ChartBarIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">₹17.5L</div>
          <p className="text-xs text-muted-foreground">
            From 32 active contracts
          </p>
        </CardContent>
        <CardFooter className="pb-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <BadgeDelta deltaType="moderateDecrease" className="mr-1" />
            <span>-2.5% from last month</span>
          </div>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="text-sm font-medium">Collection Efficiency</div>
          <ArrowTrendingUpIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{collectionEfficiency}%</div>
          <p className="text-xs text-muted-foreground">
            Target: 85%
          </p>
        </CardContent>
        <CardFooter className="pb-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <BadgeDelta deltaType="increase" className="mr-1" />
            <span>+3.2% from last quarter</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
