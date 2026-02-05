import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, Banknote, Users, AlertCircle } from "lucide-react";
import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from "date-fns";

type TimePeriod = "daily" | "weekly" | "monthly";
type ShiftFilter = "All" | "Day" | "Night";

const COLORS = {
  Day: "hsl(var(--primary))",
  Night: "hsl(var(--secondary))",
  JV: "hsl(var(--accent))",
  MV: "hsl(var(--muted))",
};

export default function ShiftAnalytics() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("daily");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("All");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");

  // Calculate date range based on time period
  const getDateRange = () => {
    const now = new Date();
    switch (timePeriod) {
      case "daily":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "weekly":
        return { start: subWeeks(now, 1), end: now };
      case "monthly":
        return { start: subMonths(now, 1), end: now };
    }
  };

  const { start, end } = getDateRange();

  // Fetch only operators for filter
  const { data: operators } = useQuery({
    queryKey: ["operators"],
    queryFn: async () => {
      // First get IDs of users with 'operator' role
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "operator");

      if (rolesError) throw rolesError;

      const operatorIds = roles.map(r => r.user_id);

      if (operatorIds.length === 0) return [];

      // Then fetch profile details for these operators
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", operatorIds)
        .order("full_name");

      if (error) throw error;
      return data;
    },
  });

  // Fetch analytics data
  const { data: analyticsData } = useQuery({
    queryKey: ["shift-analytics", timePeriod, shiftFilter, operatorFilter, start, end],
    queryFn: async () => {
      // Build query for shifts - include profiles for reliable operator names
      let shiftsQuery = supabase
        .from("shifts")
        .select(`
          id,
          shift_name,
          shift_date,
          operator_id,
          operator_name,
          vehicle_entries (
            id,
            category,
            vehicle_type_id,
            vehicle_types (type_name, category)
          )
        `)
        .gte("shift_date", format(start, "yyyy-MM-dd"))
        .lte("shift_date", format(end, "yyyy-MM-dd"));

      if (shiftFilter !== "All") {
        shiftsQuery = shiftsQuery.eq("shift_name", shiftFilter);
      }
      if (operatorFilter !== "all") {
        shiftsQuery = shiftsQuery.eq("operator_id", operatorFilter);
      }

      const { data: shifts, error: shiftsError } = await shiftsQuery;
      if (shiftsError) throw shiftsError;

      // Fetch profiles for operator names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username");

      // Create profiles map
      const profilesMap = profiles?.reduce((acc: Record<string, any>, p) => ({
        ...acc,
        [p.id]: p
      }), {}) || {};

      // Fetch payments for the period (Paid only)
      let paymentsQuery = supabase
        .from("payments")
        .select("*, vehicle_entries(category)")
        .eq("payment_status", "Paid")
        .gte("paid_at", start.toISOString())
        .lte("paid_at", end.toISOString());

      if (operatorFilter !== "all") {
        paymentsQuery = paymentsQuery.eq("cashier_id", operatorFilter);
      }

      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Fetch penalties for the period
      let penaltiesQuery = supabase
        .from("penalties")
        .select("*")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (operatorFilter !== "all") {
        penaltiesQuery = penaltiesQuery.eq("operator_id", operatorFilter);
      }

      const { data: penalties, error: penaltiesError } = await penaltiesQuery;
      if (penaltiesError) throw penaltiesError;

      return { shifts, payments, penalties, profilesMap };
    },
  });

  // Process data for charts and tables
  const processedData = analyticsData && operators
    ? (() => {
      const { shifts, payments, penalties, profilesMap } = analyticsData as any;

      // Helper to get operator name with fallbacks
      const getOperatorName = (operatorId: string | null) => {
        if (operatorId && profilesMap?.[operatorId]) {
          const profile = profilesMap[operatorId];
          if (profile.full_name && profile.full_name !== "User") {
            return profile.full_name;
          }
          if (profile.username) {
            return profile.username;
          }
        }
        return "Unknown";
      };

      // 1. Operator Performance (Group directly by cashier_id)
      const operatorMap = new Map();

      // Process payments (Reliable - has cashier_id)
      payments?.forEach((p: any) => {
        const opId = p.cashier_id;
        if (!opId) return;

        if (!operatorMap.has(opId)) {
          operatorMap.set(opId, {
            operator_name: getOperatorName(opId),
            vehicle_count: 0,
            total_collected: 0,
            penalties_count: 0,
            shifts_worked: new Set(),
          });
        }
        const opData = operatorMap.get(opId);
        opData.total_collected += parseFloat(p.amount.toString());
        opData.vehicle_count++;
      });

      // Process penalties (Fallback to time-window if operator_id missing, or just link to creator)
      penalties?.forEach((p: any) => {
        const opId = p.operator_id || p.user_id; // Check both common naming patterns
        if (!opId) return; // For now, skip if unknown

        if (!operatorMap.has(opId)) {
          operatorMap.set(opId, {
            operator_name: getOperatorName(opId),
            vehicle_count: 0,
            total_collected: 0,
            penalties_count: 0,
            shifts_worked: new Set(),
          });
        }
        const opData = operatorMap.get(opId);
        opData.total_collected += parseFloat(p.amount.toString());
        opData.penalties_count++;
      });

      // Track shifts worked for operators
      shifts?.forEach((s: any) => {
        if (s.operator_id && operatorMap.has(s.operator_id)) {
          operatorMap.get(s.operator_id).shifts_worked.add(`${s.shift_date}_${s.shift_name}`);
        }
      });

      const operatorStats = Array.from(operatorMap.values()).map(op => ({
        ...op,
        shifts_worked: op.shifts_worked.size || 1
      })).sort((a, b) => b.total_collected - a.total_collected);

      // 2. Collections by Shift (Group by time windows)
      const dayMap = new Map();
      // Initialize buckets for the chart
      const days = timePeriod === "daily" ? 1 : timePeriod === "weekly" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        dayMap.set(`${d}_Day`, { date: d, shift_name: "Day", total_collected: 0, jv_count: 0, mv_count: 0 });
        dayMap.set(`${d}_Night`, { date: d, shift_name: "Night", total_collected: 0, jv_count: 0, mv_count: 0 });
      }

      payments?.forEach((p: any) => {
        const date = p.paid_at.split('T')[0];
        const time = new Date(p.paid_at).getHours();
        const shiftType = (time >= 7 && time < 18) ? "Day" : "Night";
        const key = `${date}_${shiftType}`;
        if (dayMap.has(key)) {
          dayMap.get(key).total_collected += parseFloat(p.amount.toString());
        }
      });

      penalties?.forEach((p: any) => {
        const date = p.created_at.split('T')[0];
        const time = new Date(p.created_at).getHours();
        const shiftType = (time >= 7 && time < 18) ? "Day" : "Night";
        const key = `${date}_${shiftType}`;
        if (dayMap.has(key)) {
          dayMap.get(key).total_collected += parseFloat(p.amount.toString());
        }
      });

      const shiftData = Array.from(dayMap.values()).filter(d => d.total_collected > 0 || d.date === format(new Date(), "yyyy-MM-dd"));

      // 3. Category Data
      const jvCount = payments?.filter((p: any) => p.vehicle_entries?.category?.startsWith("JV")).length || 0;
      const mvCount = (payments?.length || 0) - jvCount;

      return {
        shiftCollections: shiftData,
        operatorPerformance: operatorStats,
        totalVehicles: payments?.length || 0,
        totalCollections: operatorStats.reduce((sum, s) => sum + s.total_collected, 0),
        totalPenalties: penalties?.length || 0,
        categoryData: [
          { name: "JV Vehicles", value: jvCount },
          { name: "MV Vehicles", value: mvCount },
        ],
      };
    })()
    : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-8 w-8" />
            Shift Analytics Dashboard
          </h1>
          <p className="text-muted-foreground">Performance trends and insights</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Period</label>
              <Tabs value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift</label>
              <Select value={shiftFilter} onValueChange={(v) => setShiftFilter(v as ShiftFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Shifts</SelectItem>
                  <SelectItem value="Day">Day Shift</SelectItem>
                  <SelectItem value="Night">Night Shift</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Operator</label>
              <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Operators</SelectItem>
                  {operators?.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.full_name || op.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {processedData && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{processedData.totalVehicles}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Total Collections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{processedData.totalCollections.toLocaleString()} TShs</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Total Penalties
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{processedData.totalPenalties}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg per Vehicle</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {processedData.totalVehicles > 0
                  ? Math.round(processedData.totalCollections / processedData.totalVehicles).toLocaleString()
                  : 0}{" "}
                TShs
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {processedData && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Collections by Shift</CardTitle>
              <CardDescription>Compare Day vs Night shift performance</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  Day: { label: "Day Shift", color: COLORS.Day },
                  Night: { label: "Night Shift", color: COLORS.Night },
                }}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processedData.shiftCollections}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MMM dd")} />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="total_collected" fill={COLORS.Day} name="Collections" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vehicle Category Distribution</CardTitle>
              <CardDescription>JV vs MV vehicle breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  JV: { label: "JV Vehicles", color: COLORS.JV },
                  MV: { label: "MV Vehicles", color: COLORS.MV },
                }}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={processedData.categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {processedData.categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.JV : COLORS.MV} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Operator Performance Table */}
      {processedData && processedData.operatorPerformance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Operator Performance
            </CardTitle>
            <CardDescription>Ranked by total collections</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Operator Name</TableHead>
                  <TableHead>Vehicles Processed</TableHead>
                  <TableHead>Total Collections</TableHead>
                  <TableHead>Penalties</TableHead>
                  <TableHead>Shifts Worked</TableHead>
                  <TableHead>Avg per Shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedData.operatorPerformance.map((operator, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-bold">{index + 1}</TableCell>
                    <TableCell className="font-medium">{operator.operator_name || "Unknown"}</TableCell>
                    <TableCell>{operator.vehicle_count}</TableCell>
                    <TableCell className="font-bold">TShs {operator.total_collected.toLocaleString()}</TableCell>
                    <TableCell className="text-destructive">{operator.penalties_count}</TableCell>
                    <TableCell>{operator.shifts_worked}</TableCell>
                    <TableCell>
                      TShs {Math.round(operator.total_collected / operator.shifts_worked).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
