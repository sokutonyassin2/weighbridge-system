import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Clock, AlertTriangle, CheckCircle, DollarSign, Sun, Moon } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import offlineDataManager from "@/lib/offlineDataManager";

export default function PendingWeighs() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: pendingWeighs, isLoading, refetch } = useQuery({
    queryKey: ["pending-weighs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_weighs")
        .select(`
          *,
          vehicle_entries!inner (
            shifts (shift_name, shift_date)
          )
        `)
        .order("expected_return_time", { ascending: true });

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Auto-cleanup overdue vehicles on mount
  useEffect(() => {
    const checkOverdue = async () => {
      try {
        await supabase.rpc('check_and_mark_overdue_vehicles');
        refetch(); // Refresh list after cleanup
      } catch (e) {
        console.error("Failed to auto-cleanup overdue:", e);
      }
    };
    checkOverdue();
  }, []); // Run once on mount

  // Helper to format shift badge with aging info
  const formatShiftBadge = (vehicleEntry: { shifts: { shift_name: string; shift_date: string } | null } | null) => {
    if (!vehicleEntry?.shifts) return null;
    const shiftDate = new Date(vehicleEntry.shifts.shift_date);
    const today = new Date();
    const daysDiff = differenceInDays(today, shiftDate);

    let dateStr = "";
    if (daysDiff === 0) dateStr = "Today";
    else if (daysDiff === 1) dateStr = "Yesterday";
    else dateStr = `${daysDiff} days ago`;

    return {
      dateStr,
      shiftName: vehicleEntry.shifts.shift_name,
      daysDiff,
      isStale: daysDiff >= 3,
      isAging: daysDiff >= 1
    };
  };

  const now = new Date();

  // Split pending vehicles:
  // - activePending: Within 12hr window and < 3 attempts
  // - exhaustedPending: Vehicles with payment_required (exhausted attempts only)
  // Note: Time-based overdue vehicles are now auto-removed to overdue_vehicles_history
  const activePending = pendingWeighs?.filter((pw) => {
    const dbAttempts = pw.weigh_attempts || 0;
    const pendingOffline = offlineDataManager.getPendingCount(pw.entry_id, 'weigh_record');
    const totalAttempts = dbAttempts + pendingOffline;

    return !pw.payment_required &&
      (!pw.expected_return_time || new Date(pw.expected_return_time) >= now) &&
      totalAttempts < 3;
  }) || [];

  // Only show exhausted attempts (3/3) requiring payment, NOT time-based overdue
  const exhaustedPending = pendingWeighs?.filter((pw) => {
    const dbAttempts = pw.weigh_attempts || 0;
    const pendingOffline = offlineDataManager.getPendingCount(pw.entry_id, 'weigh_record');
    const totalAttempts = dbAttempts + pendingOffline;

    return pw.payment_required || totalAttempts >= 3;
  }) || [];

  const handleMarkComplete = async (entryId: string, vehicleNo: string) => {
    setProcessingId(entryId);
    try {
      const { error: updateError } = await supabase
        .from("vehicle_entries")
        .update({ status: "Completed", completed: true })
        .eq("id", entryId);

      if (updateError) throw updateError;

      const { error: deleteError } = await supabase
        .from("pending_weighs")
        .delete()
        .eq("entry_id", entryId);

      if (deleteError) throw deleteError;

      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: user?.id,
        user_name: userProfile?.full_name || "Unknown",
        user_role: "operator",
        action: "Vehicle Completed",
        details: `Manually marked vehicle ${vehicleNo} as completed from pending weighs`,
      });

      toast({
        title: "Vehicle Completed",
        description: `Vehicle ${vehicleNo} marked as completed`,
      });

      refetch();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pending Weighs</h1>
        <p className="text-muted-foreground">
          Time-sensitive vehicles awaiting return weighing
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-600" />
              Active Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activePending.length}</div>
            <p className="text-xs text-muted-foreground">Within 12-hour window</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Exhausted Attempts - Payment Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{exhaustedPending.length}</div>
            <p className="text-xs text-muted-foreground">Used all 3 weigh attempts</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Pending Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-green-600" />
            Active Pending Vehicles
          </CardTitle>
          <CardDescription>
            Vehicles within 12-hour return window
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : activePending.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active pending vehicles
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Entry Shift</TableHead>
                  <TableHead>First Weigh</TableHead>
                  <TableHead>Expected Return</TableHead>
                  <TableHead>Time Remaining</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePending.map((pending) => {
                  const timeRemaining = pending.expected_return_time
                    ? (() => {
                      const diff = new Date(pending.expected_return_time).getTime() - now.getTime();
                      if (diff <= 0) return "Overdue";
                      const hours = Math.floor(diff / (1000 * 60 * 60));
                      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                      return `${hours}h ${minutes}m`;
                    })()
                    : "N/A";
                  const hoursRemaining = pending.expected_return_time
                    ? Math.floor((new Date(pending.expected_return_time).getTime() - now.getTime()) / (1000 * 60 * 60))
                    : 999;

                  return (
                    <TableRow key={pending.id} className={hoursRemaining < 2 ? "bg-yellow-50" : ""}>
                      <TableCell className="font-medium">{pending.vehicle_no}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{pending.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const shiftInfo = formatShiftBadge(pending.vehicle_entries as any);
                          if (!shiftInfo) return <span className="text-muted-foreground">-</span>;
                          const isDay = shiftInfo.shiftName === "Day";
                          return (
                            <Badge
                              variant="outline"
                              className={
                                shiftInfo.isAging
                                  ? "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700"
                                  : isDay
                                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                              }
                            >
                              {shiftInfo.isAging && <Clock className="h-3 w-3 mr-1" />}
                              {!shiftInfo.isAging && (isDay ? <Sun className="h-3 w-3 mr-1" /> : <Moon className="h-3 w-3 mr-1" />)}
                              {shiftInfo.dateStr} {shiftInfo.shiftName}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {pending.first_weigh_time
                          ? format(new Date(pending.first_weigh_time), "MMM dd, HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {pending.expected_return_time
                          ? format(new Date(pending.expected_return_time), "MMM dd, HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell className={hoursRemaining < 2 ? "text-yellow-600 font-medium" : ""}>
                        {timeRemaining}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const dbAttempts = pending.weigh_attempts || 0;
                          const pendingOffline = offlineDataManager.getPendingCount(pending.entry_id, 'weigh_record');
                          const totalAttempts = dbAttempts + pendingOffline;
                          return (
                            <Badge variant={totalAttempts >= 2 ? "destructive" : "secondary"}>
                              {totalAttempts + 1}/3
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          On Time
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Exhausted Attempts Section - Only for vehicles with 3/3 attempts */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Exhausted Attempts - Payment Required
          </CardTitle>
          <CardDescription>
            Vehicles that used all 3 weigh attempts. Payment required before re-weighing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exhaustedPending.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No vehicles with exhausted attempts
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Entry Shift</TableHead>
                  <TableHead>First Weigh</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exhaustedPending.map((pending) => {
                  return (
                    <TableRow key={pending.id} className="bg-destructive/5">
                      <TableCell className="font-medium">{pending.vehicle_no}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{pending.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const shiftInfo = formatShiftBadge(pending.vehicle_entries as any);
                          if (!shiftInfo) return <span className="text-muted-foreground">-</span>;
                          const isDay = shiftInfo.shiftName === "Day";
                          return (
                            <Badge
                              variant="outline"
                              className="bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {shiftInfo.dateStr} {shiftInfo.shiftName}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {pending.first_weigh_time
                          ? format(new Date(pending.first_weigh_time), "MMM dd, HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">3/3 - EXHAUSTED</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          Payment Required
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate("/cashier")}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          View in Cashier
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info about overdue vehicles */}
      <Card className="border-muted">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Vehicles that exceed the 12-hour return window are automatically moved to{" "}
            <a href="/overdue-history" className="text-primary hover:underline">Overdue History</a> and can be re-added as new entries.
            Only "Exhausted Attempts" (3/3 attempts used) require penalty payment before re-weighing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
