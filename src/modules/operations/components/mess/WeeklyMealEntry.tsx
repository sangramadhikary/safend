'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Save, Users } from "lucide-react";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { useMessMealRecords } from "../../hooks/useMessMealRecords";
import { useStaffMembers } from "../../hooks/useStaffMembers";
import { MessWeekWithPosts } from "../../hooks/useMessWeeks";

interface WeeklyMealEntryProps {
  messWeek: MessWeekWithPosts;
}

interface MealEntry {
  employee_id: string;
  employee_name: string;
  post_id: string;
  post_name: string;
  meal_count: number;
}

export function WeeklyMealEntry({ messWeek }: WeeklyMealEntryProps) {
  const { mealRecords, isLoading, bulkSaveMealRecords } = useMessMealRecords(messWeek.id);
  const { staffMembers } = useStaffMembers();
  const { toast } = useToastWithSound();
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Build entries from existing records or from staff list
  useEffect(() => {
    if (mealRecords.length > 0) {
      // Load from existing records
      setEntries(mealRecords.map(r => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        post_id: r.post_id,
        post_name: r.post_name,
        meal_count: r.meal_count,
      })));
    } else if (staffMembers.length > 0 && messWeek.mess_week_posts?.length > 0) {
      // Initialize from staff list × posts
      const initial: MealEntry[] = [];
      for (const post of messWeek.mess_week_posts) {
        for (const staff of staffMembers) {
          initial.push({
            employee_id: staff.id,
            employee_name: staff.name,
            post_id: post.post_id,
            post_name: post.post_name,
            meal_count: 0,
          });
        }
      }
      setEntries(initial);
    }
  }, [mealRecords, staffMembers, messWeek.mess_week_posts]);

  const updateMealCount = (employeeId: string, postId: string, count: number) => {
    setEntries(prev => prev.map(e =>
      e.employee_id === employeeId && e.post_id === postId
        ? { ...e, meal_count: Math.max(0, count) }
        : e
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await bulkSaveMealRecords.mutateAsync({
        mess_week_id: messWeek.id,
        records: entries,
      });
      setHasChanges(false);
      toast.success({
        title: "Meals Saved",
        description: "Monthly meal records saved successfully",
      });
    } catch (error: any) {
      toast.error({ title: "Save Failed", description: error.message });
    }
  };

  const weekPosts = messWeek.mess_week_posts || [];
  const isReadOnly = messWeek.status === 'calculated' || messWeek.status === 'deducted';

  // Group entries by post for display
  const groupedByPost = weekPosts.map(post => ({
    ...post,
    entries: entries.filter(e => e.post_id === post.post_id),
  }));

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading meal records...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          <h4 className="font-semibold">Meal Entry — {staffMembers.length} employees across {weekPosts.length} post(s)</h4>
        </div>
        {!isReadOnly && (
          <Button onClick={handleSave} disabled={bulkSaveMealRecords.isPending || !hasChanges}>
            <Save className="h-4 w-4 mr-2" />
            {bulkSaveMealRecords.isPending ? 'Saving...' : 'Save All'}
          </Button>
        )}
      </div>

      {isReadOnly && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          This cycle&apos;s charges have been calculated. Meal records are read-only.
        </div>
      )}

      {groupedByPost.map(postGroup => (
        <Card key={postGroup.post_id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {postGroup.post_name}
              <Badge variant="secondary" className="ml-2">
                {postGroup.entries.reduce((s, e) => s + e.meal_count, 0)} meals
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="w-32 text-center">Total Meals</TableHead>
                  {mealRecords[0]?.per_meal_cost && (
                    <>
                      <TableHead className="w-32 text-right">Per Meal</TableHead>
                      <TableHead className="w-32 text-right">Total Charge</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {postGroup.entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      No employees assigned
                    </TableCell>
                  </TableRow>
                ) : (
                  postGroup.entries.map(entry => {
                    const existingRecord = mealRecords.find(
                      r => r.employee_id === entry.employee_id && r.post_id === entry.post_id
                    );
                    return (
                      <TableRow key={`${entry.employee_id}-${entry.post_id}`}>
                        <TableCell className="font-medium">{entry.employee_name}</TableCell>
                        <TableCell className="text-center">
                          {isReadOnly ? (
                            <span className="font-medium">{entry.meal_count}</span>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              max={21}
                              value={entry.meal_count || ''}
                              onChange={(e) => updateMealCount(
                                entry.employee_id,
                                entry.post_id,
                                parseInt(e.target.value) || 0
                              )}
                              className="w-20 mx-auto text-center"
                            />
                          )}
                        </TableCell>
                        {existingRecord?.per_meal_cost && (
                          <>
                            <TableCell className="text-right">₹{existingRecord.per_meal_cost}</TableCell>
                            <TableCell className="text-right font-medium">
                              ₹{existingRecord.total_charge?.toLocaleString()}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {entries.length === 0 && weekPosts.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No active employees found. Add employees to get started.
        </div>
      )}
    </div>
  );
}
