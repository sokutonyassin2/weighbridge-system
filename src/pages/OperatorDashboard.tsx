import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Plus, Scale as ScaleIcon, Sun, Moon, AlertTriangle, Power, Trash2, Clock, RefreshCw } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { getShortEntryId } from "@/lib/utils";
import { getCurrentShiftDate } from "@/lib/shiftUtils";
import offlineDataManager from "@/lib/offlineDataManager";
import { ExhaustedVehiclePaymentDialog } from "@/components/ExhaustedVehiclePaymentDialog";
import { SignatureCapture } from "@/components/SignatureCapture";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function OperatorDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, userRole, userProfile } = useAuth();
  const { toast } = useToast();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [endShiftDialogOpen, setEndShiftDialogOpen] = useState(false);
  const [shiftEnded, setShiftEnded] = useState(false);
  const [isProcessingOverdue, setIsProcessingOverdue] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isEndingShift, setIsEndingShift] = useState(false);
  const shiftAlertShownRef = useRef(false);

  // Redirect users to their specific modules if they land on root dashboard
  useEffect(() => {
    if (userRole === "logistics_admin" || userRole === "logistics_manager") {
      navigate("/logistics");
    } else if (userRole === "mechanic") {
      navigate("/garage");
    }
    // Super Admin, Admin and Operator stay on this dashboard
  }, [userRole, navigate]);

  const getCurrentShift = () => {
    const hour = new Date().getHours();
    return hour >= 7 && hour < 18 ? "Day" : "Night";
  };

  const currentShift = getCurrentShift();

  // Shift End Alert - 30 minutes before shift ends
  useEffect(() => {
    const checkShiftEndAlert = () => {
      if (shiftEnded || shiftAlertShownRef.current) return;

      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Day shift ends at 18:00, alert at 17:30
      // Night shift ends at 07:00, alert at 06:30
      const isDayShiftAlert = currentShift === "Day" && hours === 17 && minutes >= 30;
      const isNightShiftAlert = currentShift === "Night" && hours === 6 && minutes >= 30;

      if (isDayShiftAlert || isNightShiftAlert) {
        shiftAlertShownRef.current = true;
        toast({
          title: "⏰ Shift Ending Soon!",
          description: `Thank you for your hard work! Your ${currentShift} shift ends in 30 minutes. Please remember to end your shift and print the collection report before logging out.`,
          duration: 15000,
        });
      }
    };

    // Check immediately on mount
    checkShiftEndAlert();

    // Check every minute
    const interval = setInterval(checkShiftEndAlert, 60000);

    return () => clearInterval(interval);
  }, [currentShift, shiftEnded, toast]);

  // All operators see ALL pending vehicles (cross-shift) so anyone can weigh them
  const { data: pendingEntries, isLoading } = useQuery({
    queryKey: ["pending-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_entries")
        .select(`
          *,
          vehicle_types (type_name, category, first_weigh_fee),
          weigh_records (id, weigh_number),
          shifts (shift_name, shift_date)
        `)
        .eq("completed", false)
        .order("entry_time", { ascending: true });

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Optimized refresh
    staleTime: 10000,
  });

  // Helper to format shift badge with aging info
  const formatShiftBadge = (shifts: { shift_name: string; shift_date: string } | null) => {
    if (!shifts) return null;
    const shiftDate = new Date(shifts.shift_date);
    const today = new Date();
    const daysDiff = differenceInDays(today, shiftDate);

    let dateStr = "";
    if (daysDiff === 0) dateStr = "Today";
    else if (daysDiff === 1) dateStr = "Yesterday";
    else dateStr = `${daysDiff} days ago`;

    return {
      dateStr,
      shiftName: shifts.shift_name,
      daysDiff,
      isAging: daysDiff >= 1
    };
  };

  // Fetch pending_weighs to check for overdue and payment status
  const { data: pendingWeighsMap } = useQuery({
    queryKey: ["pending-weighs-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_weighs")
        .select("*")
        .eq("return_status", "Pending");

      if (error) throw error;
      // Create a map by entry_id for easy lookup
      return data?.reduce((acc: Record<string, any>, pw) => ({
        ...acc,
        [pw.entry_id as string]: pw
      }), {}) || {};
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: shiftStats } = useQuery({
    queryKey: ["shift-stats", currentShift],
    queryFn: async () => {
      const today = getCurrentShiftDate();

      // Query 1: ALL pending vehicles system-wide (cross-shift)
      const { data: allPending, error: pendingError } = await supabase
        .from("vehicle_entries")
        .select("id")
        .eq("completed", false);

      if (pendingError) throw pendingError;

      // Query 2: Completed vehicles in CURRENT shift only
      const { data: shiftCompleted, error: completedError } = await supabase
        .from("vehicle_entries")
        .select(`
          id,
          shifts!inner (shift_name, shift_date)
        `)
        .eq("completed", true)
        .eq("shifts.shift_date", today)
        .eq("shifts.shift_name", currentShift);

      if (completedError) throw completedError;

      return {
        pending: allPending?.length || 0,           // ALL pending, cross-shift
        completed: shiftCompleted?.length || 0,     // Only current shift completed
      };
    },
    staleTime: 10000,
  });

  const handleEndShift = async () => {
    if (!user?.id || !userProfile) return;

    if (!signatureDataUrl) {
      toast({
        variant: "destructive",
        title: "Signature Required",
        description: "Please sign to confirm shift end.",
      });
      return;
    }

    setIsEndingShift(true);

    try {
      const today = getCurrentShiftDate();

      // Upload signature to storage
      let signatureUrl = null;
      try {
        const signatureBlob = await fetch(signatureDataUrl).then(r => r.blob());
        const fileName = `signatures/${user.id}_${today}_${currentShift}_${Date.now()}.png`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("vehicle-photos")
          .upload(fileName, signatureBlob, {
            contentType: "image/png",
            upsert: true,
          });

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage
            .from("vehicle-photos")
            .getPublicUrl(fileName);
          signatureUrl = urlData?.publicUrl;
        }
      } catch (uploadErr) {
        console.error("Signature upload failed:", uploadErr);
        // Continue even if signature upload fails - still end the shift
      }

      // Update shift end_time with signature
      const { error } = await supabase
        .from("shifts")
        .update({
          end_time: new Date().toISOString(),
          operator_name: userProfile.full_name || userProfile.username,
          signature_url: signatureUrl,
        })
        .eq("shift_date", today)
        .eq("shift_name", currentShift)
        .eq("operator_id", user.id);

      if (error) throw error;

      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        user_name: userProfile.full_name || userProfile.username || "Unknown",
        user_role: userRole as any,
        action: "Shift Ended",
        details: `Shift ended for ${currentShift} on ${today} - ${shiftStats?.completed || 0} vehicles completed. Signature captured.`,
      });

      setShiftEnded(true);
      setEndShiftDialogOpen(false);
      setSignatureDataUrl(null);

      toast({
        title: "Shift Ended",
        description: `${currentShift} shift has been ended with signature recorded. Please logout for handover.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsEndingShift(false);
    }
  };

  const handleDeleteVehicle = async (entryId: string, vehicleNo: string, weighCount: number) => {
    if (weighCount > 0) {
      toast({
        variant: "destructive",
        title: "Cannot Delete Vehicle",
        description: "This vehicle has already been weighed and cannot be deleted.",
        duration: 5000,
      });

      // Log the failed attempt
      await supabase.from("activity_logs").insert({
        user_id: user?.id || "",
        user_name: userProfile?.full_name || userProfile?.username || "Unknown",
        user_role: userRole as any,
        action: "Vehicle Deletion Attempt - BLOCKED",
        details: `Attempted to delete entry for vehicle ${vehicleNo} (${getShortEntryId(entryId, 0)}) with ${weighCount}/3 weighs. Deletion blocked.`,
      });

      return;
    }

    try {
      // Delete the vehicle entry and check if it was actually deleted
      const { error, data } = await supabase
        .from("vehicle_entries")
        .delete()
        .eq("id", entryId)
        .select();

      if (error) throw error;

      // Check if actually deleted (RLS might silently block)
      if (!data || data.length === 0) {
        throw new Error("Unable to delete vehicle. You may not have permission or the vehicle has already been weighed.");
      }

      // Log successful deletion
      await supabase.from("activity_logs").insert({
        user_id: user?.id || "",
        user_name: userProfile?.full_name || userProfile?.username || "Unknown",
        user_role: userRole as any,
        action: "Vehicle Deleted",
        details: `Vehicle ${vehicleNo} (${getShortEntryId(entryId, 0)}) deleted before weighing (0/3 weighs)`,
      });

      toast({
        title: "Vehicle Deleted",
        description: `Vehicle ${vehicleNo} has been removed from the system.`,
      });

      queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleManualOverdueCheck = async () => {
    setIsProcessingOverdue(true);
    try {
      // Get count of overdue vehicles before processing
      const { data: overdueBeforeData } = await supabase
        .from("pending_weighs")
        .select("id")
        .not("expected_return_time", "is", null)
        .lt("expected_return_time", new Date().toISOString())
        .eq("return_status", "Pending")
        .eq("is_overdue", false);

      const overdueCount = overdueBeforeData?.length || 0;

      // Call the database function to check and move overdue vehicles
      const { error } = await supabase.rpc('check_and_mark_overdue_vehicles');

      if (error) throw error;

      // Log the action
      await supabase.from("activity_logs").insert({
        user_id: user?.id || "",
        user_name: userProfile?.full_name || userProfile?.username || "Unknown",
        user_role: userRole,
        action: "Manual Overdue Check",
        details: `Manually triggered overdue vehicle check. ${overdueCount} vehicle(s) processed.`,
      });

      toast({
        title: "✅ Overdue Check Complete",
        description: overdueCount > 0
          ? `${overdueCount} vehicle(s) exceeded the 12-hour return window and have been moved to overdue history.`
          : "No overdue vehicles found. All pending vehicles are within the return window.",
        duration: 6000,
      });

      queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["pending-weighs-map"] });
      queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsProcessingOverdue(false);
    }
  };

  // Test shift end alert (admin/development use)
  const handleTestShiftAlert = () => {
    toast({
      title: "⏰ Shift Ending Soon!",
      description: `Thank you for your hard work! Your ${currentShift} shift ends in 30 minutes. Please remember to end your shift and print the collection report before logging out.`,
      duration: 15000,
    });
  };

  const ShiftIcon = currentShift === "Day" ? Sun : Moon;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header - Responsive */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <img
            src="/images/energy-feeds-logo.jpg"
            alt="Energy Feeds"
            className="h-8 md:h-10 object-contain"
          />
          <div>
            <div className="flex items-center gap-2 mb-1 md:mb-2 flex-wrap">
              <h1 className="text-xl md:text-3xl font-bold">Dashboard</h1>
              <Badge variant={currentShift === "Day" ? "default" : "secondary"} className="animate-pulse-soft">
                <ShiftIcon className="mr-1 h-3 w-3" />
                {currentShift} Shift
              </Badge>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground">
              {shiftEnded
                ? "Shift ended - Please logout for handover"
                : "Manage vehicle entries and weighing operations"}
            </p>
          </div>
        </div>

        {/* Action Buttons - Responsive */}
        <div className="flex gap-2 flex-wrap">
          {!shiftEnded && (
            <>
              <Button
                onClick={handleManualOverdueCheck}
                size="sm"
                variant="outline"
                disabled={isProcessingOverdue}
                className="border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold text-xs md:text-sm"
              >
                <AlertTriangle className={`mr-1 md:mr-2 h-4 w-4 ${isProcessingOverdue ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{isProcessingOverdue ? 'Checking...' : 'Check Overdue'}</span>
                <span className="sm:hidden">{isProcessingOverdue ? '...' : 'Overdue'}</span>
              </Button>
              <Button onClick={() => navigate("/entry")} size="sm" className="text-xs md:text-sm">
                <Plus className="mr-1 md:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Vehicle Entry</span>
                <span className="sm:hidden">New</span>
              </Button>
              <Button onClick={() => setEndShiftDialogOpen(true)} size="sm" variant="destructive" className="text-xs md:text-sm">
                <Power className="mr-1 md:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">End Shift</span>
                <span className="sm:hidden">End</span>
              </Button>
              {/* Admin-only test button for shift alert */}
              {userRole === "admin" && (
                <Button onClick={handleTestShiftAlert} size="sm" variant="ghost" className="text-xs hidden md:flex">
                  🔔 Test Alert
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Cards - Responsive Grid */}
      <div className="grid gap-3 md:gap-4 grid-cols-2">
        <Card className="card-hover animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Total Pending</CardTitle>
            <CardDescription className="text-[10px] md:text-xs hidden sm:block">All pending vehicles</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold text-warning">
              {pendingEntries?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Completed This Shift</CardTitle>
            <CardDescription className="text-[10px] md:text-xs hidden sm:block">{currentShift} shift today</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold text-success">
              {shiftStats?.completed || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vehicles Table - Responsive with horizontal scroll */}
      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg">Vehicles Awaiting Weighing</CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Click on a vehicle to enter weight data
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !pendingEntries || pendingEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No vehicles currently awaiting weighing
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Vehicle No</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Type</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Entry Shift</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Entry Time</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Weighs</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingEntries.map((entry) => {
                    const dbWeighCount = entry.weigh_records?.length || 0;
                    const pendingOfflineCount = offlineDataManager.getPendingCount(entry.id, 'weigh_record');
                    const weighCount = dbWeighCount + pendingOfflineCount;

                    const isMVCategory = entry.category && ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(entry.category);
                    const isExhausted = !isMVCategory && weighCount >= 3;
                    const pendingWeigh = pendingWeighsMap?.[entry.id];
                    const isTimeOverdue = pendingWeigh?.expected_return_time &&
                      new Date(pendingWeigh.expected_return_time) < new Date();

                    // Only exhausted attempts (3/3) require payment
                    // Time-based overdue vehicles just need to be moved to history (no payment)
                    const requiresPayment = isExhausted; // All exhausted vehicles require payment
                    const requiresMoveToHistory = isTimeOverdue && !isExhausted;

                    const paymentReason = isExhausted
                      ? "Exhausted all 3 weigh attempts"
                      : "";

                    const penaltyAmount = pendingWeigh?.payment_amount ||
                      (entry.vehicle_types?.first_weigh_fee || 0);

                    const shiftInfo = formatShiftBadge(entry.shifts as any);

                    return (
                      <TableRow
                        key={entry.id}
                        className={
                          isMVCategory
                            ? "bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500"
                            : requiresPayment
                              ? "bg-destructive/5"
                              : shiftInfo?.isAging
                                ? "bg-orange-50/50 dark:bg-orange-950/20"
                                : ""
                        }
                      >
                        <TableCell className="font-medium">
                          <div>{entry.vehicle_no}</div>
                          <div className="text-xs text-muted-foreground font-mono">{getShortEntryId(entry.id, entry.wb_number)}</div>
                        </TableCell>
                        <TableCell>{entry.vehicle_types?.type_name}</TableCell>
                        <TableCell>
                          {(() => {
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
                          {format(new Date(entry.entry_time), "MMM dd, HH:mm")}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={entry.status} category={entry.category} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={requiresPayment ? "destructive" : "secondary"}>
                            {isMVCategory ? (
                              weighCount === 0 ? "1st Weigh" : "2nd Weigh"
                            ) : (
                              <>
                                {weighCount}/3 {isExhausted && "- EXHAUSTED"}
                                {!isExhausted && isTimeOverdue && "- OVERDUE"}
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {requiresPayment ? (
                            <div className="space-y-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setSelectedVehicle({
                                    ...entry,
                                    paymentReason,
                                    penaltyAmount,
                                  });
                                  setPaymentDialogOpen(true);
                                }}
                              >
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                Payment Required
                              </Button>
                              <p className="text-xs text-destructive">{paymentReason}</p>
                            </div>
                          ) : requiresMoveToHistory ? (
                            <div className="space-y-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                onClick={async () => {
                                  try {
                                    // Move to overdue history without payment
                                    await supabase.from("overdue_vehicles_history").insert({
                                      entry_id: entry.id,
                                      vehicle_no: entry.vehicle_no,
                                      category: entry.category,
                                      first_weigh_time: pendingWeigh?.first_weigh_time,
                                      overdue_time: new Date().toISOString(),
                                      shift_id: entry.shift_id,
                                      shift_name: entry.shifts?.shift_name,
                                      shift_date: entry.shifts?.shift_date,
                                      notes: "Manually moved to overdue history - exceeded 12-hour return window"
                                    });

                                    // Mark entry as completed
                                    await supabase.from("vehicle_entries")
                                      .update({ completed: true, status: "Overdue-Removed" })
                                      .eq("id", entry.id);

                                    // Delete from pending_weighs
                                    await supabase.from("pending_weighs")
                                      .delete()
                                      .eq("entry_id", entry.id);

                                    // Log activity
                                    await supabase.from("activity_logs").insert({
                                      user_id: user?.id || "",
                                      user_name: userProfile?.full_name || userProfile?.username || "Unknown",
                                      user_role: userRole,
                                      action: "Vehicle Moved to Overdue History",
                                      details: `Vehicle ${entry.vehicle_no} moved to overdue history (exceeded 12-hour window)`,
                                    });

                                    toast({
                                      title: "Vehicle Moved",
                                      description: `${entry.vehicle_no} moved to overdue history. Can be re-added as new entry.`,
                                    });

                                    queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
                                    queryClient.invalidateQueries({ queryKey: ["pending-weighs-map"] });
                                  } catch (error: any) {
                                    toast({
                                      variant: "destructive",
                                      title: "Error",
                                      description: error.message,
                                    });
                                  }
                                }}
                              >
                                <Clock className="mr-2 h-4 w-4" />
                                Move to History
                              </Button>
                              <p className="text-xs text-orange-600">Exceeded 12hr window</p>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => navigate(`/weigh/${entry.id}`)}
                              >
                                <ScaleIcon className="mr-2 h-4 w-4" />
                                Weigh
                              </Button>
                              {weighCount === 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteVehicle(entry.id, entry.vehicle_no, weighCount)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ExhaustedVehiclePaymentDialog
        vehicleNo={selectedVehicle?.vehicle_no || ""}
        entryId={selectedVehicle?.id || ""}
        originalAmount={selectedVehicle?.penaltyAmount || selectedVehicle?.vehicle_types?.first_weigh_fee || 0}
        vehicleData={selectedVehicle}
        paymentReason={selectedVehicle?.paymentReason || "Payment Required"}
        isOpen={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        onPaymentComplete={() => {
          setPaymentDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
          queryClient.invalidateQueries({ queryKey: ["pending-weighs-map"] });
          queryClient.invalidateQueries({ queryKey: ["overdue-pending"] });
          queryClient.invalidateQueries({ queryKey: ["payments"] });
          queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
        }}
      />

      <AlertDialog open={endShiftDialogOpen} onOpenChange={(open) => {
        setEndShiftDialogOpen(open);
        if (!open) setSignatureDataUrl(null);
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>End {currentShift} Shift?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>This will end your current shift. You will no longer be able to add new vehicle entries.</p>
                <div className="mt-4 space-y-2 text-sm">
                  <p><strong>Shift Summary:</strong></p>
                  <p>Completed This Shift: {shiftStats?.completed || 0}</p>
                  <p>Pending (All Shifts): {shiftStats?.pending || 0}</p>
                </div>
                <div className="mt-4">
                  <SignatureCapture
                    onSignatureChange={setSignatureDataUrl}
                    disabled={isEndingShift}
                  />
                </div>
                <p className="mt-4 font-semibold text-foreground">After ending shift, please logout for operator handover.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEndingShift}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndShift}
              disabled={!signatureDataUrl || isEndingShift}
            >
              {isEndingShift ? "Ending..." : "End Shift"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
