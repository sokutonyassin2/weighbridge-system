import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, Sun, Moon, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function OverdueHistory() {
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [shiftFilter, setShiftFilter] = useState<string>("all");

  const { data: overdueRecords, isLoading } = useQuery({
    queryKey: ["overdue-history", startDate, endDate, shiftFilter],
    queryFn: async () => {
      let query = supabase
        .from("overdue_vehicles_history")
        .select("*")
        .order("overdue_time", { ascending: false });

      if (startDate) {
        query = query.gte("overdue_time", `${startDate}T00:00:00+03:00`);
      }
      if (endDate) {
        query = query.lte("overdue_time", `${endDate}T23:59:59+03:00`);
      }
      if (shiftFilter !== "all") {
        query = query.eq("shift_name", shiftFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const totalOverdue = overdueRecords?.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          Overdue Vehicles History
        </h1>
        <p className="text-muted-foreground">
          Historical records of vehicles that exceeded the 12-hour return window
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>Filter overdue records by date and shift</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={shiftFilter} onValueChange={setShiftFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shifts</SelectItem>
                  <SelectItem value="Day">Day Shift</SelectItem>
                  <SelectItem value="Night">Night Shift</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-destructive" />
            Total Overdue Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">{totalOverdue}</div>
          <p className="text-xs text-muted-foreground">In selected date range</p>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Overdue Vehicle Records</CardTitle>
          <CardDescription>
            Vehicles that exceeded the 12-hour window are removed from pending and can be re-added as new entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !overdueRecords || overdueRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No overdue records found for the selected filters
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>First Weigh Time</TableHead>
                  <TableHead>Overdue Time</TableHead>
                  <TableHead>Entry Shift</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueRecords.map((record: any) => {
                  const isDay = record.shift_name === "Day";
                  return (
                    <TableRow key={record.id} className="bg-destructive/5">
                      <TableCell className="font-medium">{record.vehicle_no}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {record.first_weigh_time
                          ? format(new Date(record.first_weigh_time), "MMM dd, yyyy HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-destructive font-medium">
                        {record.overdue_time
                          ? format(new Date(record.overdue_time), "MMM dd, yyyy HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {record.shift_name ? (
                          <Badge 
                            variant="outline" 
                            className={
                              isDay 
                                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" 
                                : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                            }
                          >
                            {isDay ? <Sun className="h-3 w-3 mr-1" /> : <Moon className="h-3 w-3 mr-1" />}
                            {record.shift_date ? format(new Date(record.shift_date), "MMM dd") : ""} {record.shift_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {record.notes || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
