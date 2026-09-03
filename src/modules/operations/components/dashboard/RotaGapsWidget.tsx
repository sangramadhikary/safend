'use client';
import { SpeedometerGauge } from "@/components/ui/speedometer-gauge";
import { CalendarDays } from "lucide-react";
import { RotaGap } from "@/types/operations";

interface RotaGapsWidgetProps {
  data: RotaGap[];
  config?: Record<string, any>;
}

export default function RotaGapsWidget({ data, config }: RotaGapsWidgetProps) {
  // Calculate overall rota fulfillment percentage
  const calculateFulfillmentPercentage = () => {
    if (!data || data.length === 0) {
      return 0;
    }

    const totalRequired = data.reduce((sum, item) => sum + item.required, 0);
    const totalFilled = data.reduce((sum, item) => sum + item.filled, 0);
    
    if (totalRequired === 0) {
      return 100; // If no positions required, consider it 100% fulfilled
    }

    return (totalFilled / totalRequired) * 100;
  };

  const fulfillmentPercentage = calculateFulfillmentPercentage();

  // Calculate summary stats
  const totalPositions = data.reduce((sum, item) => sum + item.required, 0);
  const filledPositions = data.reduce((sum, item) => sum + item.filled, 0);
  const gapPositions = totalPositions - filledPositions;

  if (data.length === 0) {
    return (
      <div className="h-[320px] flex flex-col items-center justify-center">
        <SpeedometerGauge
          value={0}
          size={180}
          label="No Data"
          showControls={false}
          animated={false}
        />
        <div className="mt-4 text-center">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No rota data available</p>
          <p className="text-xs text-muted-foreground mt-1">Set up rotas to track coverage</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[320px] flex flex-col items-center justify-center space-y-4">
      {/* Speedometer Gauge */}
      <SpeedometerGauge
        value={fulfillmentPercentage}
        size={180}
        label="Rota Coverage"
        showControls={true}
        animated={true}
      />

      {/* Summary Statistics */}
      <div className="w-full grid grid-cols-3 gap-4 text-center text-sm">
        <div className="space-y-1">
          <div className="font-semibold text-foreground text-lg">{totalPositions}</div>
          <div className="text-muted-foreground text-xs">Total Posts</div>
        </div>
        <div className="space-y-1">
          <div className="font-semibold text-success text-lg">{filledPositions}</div>
          <div className="text-muted-foreground text-xs">Filled</div>
        </div>
        <div className="space-y-1">
          <div className="font-semibold text-destructive text-lg">{gapPositions}</div>
          <div className="text-muted-foreground text-xs">Gaps</div>
        </div>
      </div>
    </div>
  );
}
