'use client';

import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingAnimation } from '@/components/ui/loading-animation';

interface ChartDataset {
  name: string;
  data: number[];
  color?: string;
}

interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

interface ChartProps {
  data: ChartData;
  type: 'bar' | 'line' | 'pie';
  title?: string;
  description?: string;
  // recharts' ResponsiveContainer takes a number or a `${number}%` template, not
  // an arbitrary string. Every use here passes a pixel number, so keep it numeric.
  height?: number;
  isLoading?: boolean;
  currency?: boolean;
  showLegend?: boolean;
  className?: string;
}

export const ChartComponent = ({
  data,
  type,
  title,
  description,
  height = 300,
  isLoading = false,
  currency = false,
  showLegend = true,
  className
}: ChartProps) => {
  // Format data for recharts
  const formatData = () => {
    return data.labels.map((label, index) => {
      const dataPoint: any = { name: label };
      data.datasets.forEach(dataset => {
        dataPoint[dataset.name] = dataset.data[index];
      });
      return dataPoint;
    });
  };

  const chartColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];
  
  const formatValue = (value: number) => {
    if (currency) {
      return `₹${value.toLocaleString()}`;
    }
    return value.toLocaleString();
  };

  const renderChart = () => {
    const formattedData = formatData();
    
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <LoadingAnimation size="md" />
        </div>
      );
    }
    
    switch (type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={formatValue} />
              <Tooltip formatter={(value: number) => [formatValue(value)]} />
              {showLegend && <Legend />}
              {data.datasets.map((dataset, index) => (
                <Bar 
                  key={dataset.name}
                  dataKey={dataset.name} 
                  fill={dataset.color || chartColors[index % chartColors.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
        
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={formatValue} />
              <Tooltip formatter={(value: number) => [formatValue(value)]} />
              {showLegend && <Legend />}
              {data.datasets.map((dataset, index) => (
                <Line 
                  key={dataset.name}
                  type="monotone"
                  dataKey={dataset.name}
                  stroke={dataset.color || chartColors[index % chartColors.length]}
                  activeDot={{ r: 8 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
        
      case 'pie':
        // Format pie chart data differently
        const pieData = data.labels.map((label, index) => ({
          name: label,
          value: data.datasets[0].data[index]
        }));
        
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              {showLegend && <Legend />}
              <Tooltip formatter={(value: number) => [formatValue(value)]} />
            </PieChart>
          </ResponsiveContainer>
        );
        
      default:
        return <div>Invalid chart type</div>;
    }
  };

  if (title || description) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{renderChart()}</CardContent>
      </Card>
    );
  }

  return renderChart();
};
