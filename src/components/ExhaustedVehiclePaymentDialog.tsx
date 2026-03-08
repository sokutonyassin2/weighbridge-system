import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import { getShortEntryId } from "@/lib/utils";
import { format } from "date-fns";

interface ExhaustedVehiclePaymentDialogProps {
  vehicleNo: string;
  entryId: string;
  originalAmount: number;
  vehicleData: any;
  paymentReason?: string;
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
}

export function ExhaustedVehiclePaymentDialog({
  vehicleNo,
  entryId,
  originalAmount,
  vehicleData,
  paymentReason = "Exhausted all 3 weigh attempts",
  isOpen,
  onClose,
  onPaymentComplete,
}: ExhaustedVehiclePaymentDialogProps) {
  const queryClient = useQueryClient();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      const receiptNumber = `RCP-${Date.now()}`;
      const operatorName = userProfile?.full_name && userProfile.full_name !== 'User'
        ? userProfile.full_name
        : userProfile?.username || 'Unknown Operator';

      // Determine payment type based on reason
      const isOverdueReason = paymentReason.toLowerCase().includes("12-hour") ||
        paymentReason.toLowerCase().includes("overdue");
      const paymentType = isOverdueReason ? "Overdue Return Penalty" : "Exhausted Attempts Penalty";

      // 1. Create payment record
      const { error: paymentError } = await supabase.from("payments").insert({
        entry_id: entryId,
        vehicle_no: vehicleNo,
        payment_type: paymentType,
        amount: originalAmount,
        penalty_fee: originalAmount,
        payment_status: "Paid",
        paid_at: new Date().toISOString(),
        receipt_number: receiptNumber,
        cashier_id: user?.id,
        cashier_name: operatorName,
        notes: `Penalty: ${paymentReason}`,
      });

      // If it's a duplicate key error (23505), it means payment was already recorded
      // in a previous attempt, so we should just proceed to update the entry.
      if (paymentError && paymentError.code !== '23505') throw paymentError;

      // 4. Get or create current active shift (don't use old entry's shift)
      const today = format(new Date(), "yyyy-MM-dd");
      const currentHour = new Date().getHours();
      const shiftName = currentHour >= 7 && currentHour < 18 ? "Day" : "Night";

      // CRITICAL FIX: Order by start_time and limit 1 to handle duplicate shift rows
      let { data: currentShift, error: selectShiftError } = await supabase
        .from("shifts")
        .select("id")
        .eq("shift_date", today)
        .eq("shift_name", shiftName)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectShiftError) {
        console.error("Error selecting shift:", selectShiftError);
        throw new Error(`Error identifying current shift: ${selectShiftError.message}`);
      }

      if (!currentShift) {
        const { data: newShift, error: createShiftError } = await supabase
          .from("shifts")
          .insert({
            shift_date: today,
            shift_name: shiftName,
            operator_id: user?.id,
            operator_name: operatorName,
            start_time: new Date().toISOString()
          })
          .select()
          .single();

        if (createShiftError) {
          console.error("Error creating shift:", createShiftError);
          throw new Error(`Failed to create a new shift: ${createShiftError.message}`);
        }
        currentShift = newShift;
      }

      if (!currentShift) {
        throw new Error("Could not determine current shift. Please start a shift manually.");
      }

      // 4b. Update OLD entry's shift_id to current shift so penalty payment shows in correct shift report
      await supabase
        .from("vehicle_entries")
        .update({ shift_id: currentShift.id })
        .eq("id", entryId);

      // PRE-CHECK: Ensure no active entry already exists to avoid duplicates
      const { data: existingActive } = await supabase
        .from("vehicle_entries")
        .select("id")
        .eq("vehicle_no", vehicleNo)
        .eq("completed", false)
        .neq("id", entryId) // CRITICAL: Exclude the current entry we are trying to unlock
        .maybeSingle();

      if (existingActive) {
        // If entry already exists, use it instead of creating new
        console.log("Active entry already exists found, skipping creation:", existingActive.id);

        // Still update the CURRENT entry's pending_weighs so it resets nicely for this specific UI view
        await supabase
          .from("pending_weighs")
          .update({
            payment_required: false,
            weigh_attempts: 0,
            payment_required_reason: null,
            payment_status: "Paid",
          })
          .eq("entry_id", entryId);

        // Log activity
        await supabase.from("activity_logs").insert({
          user_id: user?.id,
          user_name: operatorName,
          user_role: "operator",
          action: "Penalty Payment Processed",
          details: `Penalty paid for ${vehicleNo}. Reused existing active entry ${existingActive.id} instead of creating duplicate.`,
        });

        queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
        queryClient.invalidateQueries({ queryKey: ["overdue-pending"] });
        queryClient.invalidateQueries({ queryKey: ["payments"] });
        queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
        queryClient.invalidateQueries({ queryKey: ["penalties"] });

        toast({
          title: "✅ Payment Recorded",
          description: `Penalty payment recorded. Active entry already exists for ${vehicleNo}.`,
          duration: 5000,
        });

        onPaymentComplete();
        onClose();
        setIsProcessing(false);
        return;
      }

      // 5. Update EXISTING vehicle entry with penalty_paid_entry flag to ALLOW continuing weighing
      const { error: updateEntryError } = await supabase
        .from("vehicle_entries")
        .update({
          penalty_paid_entry: true, // Flag to skip all payments
          completed: false,
          shift_id: currentShift.id, // Update to CURRENT shift
          // DON'T change status if they already finished 1st weigh
        })
        .eq("id", entryId);

      if (updateEntryError) throw updateEntryError;

      // Reset attempts in pending_weighs
      const { error: updatePendingError } = await supabase
        .from("pending_weighs")
        .update({
          payment_required: false,
          weigh_attempts: 0,
          payment_required_reason: null,
          payment_status: "Paid",
        })
        .eq("entry_id", entryId);

      if (updatePendingError) throw updatePendingError;

      // 6. Log activity
      await supabase.from("activity_logs").insert({
        user_id: user?.id,
        user_name: operatorName,
        user_role: "operator",
        action: "Penalty Payment Processed",
        details: `Penalty paid for ${vehicleNo} (${getShortEntryId(entryId, vehicleData?.wb_number)}). Reason: ${paymentReason}. Entry unlocked for fresh weighing attempts.`,
      });

      // 7. Invalidate queries to sync both Dashboard and Cashier
      queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-pending"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
      queryClient.invalidateQueries({ queryKey: ["penalties"] });

      toast({
        title: "✅ Payment Recorded",
        description: `Penalty payment for ${vehicleNo} recorded. Vehicle has been unlocked for weighing.`,
        duration: 5000,
      });

      onPaymentComplete();
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            PENALTY PAYMENT REQUIRED
          </DialogTitle>
          <DialogDescription className="text-destructive font-medium">
            {paymentReason}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Vehicle Number:</span>
              <span className="text-base font-bold">{vehicleNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Entry ID:</span>
              <span className="text-base font-mono">{getShortEntryId(entryId, vehicleData?.wb_number)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Reason:</span>
              <span className="text-sm text-right text-destructive font-medium">{paymentReason}</span>
            </div>
          </div>

          <div className="border-t border-b py-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Original First Weigh Fee:</span>
              <span className="text-base">TShs {originalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-destructive">Penalty Amount:</span>
              <span className="text-xl font-bold text-destructive">
                TShs {originalAmount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Penalty equals the original payment amount
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
            <p className="font-medium mb-1">After payment:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Old entry will be marked as completed</li>
              <li>Fresh new entry will be created for {vehicleNo}</li>
              <li>New entry will have 0/3 attempts (no additional charge)</li>
              <li>12-hour window will restart</li>
              <li>Penalty payment is the only charge required</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={isProcessing} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isProcessing}
            className="flex-1 bg-success hover:bg-success/90"
          >
            {isProcessing ? "Processing..." : "Mark As Paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
