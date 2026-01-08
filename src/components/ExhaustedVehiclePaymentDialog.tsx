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

      if (paymentError) throw paymentError;

      // 2. Mark old entry as completed
      const { error: updateError } = await supabase
        .from("vehicle_entries")
        .update({ completed: true, status: "Completed" })
        .eq("id", entryId);

      if (updateError) throw updateError;

      // 3. Remove from pending_weighs
      const { error: deleteError, count } = await supabase
        .from("pending_weighs")
        .delete()
        .eq("entry_id", entryId);

      if (deleteError) {
        console.error("Failed to delete pending_weighs:", deleteError);
        throw new Error(`Failed to remove from pending queue: ${deleteError.message}`);
      }
      
      console.log(`Deleted ${count} pending_weighs records for entry ${entryId}`);

      // 4. Get or create current active shift (don't use old entry's shift)
      const today = format(new Date(), "yyyy-MM-dd");
      const currentHour = new Date().getHours();
      const shiftName = currentHour >= 7 && currentHour < 18 ? "Day" : "Night";

      let { data: currentShift } = await supabase
        .from("shifts")
        .select("id")
        .eq("shift_date", today)
        .eq("shift_name", shiftName)
        .maybeSingle();

      if (!currentShift) {
        const { data: newShift } = await supabase
          .from("shifts")
          .insert({ 
            shift_date: today, 
            shift_name: shiftName, 
            operator_id: user?.id,
            operator_name: operatorName
          })
          .select()
          .single();
        currentShift = newShift;
      }

      // 4b. Update OLD entry's shift_id to current shift so penalty payment shows in correct shift report
      await supabase
        .from("vehicle_entries")
        .update({ shift_id: currentShift.id })
        .eq("id", entryId);

      // 5. Create fresh new vehicle entry with penalty_paid_entry flag and CURRENT shift
      const { data: newEntry, error: newEntryError } = await supabase
        .from("vehicle_entries")
        .insert({
          vehicle_no: vehicleNo,
          vehicle_type_id: vehicleData?.vehicle_type_id,
          category: vehicleData?.category,
          driver_name: vehicleData?.driver_name,
          driver_contact: vehicleData?.driver_contact,
          customer_farmer_name: vehicleData?.customer_farmer_name,
          item_name: vehicleData?.item_name,
          source_destination: vehicleData?.source_destination,
          cargo_description: vehicleData?.cargo_description,
          operator_id: user?.id,
          entered_by: operatorName,
          shift_id: currentShift.id, // Use CURRENT shift, not old entry's shift
          status: "AwaitingFirstWeigh",
          completed: false,
          sent_for_weighing: false,
          penalty_paid_entry: true, // Flag to skip all payments
        })
        .select()
        .single();

      if (newEntryError) throw newEntryError;

      // 6. Log activity
      await supabase.from("activity_logs").insert({
        user_id: user?.id,
        user_name: operatorName,
        user_role: "operator",
        action: "Penalty Payment Processed",
        details: `Penalty paid for ${vehicleNo} (${getShortEntryId(entryId, vehicleData?.wb_number)}). Reason: ${paymentReason}. New entry ${getShortEntryId(newEntry.id, newEntry.wb_number)} created with fresh 0/3 attempts.`,
      });

      // 7. Invalidate queries to sync both Dashboard and Cashier
      queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-pending"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
      queryClient.invalidateQueries({ queryKey: ["penalties"] });

      // 8. Show success message
      toast({
        title: "✅ Payment Recorded",
        description: `Penalty payment for ${vehicleNo} recorded. New entry ${getShortEntryId(newEntry.id, newEntry.wb_number)} created.`,
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
