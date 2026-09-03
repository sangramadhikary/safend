'use client';

import { RacingBarChart } from "@/components/ui/racing-bar-chart";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Utensils, ArrowRight } from "lucide-react";
import { format } from 'date-fns';

interface MessMeal {
  id: string;
  employeeName: string;
  postName: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  quantity: number;
  txnDate: string;
}

interface MessWidgetProps {
  data: MessMeal[];
  config?: Record<string, any>;
}

export default function MessWidget({ data, config }: MessWidgetProps) {
  const router = useRouter();
  const defaultConfig = {
    showBreakfast: true,
    showLunch: true,
    showDinner: true,
    showSnacks: false,
    limit: 8,
  };

  // Combine default config with user customizations
  const widgetConfig = config ? { ...defaultConfig, ...config } : defaultConfig;

  // Filter data based on config
  const filteredData = data
    .filter(item => {
      if (item.mealType === 'breakfast' && !widgetConfig.showBreakfast) return false;
      if (item.mealType === 'lunch' && !widgetConfig.showLunch) return false;
      if (item.mealType === 'dinner' && !widgetConfig.showDinner) return false;
      if (item.mealType === 'snacks' && !widgetConfig.showSnacks) return false;
      return true;
    })
    .sort((a, b) => new Date(b.txnDate).getTime() - new Date(a.txnDate).getTime());

  // Aggregate data by employee for racing chart
  const employeeStats = filteredData.reduce((acc, meal) => {
    if (!acc[meal.employeeName]) {
      acc[meal.employeeName] = {
        name: meal.employeeName,
        totalMeals: 0,
        postName: meal.postName,
        lastMealDate: meal.txnDate
      };
    }
    acc[meal.employeeName].totalMeals += meal.quantity;
    return acc;
  }, {} as Record<string, any>);

  const chartData = Object.values(employeeStats)
    .sort((a: any, b: any) => b.totalMeals - a.totalMeals)
    .slice(0, widgetConfig.limit)
    .map((emp: any, index) => ({
      id: emp.name,
      name: emp.name,
      value: emp.totalMeals,
      department: emp.postName,
      color: index < 3 
        ? ['hsl(var(--success))', 'hsl(var(--primary))', 'hsl(var(--warning))'][index]
        : 'hsl(var(--accent))'
    }));

  // Navigate to Mess Management section
  const goToMessManagement = () => {
    router.push('/operations?tab=mess');
  };

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground space-y-3">
        <Utensils className="h-12 w-12 opacity-50" />
        <div className="text-center">
          <p className="text-sm">No mess meals found</p>
          <p className="text-xs mt-1">Meal data will appear here once logged</p>
        </div>
        <Button 
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={goToMessManagement}
        >
          Go to Mess Management
        </Button>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground space-y-3">
        <Utensils className="h-12 w-12 opacity-50" />
        <div className="text-center">
          <p className="text-sm">No meals match your filters</p>
          <p className="text-xs mt-1">Adjust filter settings to see results</p>
        </div>
        <Button 
          variant="outline"
          size="sm"
          onClick={goToMessManagement}
        >
          View All Records
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[300px] flex flex-col">
      <div className="flex-1 p-4">
        <RacingBarChart
          data={chartData}
          title="Mess Usage Marathon"
          animated={true}
          showPercentage={false}
          direction="horizontal"
          maxBars={widgetConfig.limit}
          height={220}
        />
      </div>
      
      <div className="mt-2 p-4 pt-2 border-t border-border">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full flex justify-between items-center"
          onClick={goToMessManagement}
        >
          <span>View All Mess Records</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
