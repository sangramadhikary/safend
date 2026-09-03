'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

interface ClientSatisfactionReportProps {
  period: string;
}

// Mock client satisfaction data
const satisfactionMetrics = [
  { category: "Guard Professionalism", score: 4.2, prevScore: 4.0, change: 0.2 },
  { category: "Punctuality", score: 4.5, prevScore: 4.4, change: 0.1 },
  { category: "Appearance", score: 4.3, prevScore: 4.2, change: 0.1 },
  { category: "Communication", score: 3.9, prevScore: 3.7, change: 0.2 },
  { category: "Problem Handling", score: 4.0, prevScore: 3.8, change: 0.2 },
  { category: "Reporting Quality", score: 4.1, prevScore: 3.9, change: 0.2 },
  { category: "Responsiveness", score: 4.2, prevScore: 4.1, change: 0.1 },
];

const topClients = [
  { name: "Apex Corporate Solutions", score: 4.8, trend: "up", comments: "Excellent service, guards are always professional" },
  { name: "Metro Residential Society", score: 4.6, trend: "up", comments: "Very satisfied with the security team" },
  { name: "Industrial Park Ltd", score: 4.2, trend: "same", comments: "Good service, could improve on reporting" },
  { name: "Westside Mall", score: 3.7, trend: "down", comments: "Need improvement in guard punctuality" },
  { name: "Grand Hotel Chain", score: 4.5, trend: "up", comments: "Great improvement in the last quarter" },
];

export function ClientSatisfactionReport({ period }: ClientSatisfactionReportProps) {
  // Prepare chart data
  const chartData = {
    labels: satisfactionMetrics.map(metric => metric.category),
    datasets: [
      {
        label: 'Current Period',
        data: satisfactionMetrics.map(metric => metric.score),
        backgroundColor: 'rgba(79, 70, 229, 0.7)',
      },
      {
        label: 'Previous Period',
        data: satisfactionMetrics.map(metric => metric.prevScore),
        backgroundColor: 'rgba(156, 163, 175, 0.7)',
      },
    ],
  };
  
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        min: 0,
        max: 5,
      }
    }
  };
  
  // Calculate overall satisfaction score
  const overallScore = (satisfactionMetrics.reduce((sum, metric) => sum + metric.score, 0) / satisfactionMetrics.length).toFixed(1);
  const prevOverallScore = (satisfactionMetrics.reduce((sum, metric) => sum + metric.prevScore, 0) / satisfactionMetrics.length).toFixed(1);
  const overallChange = (parseFloat(overallScore) - parseFloat(prevOverallScore)).toFixed(1);
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Overall Satisfaction</CardTitle>
            <CardDescription>Client rating (out of 5)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-4">
            <div className="text-5xl font-bold">{overallScore}</div>
            <div className={`text-sm mt-2 ${parseFloat(overallChange) > 0 ? 'text-green-500' : parseFloat(overallChange) < 0 ? 'text-red-500' : 'text-gray-500'}`}>
              {parseFloat(overallChange) > 0 ? '↑' : parseFloat(overallChange) < 0 ? '↓' : '→'} {Math.abs(parseFloat(overallChange))} from previous period
            </div>
            
            <div className="w-full mt-6">
              <div className="flex justify-between text-xs mb-1">
                <span>Poor</span>
                <span>Average</span>
                <span>Excellent</span>
              </div>
              <Progress value={(parseFloat(overallScore) / 5) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Satisfaction by Category</CardTitle>
            <CardDescription>Comparison with previous period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <Bar options={chartOptions} data={chartData} />
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Client Feedback</CardTitle>
          <CardDescription>Top clients and their satisfaction levels</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topClients.map((client, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span className="font-semibold mr-2">{client.score}</span>
                      <div className="w-24">
                        <Progress value={(client.score / 5) * 100} className={`h-2 ${client.score >= 4.5 ? 'bg-green-500' : client.score >= 4 ? 'bg-blue-500' : client.score >= 3.5 ? 'bg-amber-500' : 'bg-red-500'}`} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={client.trend === 'up' ? 'text-green-500' : client.trend === 'down' ? 'text-red-500' : 'text-gray-500'}>
                      {client.trend === 'up' ? '↑' : client.trend === 'down' ? '↓' : '→'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md truncate">{client.comments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Improvement Recommendations</CardTitle>
          <CardDescription>Based on client feedback</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-2">
            <li>Focus on improving communication protocols between guards and clients, as this category scores lower than others (3.9/5).</li>
            <li>Schedule additional training sessions for problem handling and emergency response, which has shown improvement but still has room to grow.</li>
            <li>Address punctuality concerns raised by Westside Mall by implementing stricter attendance tracking.</li>
            <li>Enhance reporting formats to provide more detailed information as requested by several clients.</li>
            <li>Review guard assignments at locations with declining satisfaction scores to identify specific issues.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
