'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, AlertTriangle, MapPin, UtensilsCrossed, Download, Loader2 } from 'lucide-react';
import { useReportsData } from '../hooks/useReportsData';
import { useOperationalPosts } from '../hooks/useOperationalPosts';
import {
  generatePenaltyReport,
  generateEmployeeDirectory,
  generateMessChargesReport,
  generateAttendanceSummary,
} from '../utils/reportGenerator';

type ReportType = 'attendance' | 'penalty' | 'mess' | 'employee';

export function ReportsCenter() {
  const { stats, recentPenalties, isLoading } = useReportsData();
  const { posts } = useOperationalPosts();

  const [reportType, setReportType] = useState<ReportType>('penalty');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [postFilter, setPostFilter] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    try {
      const postId = postFilter !== 'all' ? postFilter : undefined;

      switch (reportType) {
        case 'attendance':
          await generateAttendanceSummary(fromDate, toDate, postId);
          break;
        case 'penalty':
          await generatePenaltyReport(fromDate, toDate, postId);
          break;
        case 'mess':
          await generateMessChargesReport(fromDate, toDate);
          break;
        case 'employee':
          await generateEmployeeDirectory();
          break;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  const needsDateRange = reportType !== 'employee';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold">Reports Center</h3>
        <p className="text-muted-foreground">
          Generate reports from real operational data
        </p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? '—' : stats.activeEmployees}
              </p>
              <p className="text-xs text-muted-foreground">Active Employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? '—' : stats.penaltiesThisMonth}
              </p>
              <p className="text-xs text-muted-foreground">Penalties This Month</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MapPin className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? '—' : stats.activePosts}
              </p>
              <p className="text-xs text-muted-foreground">Active Posts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UtensilsCrossed className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? '—' : stats.activeMessWeeks}
              </p>
              <p className="text-xs text-muted-foreground">Mess Weeks Active</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Report Type</label>
              <Select
                value={reportType}
                onValueChange={(v) => setReportType(v as ReportType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">Attendance Summary</SelectItem>
                  <SelectItem value="penalty">Penalty Report</SelectItem>
                  <SelectItem value="mess">Mess Charges Report</SelectItem>
                  <SelectItem value="employee">Employee Directory</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsDateRange && (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium">From</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">To</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {(reportType === 'attendance' || reportType === 'penalty') && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Post</label>
                <Select value={postFilter} onValueChange={setPostFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Posts</SelectItem>
                    {posts.map((post) => (
                      <SelectItem key={post.id} value={post.id}>
                        {post.post_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || (needsDateRange && (!fromDate || !toDate))}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate CSV
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Downloads as CSV file
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent Penalties Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Penalties</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentPenalties.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No penalties recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Offense</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPenalties.map((penalty) => (
                  <TableRow key={penalty.id}>
                    <TableCell className="font-medium">
                      {penalty.staff_name}
                    </TableCell>
                    <TableCell>{penalty.offense}</TableCell>
                    <TableCell>{penalty.violation_date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{penalty.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
