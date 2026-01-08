import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { CalendarIcon, AlertTriangle, Clock, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const AdminPenalties = () => {
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [shiftFilter, setShiftFilter] = useState<string>("All");

  const { data: penalties, isLoading } = useQuery({
    queryKey: ["admin-penalties", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("penalties")
        .select(`
          *,
          vehicle_entries (
            wb_number,
            shift_id,
            vehicle_type_id,
            vehicle_types (
              type_name
            )
          )
        `)
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch shifts to map shift_id to shift_name
  const { data: shifts } = useQuery({
    queryKey: ["shifts-for-penalties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, shift_name, shift_date");
      if (error) throw error;
      return data;
    },
  });

  // Get shift name for a penalty based on created_at time
  const getShiftForPenalty = (createdAt: string) => {
    const hour = new Date(createdAt).getHours();
    return hour >= 7 && hour < 18 ? "Day" : "Night";
  };

  // Filter penalties by shift
  const filteredPenalties = penalties?.filter((p) => {
    if (shiftFilter === "All") return true;
    return getShiftForPenalty(p.created_at) === shiftFilter;
  });

  // Calculate summary statistics
  const totalPenalties = filteredPenalties?.length || 0;
  const totalAmount = filteredPenalties?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
  const exhaustedCount = filteredPenalties?.filter(p => p.penalty_type === "Exhausted Attempts").length || 0;
  const overdueCount = filteredPenalties?.filter(p => p.penalty_type === "Overdue Return").length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Penalties History</h1>
        <p className="text-muted-foreground">View and filter all historical penalties</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Start Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Shift Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift</label>
              <Select value={shiftFilter} onValueChange={setShiftFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Shifts</SelectItem>
                  <SelectItem value="Day">Day Shift</SelectItem>
                  <SelectItem value="Night">Night Shift</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick Date Presets */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Quick Select</label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate(new Date());
                    setEndDate(new Date());
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate(subDays(new Date(), 7));
                    setEndDate(new Date());
                  }}
                >
                  Last 7 Days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate(subDays(new Date(), 30));
                    setEndDate(new Date());
                  }}
                >
                  Last 30 Days
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Penalties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPenalties}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              TShs {totalAmount.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Exhausted Attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exhaustedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Overdue Returns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Penalties Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Penalties</CardTitle>
          <CardDescription>
            Showing {filteredPenalties?.length || 0} penalties from {format(startDate, "MMM d, yyyy")} to {format(endDate, "MMM d, yyyy")}
            {shiftFilter !== "All" && ` (${shiftFilter} Shift only)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredPenalties && filteredPenalties.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry ID</TableHead>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Penalty Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Date & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPenalties.map((penalty) => (
                  <TableRow key={penalty.id}>
                    <TableCell className="font-mono">
                      WB-{penalty.vehicle_entries?.wb_number || "N/A"}
                    </TableCell>
                    <TableCell className="font-medium">{penalty.vehicle_no}</TableCell>
                    <TableCell>
                      <Badge
                        variant={penalty.penalty_type === "Exhausted Attempts" ? "destructive" : "secondary"}
                      >
                        {penalty.penalty_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{penalty.reason}</TableCell>
                    <TableCell className="font-semibold text-destructive">
                      TShs {Number(penalty.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getShiftForPenalty(penalty.created_at)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(penalty.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No penalties found for the selected date range and filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPenalties;
