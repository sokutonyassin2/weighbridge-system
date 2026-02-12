import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Scale as ScaleIcon, Printer, Camera, AlertTriangle, CheckCircle, Wifi, WifiOff } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { getCurrentShiftDate, getCurrentShiftName } from "@/lib/shiftUtils";
import { getShortEntryId } from "@/lib/utils";
import QRCode from "react-qr-code";
import { CameraCaptureButton } from "@/components/CameraCaptureButton";
import { WeightCaptureButtons } from "@/components/WeightCaptureButtons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import offlineDataManager from "@/lib/offlineDataManager";
import useOffline from "@/hooks/useOffline";

export default function WeighEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const [automaticMode, setAutomaticMode] = useState(false);
  const [requireImageCapture, setRequireImageCapture] = useState(false);
  const [hardwareIntegrationEnabled, setHardwareIntegrationEnabled] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [pendingSubmitEvent, setPendingSubmitEvent] = useState<React.FormEvent | null>(null);

  const { isOffline, pendingItems, isSyncing } = useOffline();

  // Function to determine new status based on vehicle type, weigh count, and complete checkbox
  const determineNewStatus = () => {
    let newStatus = entry?.status;

    // MV vehicles: auto-complete after second weigh (they only have 2 weighs total)
    const isMVVehicle = ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(entry?.category || "");
    const isSecondWeighForMV = isMVVehicle && weighCount === 1; // weighCount is before this weigh, so 1 = this is the 2nd weigh

    if (weighData.complete_vehicle) {
      // Vehicle marked as complete on ANY weigh (no weight exceedance)
      newStatus = "Completed";
    } else if (isSecondWeighForMV) {
      // MV vehicles: auto-complete after second weigh
      newStatus = "Completed";
    } else if (isFirstWeigh) {
      if (entry?.vehicle_types?.requires_two_weighs) {
        newStatus = "AwaitingSecondWeigh";
      } else {
        newStatus = "Completed";
      }
    } else {
      // Keep in AwaitingSecondWeigh unless explicitly marked complete
      newStatus = "AwaitingSecondWeigh";
    }

    return newStatus;
  };

  // Load weight capture settings
  useEffect(() => {
    const saved = localStorage.getItem("weightCaptureSettings");
    if (saved) {
      const parsed = JSON.parse(saved);
      setAutomaticMode(parsed.automaticMode ?? false);
      setRequireImageCapture(parsed.requireImageCapture ?? false);
      setHardwareIntegrationEnabled(parsed.hardwareIntegrationEnabled ?? false);
    }
  }, []);

  // Check hardware connection status
  useEffect(() => {
    if (!hardwareIntegrationEnabled) return;

    const checkHardwareConnection = async () => {
      try {
        const response = await fetch(`${window.location.origin}/api/hardware/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          setHardwareStatus('connected');
        } else {
          setHardwareStatus('error');
        }
      } catch (error) {
        setHardwareStatus('disconnected');
      }
    };

    // Check connection initially and then periodically
    checkHardwareConnection();
    const interval = setInterval(checkHardwareConnection, 5000);

    return () => clearInterval(interval);
  }, [hardwareIntegrationEnabled]);

  const [weighData, setWeighData] = useState({
    gross_weight: "",
    tare_weight: "",
    warning_flag: false,
    exceedence_notes: "",
    complete_vehicle: false,
    // GVM/GTM/Trailer fields for JV vehicles
    gvm: "",
    gtm: "",
    trailer_weight: "",
  });
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);

  const { data: entry, refetch } = useQuery({
    queryKey: ["vehicle-entry", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_entries")
        .select(`
          *,
          vehicle_types (*),
          weigh_records (*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: pendingWeigh } = useQuery({
    queryKey: ["pending-weigh", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_weighs")
        .select("*")
        .eq("entry_id", id)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const dbWeighCount = entry?.weigh_records?.length || 0;
  const pendingOfflineWeighs = id ? offlineDataManager.getPendingCount(id, 'weigh_record') : 0;
  const weighCount = dbWeighCount + pendingOfflineWeighs;

  const isFirstWeigh = weighCount === 0;
  const isMVCategory = entry?.category && ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(entry.category);
  const isJVCategory = entry?.category && ["JV-Payment", "JV-Free"].includes(entry.category);

  // Determine "Came Loaded" state based on Category Rules:
  // 1. MV-Company -> ALWAYS Arrive Empty (First Weigh = Tare)
  // 2. MV-Supplier / MV-PublicSeller -> ALWAYS Arrive Loaded (First Weigh = Gross)
  // 3. Others -> Default to true (Loaded) unless explicitly false in DB
  let cameLoaded = entry?.came_loaded !== false; // Default
  if (entry?.category === "MV-Company") {
    cameLoaded = false; // Force Empty
  } else if (["MV-Supplier", "MV-PublicSeller"].includes(entry?.category || "")) {
    cameLoaded = true; // Force Loaded
  }

  // MV vehicles: no attempt limits, only two weighs
  // JV/Transit vehicles: 3-attempt limit applies

  // For MV vehicles, determine which weight to show/pre-fill
  const firstWeighRecord = entry?.weigh_records?.[0];
  const showGrossOnly = isMVCategory && isFirstWeigh && cameLoaded;
  const showTareOnly = isMVCategory && isFirstWeigh && !cameLoaded;
  const showPrefilledGross = isMVCategory && !isFirstWeigh && cameLoaded && !!firstWeighRecord;
  const showPrefilledTare = isMVCategory && !isFirstWeigh && !cameLoaded && !!firstWeighRecord;

  const netWeight =
    weighData.gross_weight && weighData.tare_weight
      ? (parseFloat(weighData.gross_weight) - parseFloat(weighData.tare_weight)).toFixed(2)
      : "";

  // Calculate Payload for JV vehicles: GTM - Trailer
  const payload =
    weighData.gtm && weighData.trailer_weight
      ? (parseFloat(weighData.gtm) - parseFloat(weighData.trailer_weight)).toFixed(2)
      : "";

  // Calculate Pulling GVM: Gross Weight + GTM
  const pullingGVM =
    weighData.gross_weight && weighData.gtm
      ? (parseFloat(weighData.gross_weight) + parseFloat(weighData.gtm)).toFixed(2)
      : "";

  // Pre-fill weights for MV second weigh
  useEffect(() => {
    if (isMVCategory && !isFirstWeigh && firstWeighRecord) {
      if (cameLoaded) {
        // Pre-fill Gross from first weigh, user enters Tare
        setWeighData(prev => ({
          ...prev,
          gross_weight: String(firstWeighRecord.gross_weight || '')
        }));
      } else {
        // Pre-fill Tare from first weigh, user enters Gross
        setWeighData(prev => ({
          ...prev,
          tare_weight: String(firstWeighRecord.tare_weight || '')
        }));
      }
    }
  }, [isMVCategory, isFirstWeigh, firstWeighRecord, cameLoaded]);

  // --- AUTO-SAVE DRAFTS (Anti-Data Loss) ---
  useEffect(() => {
    if (id) {
      const draft = offlineDataManager.getDraft(id);
      if (draft) {
        setWeighData(draft);
        toast({
          title: "Draft Restored",
          description: "Your previous unsaved data has been restored.",
          duration: 3000
        });
      }
    }
  }, [id]);

  useEffect(() => {
    if (id && weighData) {
      const timer = setTimeout(() => {
        offlineDataManager.saveDraft(id, weighData);
      }, 1000); // Debounce save every 1s
      return () => clearTimeout(timer);
    }
  }, [id, weighData]);
  // -----------------------------------------

  // Pre-submit check - shows modal for JV/Transit vehicles if no completion option selected
  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clear draft explicitly when user attempts to submit
    if (id) offlineDataManager.clearDraft(id);

    // For JV-Payment, JV-Free, Transit - show confirmation modal if no option selected
    const requiresCompletionChoice = ["JV-Payment", "JV-Free", "Transit"].includes(entry?.category || "");
    if (requiresCompletionChoice && !weighData.warning_flag && !weighData.complete_vehicle) {
      setPendingSubmitEvent(e);
      setShowCompletionModal(true);
      return;
    }

    // Otherwise proceed directly
    handleSubmit(e);
  };

  // Handle modal selection
  const handleCompletionChoice = (choice: "warning" | "complete") => {
    if (choice === "warning") {
      setWeighData(prev => ({ ...prev, warning_flag: true, complete_vehicle: false }));
    } else {
      setWeighData(prev => ({ ...prev, warning_flag: false, complete_vehicle: true }));
    }
    setShowCompletionModal(false);

    // Trigger submit after state update
    setTimeout(() => {
      if (pendingSubmitEvent) {
        handleSubmit(pendingSubmitEvent);
        setPendingSubmitEvent(null);
      }
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to record weights",
      });
      return;
    }

    // Check if vehicle has exhausted weigh attempts (non-MV vehicles only)
    const MAX_WEIGH_ATTEMPTS = 3;
    if (!isMVCategory && weighCount >= MAX_WEIGH_ATTEMPTS) {
      toast({
        variant: "destructive",
        title: "⚠️ Maximum Weigh Attempts Reached",
        description: `This vehicle has exhausted all ${MAX_WEIGH_ATTEMPTS} weigh attempts. Payment is required before any further weighing. Please process payment in the Cashier section.`,
        duration: 7000,
      });
      return;
    }

    // Check if payment is required before weighing
    if (pendingWeigh?.payment_required) {
      toast({
        variant: "destructive",
        title: "⚠️ Payment Required Before Weighing",
        description: `${pendingWeigh.payment_required_reason}

Amount Due: TShs ${(pendingWeigh.payment_amount || 0).toLocaleString()}

Please process payment in Cashier section first.`,
        duration: 7000,
      });
      return;
    }

    // Check if image capture is required
    if (requireImageCapture && !capturedPhotoUrl) {
      toast({
        variant: "destructive",
        title: "📷 Photo Required",
        description: "Admin has enabled mandatory photo capture. Please capture a vehicle photo before saving.",
        duration: 5000,
      });
      return;
    }

    // Validation: Ensure at least one weight is present and non-zero
    const isWeightZeroOrEmpty = (w: string) => !w || parseFloat(w) <= 0;

    // For MV vehicles, check the relevant field based on arrive status
    if (isMVCategory) {
      if (cameLoaded && isFirstWeigh && isWeightZeroOrEmpty(weighData.gross_weight)) {
        toast({ variant: "destructive", title: "Missing Weight", description: "Please enter a valid Gross Weight" });
        return;
      }
      if (!cameLoaded && isFirstWeigh && isWeightZeroOrEmpty(weighData.tare_weight)) {
        toast({ variant: "destructive", title: "Missing Weight", description: "Please enter a valid Tare Weight" });
        return;
      }
      if (!isFirstWeigh && cameLoaded && isWeightZeroOrEmpty(weighData.tare_weight)) {
        toast({ variant: "destructive", title: "Missing Weight", description: "Please enter a valid Tare Weight" });
        return;
      }
      if (!isFirstWeigh && !cameLoaded && isWeightZeroOrEmpty(weighData.gross_weight)) {
        toast({ variant: "destructive", title: "Missing Weight", description: "Please enter a valid Gross Weight" });
        return;
      }
    } else {
      // Check if this is a GVM-only category (JV-Free, JV-Payment, Transit)
      const isGVMOnlyCategory = ["JV-Free", "JV-Payment", "Transit"].includes(entry?.category || "");

      if (isGVMOnlyCategory) {
        // For GVM-only categories: ONLY Gross Weight (GVM) can be saved alone
        // Reject if only Tare is filled
        if (isWeightZeroOrEmpty(weighData.gross_weight) && !isWeightZeroOrEmpty(weighData.tare_weight)) {
          toast({
            variant: "destructive",
            title: "Invalid Weight Entry",
            description: "For this vehicle category, only GVM (Gross Weight) can be saved alone. Please enter GVM.",
            duration: 4000
          });
          return;
        }

        // Reject if both are empty
        if (isWeightZeroOrEmpty(weighData.gross_weight) && isWeightZeroOrEmpty(weighData.tare_weight)) {
          toast({
            variant: "destructive",
            title: "Missing Weight Value",
            description: "Please enter at least GVM (Gross Weight) before saving.",
            duration: 4000
          });
          return;
        }

        // Allow: GVM only, or GVM + Tare (both are valid)
      } else {
        // General validation for other types (Local, Quarry, etc.)
        if (isWeightZeroOrEmpty(weighData.gross_weight) && isWeightZeroOrEmpty(weighData.tare_weight)) {
          toast({
            variant: "destructive",
            title: "Missing Weight Value",
            description: "Please enter a valid weight before saving.",
            duration: 4000
          });
          return;
        }
      }
    }

    setIsSubmitting(true);

    // Check if we're offline and handle accordingly
    if (!navigator.onLine) {
      toast({
        title: "Offline Mode",
        description: "Data stored locally. Will sync when connection is restored.",
      });

      // Store the weigh data offline
      // CRITICAL FIX: Apply same MV category logic for offline mode
      let actualGrossWeight: number;
      let actualTareWeight: number;

      if (isMVCategory && isFirstWeigh) {
        if (cameLoaded) {
          actualGrossWeight = parseFloat(weighData.gross_weight);
          actualTareWeight = 0;
        } else {
          actualGrossWeight = 0;
          actualTareWeight = parseFloat(weighData.tare_weight);
        }
      } else if (isMVCategory && !isFirstWeigh) {
        if (cameLoaded) {
          actualGrossWeight = parseFloat(weighData.gross_weight);
          actualTareWeight = parseFloat(weighData.tare_weight);
        } else {
          actualGrossWeight = parseFloat(weighData.gross_weight);
          actualTareWeight = parseFloat(weighData.tare_weight);
        }
      } else {
        actualGrossWeight = parseFloat(weighData.gross_weight);
        actualTareWeight = parseFloat(weighData.tare_weight);
      }

      const offlineId = offlineDataManager.addData({
        type: 'weigh_record',
        operation: 'create',
        data: {
          entry_id: id,
          vehicle_no: entry?.vehicle_no,
          gross_weight: actualGrossWeight,
          tare_weight: actualTareWeight,
          weigh_number: weighCount + 1,
          operator_id: user.id,
          warning_flag: weighData.warning_flag,
          exceedence_notes: weighData.exceedence_notes || null,
          is_locked: true,
          gvm: weighData.gvm ? parseFloat(weighData.gvm) : null,
          gtm: weighData.gtm ? parseFloat(weighData.gtm) : null,
          trailer_weight: weighData.trailer_weight ? parseFloat(weighData.trailer_weight) : null,
          photo_url: capturedPhotoUrl || null,
          net_weight: actualGrossWeight - actualTareWeight,
        }
      });

      // Update vehicle entry status offline
      offlineDataManager.addData({
        type: 'vehicle_entry',
        operation: 'update',
        data: {
          id: id,
          status: determineNewStatus(),
          completed: determineNewStatus() === "Completed",
        }
      });

      // Handle payments offline if needed
      if (entry?.vehicle_types) {
        const fee = isFirstWeigh
          ? entry.vehicle_types.first_weigh_fee
          : entry.vehicle_types.second_weigh_fee;

        const skipPayment = entry.penalty_paid_entry === true;
        const entryCategory = entry?.category || "";
        const isJVCategoryPayment = ["JV-Payment", "JV-Free"].includes(entryCategory);
        const isMVPayOnceCategory = ["MV-PublicSeller", "MV-Supplier"].includes(entryCategory);

        const skipSecondWeighPayment = !isFirstWeigh && (isMVPayOnceCategory || isJVCategoryPayment);

        if (typeof fee === 'number' && !skipPayment && !skipSecondWeighPayment) {
          offlineDataManager.addData({
            type: 'payment',
            operation: 'create',
            data: {
              entry_id: id,
              vehicle_no: entry.vehicle_no,
              amount: fee,
              payment_type: isFirstWeigh ? "First Weigh" : "Second Weigh",
              payment_status: isFirstWeigh || fee === 0 ? "Paid" : "Pending",
              paid_at: isFirstWeigh || fee === 0 ? new Date().toISOString() : null,
            }
          });
        }
      }

      // Complete the operation
      setIsSubmitting(false);
      toast({
        title: "Success",
        description: `Weight recorded offline for ${entry?.vehicle_no}. Will sync when online.`,
      });

      // Navigate based on conditions
      if (isFirstWeigh || isMVCategory) {
        // Prepare print data for offline scenario
        const calculatedNetWeight = parseFloat(weighData.gross_weight) - parseFloat(weighData.tare_weight);
        const printInfo = {
          ...entry,
          gross_weight: weighData.gross_weight,
          tare_weight: weighData.tare_weight,
          net_weight: calculatedNetWeight,
          vehicle_type_name: entry.vehicle_types?.type_name,
          price: entry.vehicle_types?.first_weigh_fee || 0,
          isPrepaid: false,
          weighed_by: userProfile?.full_name && userProfile.full_name !== 'User'
            ? userProfile.full_name
            : userProfile?.username || 'Unknown Operator',
          weigh_time: new Date().toISOString(),
          isSecondWeigh: !isFirstWeigh,
          gvm: weighData.gvm || null,
          gtm: weighData.gtm || null,
          trailer_weight: weighData.trailer_weight || null,
          payload: weighData.gtm && weighData.trailer_weight
            ? (parseFloat(weighData.gtm) - parseFloat(weighData.trailer_weight)).toFixed(2)
            : null,
        };
        setPrintData(printInfo);
        setShowPrint(true);
      } else {
        navigate("/");
      }
      return;
    }

    try {
      // 1. Start Shift Check in background immediately
      const shiftDate = getCurrentShiftDate();
      const shiftName = getCurrentShiftName();
      const shiftPromise = navigator.onLine ? supabase
        .from("shifts")
        .select("id")
        .eq("shift_date", shiftDate)
        .eq("shift_name", shiftName)
        .limit(1)
        .maybeSingle() : Promise.resolve({ data: { id: `offline_${shiftDate}_${shiftName}` }, error: null });

      // 2. Prepare Data & Status while shift check is running
      const calculatedNetWeight = parseFloat(weighData.gross_weight) - parseFloat(weighData.tare_weight);
      let newStatus = entry?.status;
      const isMVVehicle = ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(entry?.category || "");
      const isSecondWeighForMV = isMVVehicle && weighCount === 1;

      if (weighData.complete_vehicle || isSecondWeighForMV) {
        newStatus = "Completed";
      } else if (isFirstWeigh) {
        newStatus = entry?.vehicle_types?.requires_two_weighs ? "AwaitingSecondWeigh" : "Completed";
      }

      const isThirdWeigh = weighCount === 2;
      const hasExhaustedAttempts = !isMVCategory && isThirdWeigh && !weighData.complete_vehicle;

      // 3. Resolve Shift ID (or create if missing)
      const { data: shiftData, error: shiftFetchError } = await shiftPromise;
      if (shiftFetchError) throw shiftFetchError;

      let currentShiftId = shiftData?.id;
      if (!currentShiftId && navigator.onLine) {
        // Only if absolutely missing, create it
        const { data: newShift, error: shiftError } = await supabase
          .from("shifts")
          .insert({
            shift_date: shiftDate,
            shift_name: shiftName,
            operator_id: user.id,
            start_time: new Date().toISOString(),
          })
          .select("id");
        if (shiftError) throw shiftError;
        currentShiftId = newShift?.[0]?.id;
      }

      const promises: Promise<any>[] = [];

      // --- PARALLEL BLOCK START ---

      // A. Update Vehicle Entry (Status & Shift)
      promises.push(
        Promise.resolve(
          supabase
            .from("vehicle_entries")
            .update({
              status: hasExhaustedAttempts ? entry.status : newStatus, // Fixed undefined 'status'
              completed: !hasExhaustedAttempts && newStatus === "Completed",
              shift_id: currentShiftId
            })
            .eq("id", id)
        )
      );

      // B. Insert Weigh Record
      // CRITICAL FIX: Determine correct gross/tare values based on MV category logic
      // MV-PublicSeller & MV-Supplier arrive LOADED → First weigh = Gross, Second weigh = Tare
      // MV-Company arrives EMPTY → First weigh = Tare, Second weigh = Gross
      let actualGrossWeight: number;
      let actualTareWeight: number;

      if (isMVCategory && isFirstWeigh) {
        // First weigh for MV vehicles
        if (cameLoaded) {
          // MV-PublicSeller & MV-Supplier: Arrived loaded, so first weigh is GROSS
          actualGrossWeight = parseFloat(weighData.gross_weight);
          actualTareWeight = 0; // Will be filled on second weigh
        } else {
          // MV-Company: Arrived empty, so first weigh is TARE
          actualGrossWeight = 0; // Will be filled on second weigh
          actualTareWeight = parseFloat(weighData.tare_weight);
        }
      } else if (isMVCategory && !isFirstWeigh) {
        // Second weigh for MV vehicles
        if (cameLoaded) {
          // MV-PublicSeller & MV-Supplier: Now empty, so second weigh is TARE
          actualGrossWeight = parseFloat(weighData.gross_weight); // Pre-filled from first weigh
          actualTareWeight = parseFloat(weighData.tare_weight); // Newly captured
        } else {
          // MV-Company: Now loaded, so second weigh is GROSS
          actualGrossWeight = parseFloat(weighData.gross_weight); // Newly captured
          actualTareWeight = parseFloat(weighData.tare_weight); // Pre-filled from first weigh
        }
      } else {
        // Non-MV vehicles: use values as-is
        actualGrossWeight = parseFloat(weighData.gross_weight);
        actualTareWeight = parseFloat(weighData.tare_weight);
      }

      promises.push(
        Promise.resolve(
          supabase.from("weigh_records").insert([{
            entry_id: id,
            gross_weight: actualGrossWeight,
            tare_weight: actualTareWeight,
            weigh_number: weighCount + 1,
            operator_id: user.id,
            warning_flag: weighData.warning_flag,
            exceedence_notes: weighData.exceedence_notes || null,
            is_locked: true,
            gvm: weighData.gvm ? parseFloat(weighData.gvm) : null,
            gtm: weighData.gtm ? parseFloat(weighData.gtm) : null,
            trailer_weight: weighData.trailer_weight ? parseFloat(weighData.trailer_weight) : null,
            photo_url: capturedPhotoUrl || null,
            net_weight: calculatedNetWeight,
          }])
        )
      );

      // C. Handle Pending Weighs & Penalties
      if (hasExhaustedAttempts) {
        const penaltyAmount = entry.vehicle_types?.first_weigh_fee || 0;

        promises.push(
          Promise.resolve(
            supabase.from("pending_weighs").update({
              payment_required: true,
              payment_required_reason: 'Exhausted all 3 weigh attempts without acceptable weight',
              payment_amount: penaltyAmount,
              payment_status: 'Overdue',
              weigh_attempts: 3
            }).eq("entry_id", id)
          )
        );

        promises.push(
          Promise.resolve(
            supabase.from("penalties").insert({
              entry_id: id,
              vehicle_no: entry.vehicle_no,
              penalty_type: 'Exhausted Attempts',
              reason: 'Used all 3 weigh attempts without achieving acceptable weight',
              amount: penaltyAmount,
              operator_id: user.id
            })
          )
        );

        promises.push(
          Promise.resolve(
            supabase.from("activity_logs").insert({
              user_id: user.id,
              user_name: userProfile?.full_name || "Unknown",
              user_role: "operator",
              action: "Weigh Attempts Exhausted",
              details: `Vehicle ${entry.vehicle_no} exhausted all 3 attempts. Penalty of TShs ${penaltyAmount.toLocaleString()} applied.`,
            })
          )
        );
      } else if (newStatus === "Completed") {
        promises.push(Promise.resolve(supabase.from("pending_weighs").delete().eq("entry_id", id)));
      } else if (isFirstWeigh && entry?.vehicle_types?.is_time_sensitive) {
        const expectedReturnTime = new Date();
        expectedReturnTime.setHours(expectedReturnTime.getHours() + (entry.vehicle_types.return_time_hours || 0));

        promises.push(
          Promise.resolve(
            supabase.from("pending_weighs").insert({
              entry_id: id,
              vehicle_no: entry.vehicle_no,
              category: entry.category,
              first_weigh_time: new Date().toISOString(),
              expected_return_time: expectedReturnTime.toISOString(),
              return_status: "Pending",
            })
          )
        );
      } else if (!isFirstWeigh && !isMVCategory && pendingWeigh) {
        promises.push(
          Promise.resolve(
            supabase.from("pending_weighs").update({
              weigh_attempts: (pendingWeigh.weigh_attempts || 0) + 1,
            }).eq("entry_id", id)
          )
        );
      }

      let prePaidPromise: Promise<any> | null = null;
      if (isFirstWeigh || isMVCategory) {
        prePaidPromise = Promise.resolve(
          supabase.from("payments")
            .select("notes")
            .eq("entry_id", id)
            .eq("payment_type", "First Weigh")
            .eq("payment_status", "Paid")
            .limit(1)
            .maybeSingle()
        );
        promises.push(prePaidPromise);
      }

      if (entry?.vehicle_types) {
        const fee = isFirstWeigh ? entry.vehicle_types.first_weigh_fee : entry.vehicle_types.second_weigh_fee;
        const skipPayment = entry.penalty_paid_entry === true;
        const entryCategory = entry?.category || "";
        const isJVCategoryPayment = ["JV-Payment", "JV-Free"].includes(entryCategory);
        const isMVPayOnceCategory = ["MV-Supplier"].includes(entryCategory);
        const skipSecondWeighPayment = !isFirstWeigh && (isMVPayOnceCategory || isJVCategoryPayment);

        if (typeof fee === 'number' && !skipPayment && !skipSecondWeighPayment && fee > 0) {
          promises.push((async () => {
            const { data: existingRecords } = await supabase.from("payments")
              .select("id, payment_status")
              .eq("entry_id", id)
              .eq("payment_type", isFirstWeigh ? "First Weigh" : "Second Weigh")
              .limit(1);

            const existing = existingRecords?.[0];

            // Auto-mark as PAID if it's the second weigh (User requirement: "when they save automatically let the money reflect")
            const shouldBePaid = isFirstWeigh ? true : true; // Both First and Second weigh now auto-mark as paid on save/print if applicable

            if (!existing) {
              return supabase.from("payments").insert({
                entry_id: id,
                vehicle_no: entry.vehicle_no,
                amount: fee,
                payment_type: isFirstWeigh ? "First Weigh" : "Second Weigh",
                payment_status: "Paid", // Always Paid on save
                paid_at: new Date().toISOString(),
                cashier_name: userProfile?.full_name || "Operator",
                cashier_id: user?.id
              });
            } else if (!isFirstWeigh && existing.payment_status === 'Pending') {
              // If Second Weigh exists but is Pending, update it to Paid
              return supabase.from("payments").update({
                payment_status: "Paid",
                paid_at: new Date().toISOString(),
                cashier_name: userProfile?.full_name || "Operator",
                cashier_id: user?.id
              }).eq("id", existing.id);
            }
          })());
        }
      }

      const enteredByName = (userProfile?.full_name && userProfile?.full_name !== "User")
        ? userProfile?.full_name
        : userProfile?.username || "Unknown";

      // EXECUTE ALL IN PARALLEL

      // EXECUTE ALL IN PARALLEL
      const results = await Promise.all(promises);
      const errors = results.filter(r => r?.error);
      if (errors.length > 0) throw errors[0].error;

      // FAST-PATH PRINTING: Show print dialog immediately after DB confirmation
      const prePaidResult = prePaidPromise ? await prePaidPromise : null;
      const isPrepaid = prePaidResult?.data?.notes?.includes("Pre-paid");

      setPrintData({
        ...entry,
        gross_weight: weighData.gross_weight,
        tare_weight: weighData.tare_weight,
        net_weight: calculatedNetWeight,
        vehicle_type_name: entry.vehicle_types?.type_name,
        price: isFirstWeigh ? (entry.vehicle_types?.first_weigh_fee || 0) : (entry.vehicle_types?.second_weigh_fee || 0),
        isPrepaid,
        weighed_by: userProfile?.full_name || userProfile?.username || 'Operator',
        weigh_time: new Date().toISOString(),
        isSecondWeigh: !isFirstWeigh,
        gvm: weighData.gvm || null,
        gtm: weighData.gtm || null,
        trailer_weight: weighData.trailer_weight || null,
        payload: weighData.gtm && weighData.trailer_weight ? (parseFloat(weighData.gtm) - parseFloat(weighData.trailer_weight)).toFixed(2) : null,
        isCompleted: newStatus === "Completed",
        warning_flag: weighData.warning_flag,
        pulling_gvm: pullingGVM // Add to print data
      });
      setShowPrint(true);

      if (hasExhaustedAttempts) {
        toast({
          variant: "destructive",
          title: "⚠️ Weigh Attempts Exhausted",
          description: `Vehicle ${entry.vehicle_no} has used all 3 attempts.`,
          duration: 4000,
        });
      }

      // Background UI Cleanup (User doesn't wait for this)
      (async () => {
        if (newStatus === "Completed") {
          queryClient.invalidateQueries({ queryKey: ["completed-vehicles"] });
          queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
          queryClient.invalidateQueries({ queryKey: ["shift-stats"] });
        }
        await refetch();
        queryClient.invalidateQueries({ queryKey: ["vehicle-entry", id] });
        queryClient.invalidateQueries({ queryKey: ["pending-weigh", id] });
        setIsSubmitting(false);
      })();

    } catch (error: any) {
      console.error("Save error:", error);

      let errorMessage = error.message || "An unknown error occurred while saving.";

      if (errorMessage.includes("Failed to fetch")) {
        errorMessage = "Network Error: Could not connect to the database. Please check your internet connection and try again.";
      } else if (errorMessage.includes("timeout")) {
        errorMessage = "Request Timeout: The database is taking too long to respond. Please try saving again.";
      }

      toast({
        variant: "destructive",
        title: "Save Failed",
        description: errorMessage,
        duration: 10000
      });
      setIsSubmitting(false);
    }
  };

  if (!entry) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading...</div>
      </div>
    );
  }

  // Print receipt dialog
  if (showPrint && printData) {
    const savedSettings = localStorage.getItem('receiptSettings');
    const settings = savedSettings ? JSON.parse(savedSettings) : {
      template: 'classic',
      header: {
        companyName: 'ENERGY FEEDS LIMITED',
        subtitle: 'Under SudSud Group',
        address: 'P.O BOX 106254 - DAR ES SALAAM, TANZANIA',
        showLogo: true,
        logoPosition: 'center',
        useCustomLogo: false,
      },
      qrCode: {
        enabled: true,
        size: 'medium',
        position: 'bottom-right',
      },
      footer: {
        text: 'Thank you for using our services!',
        showGeneratedTime: true,
      },
    };

    const qrSizeMap = { small: 60, medium: 75, large: 90 };
    const qrSize = qrSizeMap[settings.qrCode.size as keyof typeof qrSizeMap] || 75;

    const templateClass = settings.template === 'classic'
      ? 'border-4 border-primary rounded-lg'
      : settings.template === 'modern'
        ? 'border border-border rounded-xl shadow-lg'
        : 'border-none';

    const fontClass = settings.template === 'minimal' ? 'font-mono' : '';

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className={templateClass}>
          <CardContent className={`p-8 print:p-2 ${fontClass}`}>
            <div id="print-receipt" className="print:m-0 print:p-0">
              <div className={`mb-8 print:mb-1 text-${settings.header.logoPosition} relative`}>
                {settings.header.showLogo && (
                  <img
                    src={settings.header.useCustomLogo && settings.header.customLogo
                      ? settings.header.customLogo
                      : "/images/energy-feeds-logo.jpg"
                    }
                    alt="Energy Feeds"
                    className={`h-24 mb-4 object-contain ${settings.header.logoPosition === 'center' ? 'mx-auto' : settings.header.logoPosition === 'right' ? 'ml-auto' : ''}`}
                  />
                )}
                <h1 className={`${settings.template === 'minimal' ? 'text-2xl' : 'text-3xl'} font-bold text-primary`}>
                  {settings.header.companyName}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">{settings.header.subtitle}</p>
                <p className="text-sm text-muted-foreground">{settings.header.address}</p>
                {settings.template === 'classic' ? (
                  <div className="border-b-4 border-primary mt-4 mb-6 print:mt-0.5 print:mb-1"></div>
                ) : settings.template === 'modern' ? (
                  <div className="border-b-2 border-border mt-4 mb-6 print:mt-0.5 print:mb-1"></div>
                ) : (
                  <div className="border-b border-dotted border-muted-foreground mt-3 mb-4 print:mt-0.5 print:mb-1"></div>
                )}
                <h2 className={`${settings.template === 'minimal' ? 'text-lg' : 'text-xl'} font-semibold`}>
                  WEIGH RECEIPT
                </h2>

                {/* QR Code - Top Right Position */}
                {settings.qrCode.enabled && settings.qrCode.position === 'top-right' && (
                  <div className={`absolute top-0 right-0 p-3 bg-white rounded ${settings.template === 'classic'
                    ? 'border-4 border-primary'
                    : settings.template === 'modern'
                      ? 'border-2 border-border'
                      : 'border border-muted-foreground'
                    }`}>
                    <QRCode
                      value={JSON.stringify({
                        entryId: getShortEntryId(printData.id, printData.wb_number),
                        vehicleNo: printData.vehicle_no,
                        weighTime: printData.weigh_time,
                        netWeight: printData.net_weight
                      })}
                      size={qrSize}
                      level="M"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-6 print:space-y-0 print:mb-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Entry ID</p>
                    <p className="font-bold font-mono text-lg print:text-xl">{printData.wb_number ? getShortEntryId(printData.id, printData.wb_number) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Weigh Time</p>
                    <p className="font-bold print:text-lg">
                      {format(new Date(printData.weigh_time), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Vehicle Number</p>
                    <p className="font-bold text-xl print:text-2xl">{printData.vehicle_no}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Vehicle Type</p>
                    <p className="font-bold print:text-lg">{printData.vehicle_type_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Category</p>
                    <p className="font-bold print:text-lg">{printData.category}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Driver</p>
                    <p className="font-bold print:text-lg">{printData.driver_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Weighed By</p>
                    <p className="font-bold print:text-lg">{printData.weighed_by}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground print:text-base">Status</p>
                    <p className="font-bold print:text-lg">
                      {printData.isSecondWeigh ? "Second Weigh Complete" : "First Weigh Complete"}
                    </p>
                  </div>
                </div>

                {/* MV Vehicle Extra Details - Cargo/Commodity Information */}
                {printData.category?.startsWith('MV-') && (
                  <div className="mt-4 pt-4 border-t border-dashed border-muted-foreground">
                    <p className="text-sm font-semibold text-muted-foreground mb-3">Cargo/Commodity Details:</p>
                    <div className="grid grid-cols-2 gap-3">
                      {printData.customer_farmer_name && (
                        <div>
                          <p className="text-xs text-muted-foreground">Customer/Farmer</p>
                          <p className="font-bold print:text-lg">{printData.customer_farmer_name}</p>
                        </div>
                      )}
                      {printData.item_name && (
                        <div>
                          <p className="text-xs text-muted-foreground">Item/Commodity</p>
                          <p className="font-bold print:text-lg">{printData.item_name}</p>
                        </div>
                      )}
                      {printData.source_destination && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Source/Destination</p>
                          <p className="font-bold print:text-lg">{printData.source_destination}</p>
                        </div>
                      )}
                      {printData.cargo_description && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Cargo Description</p>
                          <p className="font-bold print:text-lg">{printData.cargo_description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div
                className={`py-4 mt-6 print:py-0.5 print:mt-1 ${settings.template === 'classic'
                  ? 'border-t-4 border-b-4 border-primary'
                  : settings.template === 'modern'
                    ? 'border-t-2 border-b-2 border-border'
                    : 'border-t-2 border-dotted border-muted-foreground'
                  }`}
              >
                <div className="space-y-3 print:space-y-0.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg print:text-base">Gross Weight:</span>
                    <span className="text-xl font-bold print:text-lg">{printData.gross_weight} kg</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg print:text-xl">Tare Weight:</span>
                    <span className="text-xl font-bold print:text-2xl">{printData.tare_weight} kg</span>
                  </div>
                  <div className="flex justify-between items-center text-2xl font-black text-primary print:text-3xl">
                    <span className="font-bold text-lg print:text-xl">Net Weight:</span>
                    <span className="text-2xl font-black print:text-3xl">{printData.net_weight} kg</span>
                  </div>
                </div>

                {/* GVM/GTM/Trailer/Payload - Only show if values entered */}
                {(printData.gvm || printData.gtm || printData.trailer_weight) && (
                  <div className="mt-4 pt-4 border-t border-dashed border-muted-foreground space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Vehicle Mass Details:</p>
                    {printData.gvm && (
                      <div className="flex justify-between items-center print:text-xs">
                        <span className="font-medium">GVM (Gross Vehicle Mass):</span>
                        <span className="font-bold">{printData.gvm} kg</span>
                      </div>
                    )}
                    {printData.gtm && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium">GTM (Gross Trailer Mass):</span>
                        <span className="font-bold">{printData.gtm} kg</span>
                      </div>
                    )}
                    {printData.trailer_weight && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Trailer Weight:</span>
                        <span className="font-bold">{printData.trailer_weight} kg</span>
                      </div>
                    )}
                    {printData.pulling_gvm && (
                      <div className="flex justify-between items-center bg-primary/5 p-1 rounded">
                        <span className="font-bold">Pulling GVM (Gross + GTM):</span>
                        <span className="font-black text-primary">{printData.pulling_gvm} kg</span>
                      </div>
                    )}
                  </div>
                )}

                {printData.payload && (
                  <div className="flex justify-between items-center text-lg font-bold text-primary pt-2">
                    <span>Payload (GTM - Trailer):</span>
                    <span>{printData.payload} kg</span>
                  </div>
                )}
              </div>

              {!printData.isSecondWeigh && (
                <div
                  className={`pt-4 mt-6 print:pt-0.5 print:mt-1 ${settings.template === 'classic'
                    ? 'border-t-2 border-primary'
                    : settings.template === 'modern'
                      ? 'border-t border-border'
                      : 'border-t border-dotted border-muted-foreground'
                    }`}
                >
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-semibold">First Weigh Fee:</span>
                    {printData.isPrepaid ? (
                      <span className="font-bold text-success">
                        Pre-paid (Penalty)
                      </span>
                    ) : (
                      <span className="font-bold text-primary">
                        TShs {(printData.price || 0).toLocaleString()}.00
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* JV-Payment Overweight Notice */}
              {printData.category === "JV-Payment" && printData.warning_flag && !printData.isSecondWeigh && (
                <div className="mt-4 p-3 border-2 border-dashed border-red-300 bg-red-50/50 rounded-lg text-center print:border-red-400 print:bg-transparent">
                  <p className="font-bold text-red-600 print:text-black uppercase text-sm mb-1">
                    ⚠️ OVERWEIGHT NOTICE
                  </p>
                  <p className="text-xs text-slate-700 print:text-black font-medium leading-relaxed">
                    This receipt is valid for <strong>2 additional re-weigh attempts</strong> within <strong>12 hours</strong>.
                    <br />
                    If acceptable weight is not achieved within these limits, a new payment will be required.
                  </p>
                </div>
              )}

              <div
                className={`text-center text-sm text-muted-foreground pt-4 mt-6 print:pt-0.5 print:mt-1 ${settings.template === 'classic'
                  ? 'border-t-2 border-primary'
                  : settings.template === 'modern'
                    ? 'border-t border-border'
                    : 'border-t border-dotted border-muted-foreground'
                  }`}
              >
                {printData.isSecondWeigh ? (
                  <>
                    <p className="font-semibold text-base text-primary">Final Receipt - Weighing Complete</p>
                    <p className="mt-2">{settings.footer.text}</p>
                  </>
                ) : (
                  <>
                    <p>Please keep this receipt for second weighing</p>
                    <p className="mt-2">{settings.footer.text}</p>
                  </>
                )}
                {settings.footer.showGeneratedTime && (
                  <p className="text-xs mt-2">Generated: {new Date().toLocaleString()}</p>
                )}
              </div>

              {/* QR Code - Bottom Position (after all content) */}
              {settings.qrCode.enabled && settings.qrCode.position !== 'top-right' && (
                <div
                  className={`mt-6 pt-4 print:mt-1 print:pt-0.5 flex ${settings.qrCode.position === 'bottom-right' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`p-3 print:p-1.5 bg-white rounded ${settings.template === 'classic'
                    ? 'border-4 border-primary'
                    : settings.template === 'modern'
                      ? 'border-2 border-border'
                      : 'border border-muted-foreground'
                    }`}>
                    <QRCode
                      value={JSON.stringify({
                        entryId: getShortEntryId(printData.id, printData.wb_number),
                        vehicleNo: printData.vehicle_no,
                        weighTime: printData.weigh_time,
                        netWeight: printData.net_weight
                      })}
                      size={qrSize}
                      level="M"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6 print:hidden">
              <Button
                onClick={() => window.print()}
                className="flex-1"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print Receipt
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPrint(false);
                  // If attempts are exhausted (3/3), we should redirect to cashier for penalty payment
                  const isExhausted = printData.weigh_number === 3 && !printData.complete_vehicle && !printData.isCompleted;
                  if (isExhausted) {
                    navigate("/cashier");
                  } else {
                    navigate("/");
                  }
                }}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 min-h-screen">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isOffline ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs">
              <WifiOff className="h-3 w-3" />
              OFFLINE
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success text-success-foreground text-xs">
              <Wifi className="h-3 w-3" />
              ONLINE
            </div>
          )}
          {pendingItems > 0 && (
            <div className="px-2 py-1 rounded-md bg-warning text-warning-foreground text-xs">
              {pendingItems} pending
            </div>
          )}
          {isSyncing && (
            <div className="px-2 py-1 rounded-md bg-blue-500 text-white text-xs">
              Syncing...
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Enter Weight Data</h1>
          <p className="text-muted-foreground">
            {isFirstWeigh ? "First" : "Second"} weighing for {entry.vehicle_no}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
          <CardHeader>
            <CardTitle>Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vehicle No:</span>
              <span className="font-medium">{entry.vehicle_no}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <span className="font-medium">{entry.vehicle_types?.type_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category:</span>
              <span className="font-medium">{entry.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <StatusBadge status={entry.status} category={entry.category} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entry Time:</span>
              <span className="font-medium">
                {format(new Date(entry.entry_time), "MMM dd, HH:mm")}
              </span>
            </div>
          </CardContent>
        </Card>

        {entry.weigh_records && entry.weigh_records.length > 0 && (
          <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
            <CardHeader>
              <CardTitle>Previous Weighs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {entry.weigh_records.map((record: any, index: number) => (
                <div key={record.id} className="border-b pb-3 last:border-0">
                  <p className="font-medium mb-2">Weigh #{index + 1}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross:</span>
                      <span>{record.gross_weight} kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tare:</span>
                      <span>{record.tare_weight} kg</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-muted-foreground">Net:</span>
                      <span>{record.net_weight} kg</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-none shadow-xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800">
        <CardHeader>
          <CardTitle>
            <ScaleIcon className="inline mr-2 h-5 w-5" />
            {isFirstWeigh ? "First" : "Second"} Weight Entry
          </CardTitle>
          <CardDescription>
            Enter the weight measurements from the weighbridge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePreSubmit} className="space-y-4">
            {/* MV Vehicle Info Banner */}
            {isMVCategory && (
              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {isFirstWeigh ? (
                    cameLoaded
                      ? "📦 First Weigh: Recording Gross Weight (Loaded). Vehicle will return empty for Tare Weight."
                      : "📦 First Weigh: Recording Tare Weight (Empty). Vehicle will return loaded for Gross Weight."
                  ) : (
                    cameLoaded
                      ? `✅ Second Weigh: First weigh recorded ${firstWeighRecord?.gross_weight} kg (Loaded). Now recording Tare Weight (Empty).`
                      : `✅ Second Weigh: First weigh recorded ${firstWeighRecord?.tare_weight} kg (Empty). Now recording Gross Weight (Loaded).`
                  )}
                </p>
              </div>
            )}

            {/* Camera Capture and Weight Capture Section */}
            <div className="grid md:grid-cols-2 gap-4 p-4 border rounded-md bg-muted/30">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">📷 Vehicle Photo</p>
                <CameraCaptureButton
                  entryId={entry.wb_number ? getShortEntryId(entry.id, entry.wb_number) : id || ""}
                  vehicleNo={entry.vehicle_no}
                  weighNumber={weighCount + 1}
                  onPhotoCapture={(url) => setCapturedPhotoUrl(url)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-muted-foreground">⚖️ Weight Capture</p>
                  {hardwareIntegrationEnabled && (
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${hardwareStatus === 'connected' ? 'bg-green-500' : hardwareStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                      <span className="text-xs text-muted-foreground">
                        {hardwareStatus === 'connected' ? 'Connected' : hardwareStatus === 'error' ? 'Error' : 'Disconnected'}
                      </span>
                    </div>
                  )}
                </div>
                <WeightCaptureButtons
                  onCaptureGross={(w) => setWeighData({ ...weighData, gross_weight: w })}
                  onCaptureTare={(w) => setWeighData({ ...weighData, tare_weight: w })}
                  onCaptureGVM={(w) => setWeighData({ ...weighData, gvm: w })}
                  onCaptureGTM={(w) => setWeighData({ ...weighData, gtm: w })}
                  onCaptureTrailer={(w) => setWeighData({ ...weighData, trailer_weight: w })}
                  showGVMFields={isJVCategory || entry?.category === "Transit"}
                  disabled={isSubmitting}
                  vehicleNo={entry.vehicle_no}
                  entryId={id}
                />
              </div>
            </div>

            {automaticMode && (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  🔒 Automatic Mode Enabled - Use Capture buttons above to enter weights. Manual entry is disabled.
                </p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* Show single field for MV first weigh, or both fields for normal workflow */}
              {(!isMVCategory || !isFirstWeigh || showGrossOnly) && (
                <div className="space-y-2">
                  <Label htmlFor="gross_weight">
                    Gross Weight (kg) {isMVCategory && !isFirstWeigh && cameLoaded ? "(Pre-filled from 1st Weigh)" : ""} *
                  </Label>
                  <Input
                    id="gross_weight"
                    type="number"
                    step="0.01"
                    placeholder={automaticMode ? "Use Capture button" : "0.00"}
                    value={weighData.gross_weight || (showPrefilledGross ? String(firstWeighRecord.gross_weight) : "")}
                    onChange={(e) =>
                      setWeighData({ ...weighData, gross_weight: e.target.value })
                    }
                    readOnly={showPrefilledGross || automaticMode}
                    className={showPrefilledGross || automaticMode ? "bg-muted" : ""}
                    required
                  />
                </div>
              )}

              {(!isMVCategory || !isFirstWeigh || showTareOnly) && (
                <div className="space-y-2">
                  <Label htmlFor="tare_weight">
                    Tare Weight (kg) {isMVCategory && !isFirstWeigh && !cameLoaded ? "(Pre-filled from 1st Weigh)" : ""} *
                  </Label>
                  <Input
                    id="tare_weight"
                    type="number"
                    step="0.01"
                    placeholder={automaticMode ? "Use Capture button" : "0.00"}
                    value={weighData.tare_weight || (showPrefilledTare ? String(firstWeighRecord.tare_weight) : "")}
                    onChange={(e) =>
                      setWeighData({ ...weighData, tare_weight: e.target.value })
                    }
                    readOnly={showPrefilledTare || automaticMode}
                    className={showPrefilledTare || automaticMode ? "bg-muted" : ""}
                    required
                  />
                </div>
              )}
            </div>

            {netWeight && (
              <div className="p-3 border rounded-md bg-primary/5">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Net Weight:</span>
                  <span className="text-2xl font-bold text-primary">{netWeight} kg</span>
                </div>
                {isMVCategory && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cargo weight calculated: Gross - Tare
                  </p>
                )}
              </div>
            )}

            {/* GVM/GTM/Trailer Fields - Only for JV-Payment, JV-Free, and Transit vehicles */}
            {(isJVCategory || entry?.category === "Transit") && (
              <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                <p className="text-sm font-medium text-muted-foreground">
                  Optional: Vehicle Mass Information (for specific vehicles only)
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="gvm">GVM (Gross Vehicle Mass) kg</Label>
                    <Input
                      id="gvm"
                      type="number"
                      step="0.01"
                      placeholder={automaticMode ? "Use Capture button" : "0.00"}
                      value={weighData.gvm}
                      onChange={(e) =>
                        setWeighData({ ...weighData, gvm: e.target.value })
                      }
                      readOnly={automaticMode}
                      className={automaticMode ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gtm">GTM (Gross Trailer Mass) kg</Label>
                    <Input
                      id="gtm"
                      type="number"
                      step="0.01"
                      placeholder={automaticMode ? "Use Capture button" : "0.00"}
                      value={weighData.gtm}
                      onChange={(e) =>
                        setWeighData({ ...weighData, gtm: e.target.value })
                      }
                      readOnly={automaticMode}
                      className={automaticMode ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trailer_weight">Trailer Weight (kg)</Label>
                    <Input
                      id="trailer_weight"
                      type="number"
                      step="0.01"
                      placeholder={automaticMode ? "Use Capture button" : "0.00"}
                      value={weighData.trailer_weight}
                      onChange={(e) =>
                        setWeighData({ ...weighData, trailer_weight: e.target.value })
                      }
                      readOnly={automaticMode}
                      className={automaticMode ? "bg-muted" : ""}
                    />
                  </div>
                </div>
                {(payload || pullingGVM) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {payload && (
                      <div className="flex justify-between items-center p-3 bg-primary/5 rounded border border-primary/10">
                        <span className="font-medium text-sm">Payload (GTM - Trailer):</span>
                        <span className="text-xl font-bold text-primary">{payload} kg</span>
                      </div>
                    )}
                    {pullingGVM && (
                      <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800/50">
                        <span className="font-medium text-sm">Pulling GVM (Gross + GTM):</span>
                        <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{pullingGVM} kg</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Modern Status Selection Cards - Hidden for MV categories since they follow a fixed cycle */}
            {!isMVCategory && (
              <div className="grid md:grid-cols-2 gap-4 pt-2">
                <div
                  onClick={() => {
                    const newState = !weighData.warning_flag;
                    setWeighData({
                      ...weighData,
                      warning_flag: newState,
                      complete_vehicle: newState ? false : weighData.complete_vehicle
                    });
                  }}
                  className={`
                    relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md flex items-start gap-4 select-none
                    ${weighData.warning_flag
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                      : 'border-muted hover:border-red-200 dark:hover:border-red-800 bg-card'}
                  `}
                >
                  <div className={`
                    p-3 rounded-full shrink-0 transition-colors
                    ${weighData.warning_flag ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'}
                  `}>
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg mb-1 ${weighData.warning_flag ? 'text-red-600 dark:text-red-400' : ''}`}>
                      Over Weight
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Flag this vehicle for weight limits exceedance.
                    </p>
                  </div>
                  {weighData.warning_flag && (
                    <div className="absolute top-4 right-4 text-red-500">
                      <CheckCircle className="h-6 w-6 fill-current" />
                    </div>
                  )}
                </div>

                <div
                  onClick={() => {
                    if (weighData.warning_flag) return;
                    const newState = !weighData.complete_vehicle;
                    setWeighData({
                      ...weighData,
                      complete_vehicle: newState,
                      warning_flag: newState ? false : weighData.warning_flag
                    });
                  }}
                  className={`
                    relative p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-4 select-none
                    ${weighData.warning_flag ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
                    ${weighData.complete_vehicle
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                      : 'border-muted hover:border-green-200 dark:hover:border-green-800 bg-card'}
                  `}
                >
                  <div className={`
                    p-3 rounded-full shrink-0 transition-colors
                    ${weighData.complete_vehicle ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}
                  `}>
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg mb-1 ${weighData.complete_vehicle ? 'text-green-600 dark:text-green-400' : ''}`}>
                      Mark Complete
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Vehicle weight is within limits.
                    </p>
                  </div>
                  {weighData.complete_vehicle && (
                    <div className="absolute top-4 right-4 text-green-500">
                      <CheckCircle className="h-6 w-6 fill-current" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Exceedence notes hidden as per user request
            {weighData.warning_flag && (
              <div className="space-y-2">
                <Label htmlFor="exceedence_notes">Exceedence Notes</Label>
                <Textarea
                  id="exceedence_notes"
                  placeholder="Describe the weight exceedence..."
                  value={weighData.exceedence_notes}
                  onChange={(e) =>
                    setWeighData({ ...weighData, exceedence_notes: e.target.value })
                  }
                  rows={3}
                />
              </div>
            )}
            */}

            {requireImageCapture && !capturedPhotoUrl && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  📷 Photo capture is REQUIRED before saving. Please capture a vehicle photo.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || (requireImageCapture && !capturedPhotoUrl)}
                className="flex-1"
              >
                {isSubmitting ? "Saving..." : "Save Weight Record"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* JV/Transit Completion Confirmation Modal */}
      <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Vehicle Completion Status
            </DialogTitle>
            <DialogDescription className="pt-2">
              Please select the completion status for vehicle <strong>{entry?.vehicle_no}</strong> before saving:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-6">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-4 px-4 border-amber-200 hover:border-amber-400 hover:bg-amber-50"
              onClick={() => handleCompletionChoice("warning")}
            >
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="font-semibold">Weight Exceeds Limits</p>
                <p className="text-sm text-muted-foreground mt-1">Vehicle has weight exceedance - will require re-weighing</p>
              </div>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-4 px-4 border-green-200 hover:border-green-400 hover:bg-green-50"
              onClick={() => handleCompletionChoice("complete")}
            >
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="font-semibold">Complete Vehicle</p>
                <p className="text-sm text-muted-foreground mt-1">Weight is acceptable - mark vehicle as completed</p>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCompletionModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
