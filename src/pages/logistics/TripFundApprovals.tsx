import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet";
import {
    Truck,
    CheckCircle2,
    Clock,
    Search,
    MapPin,
    Fuel,
    DollarSign,
    User,
    ChevronRight,
    ArrowRight,
    AlertCircle,
    Eye,
    ShieldCheck,
    Calendar,
    Phone,
    Loader2,
    RefreshCw,
    Sparkles,
    Check,
    X,
    Filter,
    Download,
    FileSpreadsheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export default function TripFundApprovals() {
    const { user, userRole, userProfile } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTab, setSelectedTab] = useState<"pending" | "approved" | "completed" | "all">("pending");
    const [selectedTripDetails, setSelectedTripDetails] = useState<any | null>(null);
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [tripToApprove, setTripToApprove] = useState<any | null>(null);
    const [approvalNote, setApprovalNote] = useState("");
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [locationTrackingTrip, setLocationTrackingTrip] = useState<any | null>(null);

    // 1. Fetch Trip Sheets with Expenses and Linked Resources
    const {
        data: tripSheets = [],
        isLoading: isLoadingTrips,
        refetch,
        isFetching
    } = useQuery({
        queryKey: ["executive_trip_fund_approvals"],
        queryFn: async () => {
            // Try full query with all joins first
            const { data, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select(`
                    *,
                    vehicle:vehicle_id(id, vehicle_no, make_model, asset_type),
                    driver:driver_id(id, full_name, phone_number, license_no)
                `)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("[TripFundApprovals] Query error:", error);
                // Fallback: fetch without joins
                const { data: fallback, error: fallbackErr } = await supabase
                    .from("logistics_trip_sheets" as any)
                    .select("*")
                    .order("created_at", { ascending: false });
                if (fallbackErr) {
                    console.error("[TripFundApprovals] Fallback query also failed:", fallbackErr);
                    return [];
                }
                return fallback || [];
            }
            return data || [];
        }
    });

    // Fetch Trip Orders to resolve truck_reg, trailer_reg, driver_name by trip_number
    const { data: tripOrders = [] } = useQuery({
        queryKey: ["trip_orders_for_approvals_lookup"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .select("trip_number, truck_reg, trailer_reg, driver_name, contact_no");
            if (error) return [];
            return data || [];
        }
    });

    // Fetch fleet and drivers tables directly as fallback for when FK joins return null
    const { data: fleetList = [] } = useQuery({
        queryKey: ["fleet_lookup_for_approvals"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet" as any)
                .select("id, vehicle_no, trailer_number");
            if (error) return [];
            return data || [];
        }
    });

    const { data: driversList = [] } = useQuery({
        queryKey: ["drivers_lookup_for_approvals"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_drivers" as any)
                .select("id, full_name, phone_number, assigned_vehicle_id");
            if (error) return [];
            return data || [];
        }
    });

    // 2. Fetch Live Transit Trip Tracking Entries to merge live checkpoints
    const { data: transitTrips = [] } = useQuery({
        queryKey: ["executive_transit_tracking_data"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_transit_trips" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) return [];
            return data || [];
        }
    });

    // Fetch Live Location Checkpoint Updates
    const { data: locationUpdates = [] } = useQuery({
        queryKey: ["trip_location_updates"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("trip_location_updates" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) return [];
            return (data || []) as any[];
        }
    });

    // 3. Fetch detailed expenses for the active sheet modal preview
    const { data: tripExpenses = [], isLoading: isLoadingExpenses } = useQuery({
        queryKey: ["executive_trip_expenses", selectedTripDetails?.id],
        enabled: !!selectedTripDetails?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_expenses" as any)
                .select("*")
                .eq("trip_sheet_id", selectedTripDetails.id);
            if (error) return [];
            return data || [];
        }
    });

    // Merge each trip sheet with its live tracking data (by truck_no or reference_number)
    const enrichedTrips = tripSheets.map((sheet: any) => {
        const refNo = sheet.reference_number?.trim()?.toUpperCase() || "";

        // Fallback resolution from trip orders if direct FKs are empty
        // Match by exact trip_number, or by truck_reg prefix from the reference (e.g. "T 985")
        const matchedOrder = tripOrders.find((o: any) => {
            const oTrip = o.trip_number?.trim()?.toUpperCase() || "";
            if (oTrip && refNo && (oTrip === refNo || oTrip.includes(refNo) || refNo.includes(oTrip))) return true;
            // Also try matching by truck_reg prefix in the reference number
            const oTruck = o.truck_reg?.trim()?.toUpperCase() || "";
            if (oTruck && refNo && refNo.includes(oTruck.replace(/\s+/g, " ").split("/")[0])) return true;
            return false;
        });

        // Direct fleet/driver lookup by UUID when FK join returns null
        const fleetMatch = (!sheet.vehicle?.vehicle_no && sheet.vehicle_id)
            ? fleetList.find((f: any) => f.id === sheet.vehicle_id)
            : null;
        const trailerMatch = (!sheet.trailer?.vehicle_no && sheet.trailer_id)
            ? fleetList.find((f: any) => f.id === sheet.trailer_id)
            : null;
        const driverMatch = (!sheet.driver?.full_name && sheet.driver_id)
            ? driversList.find((d: any) => d.id === sheet.driver_id)
            : null;

        const effectiveVehicleId = sheet.vehicle_id || fleetMatch?.id;
        const assignedDriverMatch = !sheet.driver?.full_name && !driverMatch && effectiveVehicleId
            ? driversList.find((d: any) => d.assigned_vehicle_id === effectiveVehicleId)
            : null;

        const truckPlate = sheet.vehicle?.vehicle_no || fleetMatch?.vehicle_no || matchedOrder?.truck_reg || "T --- ---";
        const trailerPlate = sheet.trailer?.vehicle_no || sheet.trailer?.trailer_number || trailerMatch?.vehicle_no || trailerMatch?.trailer_number || matchedOrder?.trailer_reg || "---";

        const truckNo = (truckPlate !== "T --- ---" ? truckPlate : sheet.vehicle?.vehicle_no?.trim()?.toUpperCase()) || "";

        const matchedTransit = transitTrips.find((t: any) => {
            const tTruck = t.truck_no?.trim()?.toUpperCase() || "";
            const tId = t.trip_id?.trim()?.toUpperCase() || "";
            return (
                (tTruck && truckNo && (tTruck === truckNo || tTruck.includes(truckNo) || truckNo.includes(tTruck))) ||
                (tId && refNo && (tId === refNo || tId.includes(refNo)))
            );
        });

        const driverName = 
            sheet.driver?.full_name || 
            driverMatch?.full_name || 
            assignedDriverMatch?.full_name || 
            sheet.driver_name ||
            matchedOrder?.driver_name || 
            matchedTransit?.driver_name ||
            "Unassigned Driver";

        const driverPhone = 
            sheet.driver?.phone_number || 
            driverMatch?.phone_number || 
            assignedDriverMatch?.phone_number || 
            sheet.driver_phone ||
            matchedOrder?.contact_no || 
            matchedTransit?.driver_phone ||
            "";

        // Determine live tracking milestone
        let currentMilestone = "Not Dispatched";
        let milestoneTime = "";
        let transitStatus = matchedTransit?.status || "Planned";

        // Live location checkpoint updates from transit tracking
        const tripLocationUpdates = matchedTransit?.id 
            ? locationUpdates.filter((u: any) => u.trip_id === matchedTransit.id) 
            : [];
        const latestLocationUpdate = tripLocationUpdates.length > 0 ? tripLocationUpdates[0] : null;

        if (latestLocationUpdate) {
            currentMilestone = latestLocationUpdate.location + (latestLocationUpdate.reason ? ` (${latestLocationUpdate.reason})` : "");
            milestoneTime = latestLocationUpdate.created_at;
        } else if (matchedTransit) {
            if (matchedTransit.status === "Completed") {
                currentMilestone = "Trip Completed / HQ Arrived";
                milestoneTime = matchedTransit.hq_arrival_date;
            } else if (matchedTransit.offloading_date) {
                currentMilestone = `Offloading at ${matchedTransit.destination || "Destination"}`;
                milestoneTime = matchedTransit.offloading_date;
            } else if (matchedTransit.checkpoint_3_arrival_date || matchedTransit.checkpoint_3_name) {
                currentMilestone = `At ${matchedTransit.checkpoint_3_name || "Checkpoint 3"}`;
                milestoneTime = matchedTransit.checkpoint_3_arrival_date;
            } else if (matchedTransit.checkpoint_2_arrival_date || matchedTransit.checkpoint_2_name) {
                currentMilestone = `At ${matchedTransit.checkpoint_2_name || "Checkpoint 2"}`;
                milestoneTime = matchedTransit.checkpoint_2_arrival_date;
            } else if (matchedTransit.checkpoint_1_arrival_date || matchedTransit.checkpoint_1_name) {
                currentMilestone = `At ${matchedTransit.checkpoint_1_name || "Checkpoint 1"}`;
                milestoneTime = matchedTransit.checkpoint_1_arrival_date;
            } else if (matchedTransit.dispatch_date) {
                currentMilestone = "Dispatched on Route";
                milestoneTime = matchedTransit.dispatch_date;
            } else if (matchedTransit.loading_date) {
                currentMilestone = "Loading Cargo";
                milestoneTime = matchedTransit.loading_date;
            } else if (matchedTransit.arrival_loading_date) {
                currentMilestone = "Positioned at Loading Site";
                milestoneTime = matchedTransit.arrival_loading_date;
            }
        }

        const tzRate = sheet.exchange_rate || 2700;
        const totalExpensesTZS = parseFloat(sheet.total_expenses_tzs) || 0;
        const totalExpensesUSD = parseFloat(sheet.total_expenses_usd) || (totalExpensesTZS / tzRate);
        const fuelLiters = parseFloat(sheet.fuel_liters) || 0;
        const fuelAmountTZS = (parseFloat(sheet.fuel_amount) || 0) * tzRate;

        return {
            ...sheet,
            truckPlate,
            trailerPlate,
            driverName,
            driverPhone,
            tracking: matchedTransit || null,
            currentMilestone,
            milestoneTime,
            latestLocationUpdate,
            locationUpdates: tripLocationUpdates,
            transitStatus,
            totalExpensesTZS,
            totalExpensesUSD,
            fuelLiters,
            fuelAmountTZS
        };
    });

    // Filter by tab and search
    const filteredTrips = enrichedTrips.filter((t: any) => {
        const matchesSearch =
            (t.reference_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.truckPlate || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.trailerPlate || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.driverName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.destination || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.client_name || "").toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        const isPending = t.status === "Planned" || t.status === "Pending_Approval" || t.status === "Awaiting_Approval" || t.status === "Submitted" || t.status === "Draft";

        if (selectedTab === "pending") {
            return isPending;
        }
        if (selectedTab === "approved") {
            return t.status === "Approved" || t.status === "Active";
        }
        if (selectedTab === "completed") {
            return t.status === "Completed";
        }
        return true;
    });

    // Counts for tabs
    const isPendingStatus = (s: string) => s === "Planned" || s === "Pending_Approval" || s === "Awaiting_Approval" || s === "Submitted" || s === "Draft";
    const pendingCount = enrichedTrips.filter((t: any) => isPendingStatus(t.status)).length;
    const approvedCount = enrichedTrips.filter((t: any) => t.status === "Approved" || t.status === "Active").length;
    const completedCount = enrichedTrips.filter((t: any) => t.status === "Completed").length;

    // Total pending fund amount requested
    const pendingFundsTZS = enrichedTrips
        .filter((t: any) => isPendingStatus(t.status))
        .reduce((sum: number, t: any) => sum + (t.totalExpensesTZS || 0), 0);

    const pendingFundsUSD = enrichedTrips
        .filter((t: any) => isPendingStatus(t.status))
        .reduce((sum: number, t: any) => sum + (t.totalExpensesUSD || 0), 0);

    // 4. Approve Funds Mutation
    const approveFundsMutation = useMutation({
        mutationFn: async ({ tripId, note }: { tripId: string; note: string }) => {
            const approverName = userProfile?.full_name || user?.email || "Executive Leadership";

            // First try updating with all approval fields
            const updatePayload: Record<string, any> = {
                status: "Approved",
                approved_by: user?.id,
                approved_by_name: approverName,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Try with approval_notes
            let { error: sheetErr } = await supabase
                .from("logistics_trip_sheets" as any)
                .update({
                    ...updatePayload,
                    approval_notes: note || null
                })
                .eq("id", tripId);

            // If approval_notes column doesn't exist in the database table, fallback gracefully
            if (sheetErr && sheetErr.message?.includes("approval_notes")) {
                const fallbackPayload: Record<string, any> = { ...updatePayload };
                if (note?.trim()) {
                    fallbackPayload.notes = note.trim();
                }
                const res = await supabase
                    .from("logistics_trip_sheets" as any)
                    .update(fallbackPayload)
                    .eq("id", tripId);
                sheetErr = res.error;
            }

            if (sheetErr) throw sheetErr;

            // Also ensure trip entry is registered in logistics_trips for live tracking
            const tripObj = tripSheets.find((s: any) => s.id === tripId);
            if (tripObj?.reference_number) {
                const { data: existing } = await supabase
                    .from("logistics_trips" as any)
                    .select("id")
                    .eq("trip_number", tripObj.reference_number)
                    .maybeSingle();

                if (!existing) {
                    await supabase.from("logistics_trips" as any).insert({
                        trip_number: tripObj.reference_number,
                        vehicle_id: tripObj.vehicle_id || null,
                        driver_id: tripObj.driver_id || null,
                        origin: tripObj.origin || "DAR ES SALAAM",
                        destination: tripObj.destination,
                        status: "Planned",
                        created_by: user?.id
                    });
                }

                // Also update the corresponding logistics_trip_orders record so it moves into operations
                await supabase
                    .from("logistics_trip_orders" as any)
                    .update({ status: "Active", updated_at: new Date().toISOString() })
                    .eq("trip_number", tripObj.reference_number);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["executive_trip_fund_approvals"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_sheets_list"] });
            queryClient.invalidateQueries({ queryKey: ["approved_trip_sheets"] });
            queryClient.invalidateQueries({ queryKey: ["approved_orders_for_trip_sheets"] });
            queryClient.invalidateQueries({ queryKey: ["trip_orders"] });
            toast({
                title: "Funds Approved & Released ✓",
                description: "The trip budget is approved. Finance and Logistics have been updated."
            });
            setIsApproveDialogOpen(false);
            setTripToApprove(null);
            setApprovalNote("");
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Approval Failed",
                description: err.message || "Failed to approve trip funds."
            });
        }
    });

    const handleOpenApproveDialog = (trip: any) => {
        setTripToApprove(trip);
        setIsApproveDialogOpen(true);
    };

    const [downloadingTripId, setDownloadingTripId] = useState<string | null>(null);

    const handleExportExcel = async (trip: any, explicitExpenses?: any[]) => {
        if (!trip) return;
        setDownloadingTripId(trip.id);
        setIsExportingExcel(true);
        try {
            let expenses = explicitExpenses;
            if (!expenses) {
                const { data, error } = await supabase
                    .from("logistics_trip_expenses" as any)
                    .select("*")
                    .eq("trip_sheet_id", trip.id);
                if (error) throw error;
                expenses = data || [];
            }

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Trip Budget');

            // Styles matching TripSheet.tsx exactly
            const titleStyle: Partial<ExcelJS.Style> = {
                font: { bold: true, size: 16, color: { argb: '000000' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } }, // Gold/Amber
                alignment: { horizontal: 'center', vertical: 'middle' }
            };

            const headerStyle: Partial<ExcelJS.Style> = {
                font: { bold: true, color: { argb: '000000' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } },
                border: {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                }
            };

            const subtotalStyle: Partial<ExcelJS.Style> = {
                font: { bold: true },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } }
            };

            const borderStyle: Partial<ExcelJS.Borders> = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Column widths
            sheet.getColumn(1).width = 30; // Item Description
            sheet.getColumn(2).width = 20; // Nature
            sheet.getColumn(3).width = 20; // TZS Amount
            sheet.getColumn(4).width = 15; // USD Equivalent
            sheet.getColumn(5).width = 20; // Other Currency (ZMW/RWF/BIF)

            // 1. Title
            sheet.mergeCells('A1:E2');
            const titleCell = sheet.getCell('A1');
            titleCell.value = 'TRIP BUDGET & CLEARANCE SHEET';
            titleCell.style = titleStyle;

            let currRow = 4;

            // Extract country rates and active countries
            const countryRates: Record<string, number> = trip.country_rates && typeof trip.country_rates === 'object'
                ? trip.country_rates
                : { TZ: trip.exchange_rate || 2700, Zambia: 25.5, DRC: 1.0, Rwanda: 2.0, Burundi: 1.0 };
            
            const tzR = countryRates["TZ"] || trip.exchange_rate || 2700;
            const zmwR = countryRates["Zambia"] || 25.5;

            const activeCountries: string[] = Array.isArray(trip.active_countries) && trip.active_countries.length > 0
                ? trip.active_countries
                : ['TZ', 'Zambia', 'DRC', 'Rwanda', 'Burundi', 'Fixed'];

            // 2. Trip Details Headers
            const addProjectInfo = (label: string, value: string) => {
                const rowIdx = currRow++;
                const row = sheet.getRow(rowIdx);
                row.getCell(1).value = label;
                row.getCell(1).font = { bold: true };
                row.getCell(1).border = borderStyle;
                row.getCell(2).value = value;
                row.getCell(2).border = borderStyle;
                row.getCell(3).border = borderStyle;
                row.getCell(4).border = borderStyle;
                row.getCell(5).border = borderStyle;
                sheet.mergeCells(`B${rowIdx}:E${rowIdx}`);
            };

            addProjectInfo('Trip Reference:', trip.reference_number || 'STANDALONE-BUDGET');
            addProjectInfo('Date Generated:', format(new Date(), "dd/MM/yyyy"));
            addProjectInfo('Vehicle (Horse):', trip.truckPlate || 'Pending');
            addProjectInfo('Linked Trailer:', trip.trailerPlate || 'None Coupled');
            addProjectInfo('Driver:', trip.driverName || 'Pending');
            addProjectInfo('Route / Destination:', `${trip.origin || 'DAR ES SALAAM'} → ${trip.destination || 'Not Specified'}`);
            addProjectInfo(
                'Exchange Rates:',
                `1 USD = ${tzR} TZS${activeCountries.includes('Zambia') ? ` | 1 USD = ${countryRates["Zambia"] || 25.5} ZMW` : ''}${activeCountries.includes('DRC') ? ` | 1 USD = ${countryRates["DRC"] || 1.0} DRC Rate` : ''}${activeCountries.includes('Rwanda') ? ` | 1 USD = ${countryRates["Rwanda"] || 2} RWF` : ''}${activeCountries.includes('Burundi') ? ` | 1 USD = ${countryRates["Burundi"] || 1} BIF` : ''}`
            );

            currRow += 2;

            // 3. Financial Summary
            sheet.mergeCells(`A${currRow}:E${currRow}`);
            sheet.getRow(currRow).getCell(1).value = 'FINANCIAL SUMMARY';
            sheet.getRow(currRow).getCell(1).font = { bold: true, size: 12 };
            sheet.getRow(currRow).getCell(1).alignment = { horizontal: 'center' };
            currRow++;

            const addSummaryLine = (label: string, usd: number, tzs: number, color?: string) => {
                const rowIdx = currRow++;
                const row = sheet.getRow(rowIdx);
                row.getCell(1).value = label;
                row.getCell(3).value = tzs;
                row.getCell(3).numFmt = '#,##0 "TSHS"';
                row.getCell(3).font = { bold: true };
                
                row.getCell(4).value = usd;
                row.getCell(4).numFmt = '"$"#,##0.00';
                
                row.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    if (colNumber <= 5) c.border = borderStyle;
                });
                
                if (color) row.getCell(1).font = { bold: true, color: { argb: color } };
                sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
            };

            const rawRev = parseFloat(trip.revenue_amount || '0');
            const revUsd = trip.revenue_currency === 'TZS' ? rawRev / tzR : rawRev;
            const revTzs = trip.revenue_currency === 'TZS' ? rawRev : rawRev * tzR;

            // Compute expenses totals by category
            const budgetedExpenses = expenses.filter((e: any) => !e.is_extra);
            const extraExpensesArr = expenses.filter((e: any) => e.is_extra);

            const buildCatTotals = (list: any[]) => {
                const acc: Record<string, { usd: number; tzs: number }> = {};
                list.forEach((e: any) => {
                    const cat = e.category || 'TZ';
                    if (!acc[cat]) acc[cat] = { usd: 0, tzs: 0 };
                    const amt = parseFloat(e.amount) || 0;
                    const effCurr = (cat === 'DRC') ? 'USD' : (e.currency || 'TZS');
                    let u = 0;
                    let t = 0;
                    if (effCurr === 'USD') {
                        u = amt;
                        t = amt * tzR;
                    } else if (effCurr === 'TZS' || cat === 'TZ' || cat === 'Fixed') {
                        t = amt;
                        u = amt / tzR;
                    } else {
                        const localRate = cat === 'Zambia' ? (countryRates['Zambia'] || 140) : (countryRates[cat] || 1);
                        t = amt * localRate;
                        u = t / tzR;
                    }
                    acc[cat].usd += u;
                    acc[cat].tzs += t;
                });
                return acc;
            };

            const categoryTotals = buildCatTotals(budgetedExpenses);
            const extraCategoryTotals = buildCatTotals(extraExpensesArr);

            const totalOperationalUSD = Object.values(categoryTotals).reduce((sum, c) => sum + c.usd, 0);
            const totalOperationalTZS = totalOperationalUSD * tzR;

            const fuelEntries = trip.country_rates?.fuel_entries || (trip.fuel_liters && trip.fuel_price ? [{ liters: trip.fuel_liters, price: trip.fuel_price }] : []);
            const fuelLiters = trip.fuelLiters || (parseFloat(trip.fuel_liters) || 0);
            const fuelCostUSD = parseFloat(trip.fuel_amount) || (fuelEntries.reduce((s: number, e: any) => s + ((parseFloat(e.liters) || 0) * (parseFloat(e.price) || 0)), 0) / tzR);
            const fuelCostTZS = fuelCostUSD * tzR;

            const isWithFuel = trip.revenue_type === 'With Fuel';
            const activeFuelUSD = isWithFuel ? fuelCostUSD : 0;
            const activeFuelTZS = isWithFuel ? fuelCostTZS : 0;

            const totalTripCostsUSD = totalOperationalUSD + activeFuelUSD;
            const totalTripCostsTZS = totalOperationalTZS + activeFuelTZS;
            const netProfitUSD = revUsd - totalTripCostsUSD;

            addSummaryLine('GROSS TRIP REVENUE', revUsd, revTzs);
            addSummaryLine('ROAD EXPENSES', totalOperationalUSD, totalOperationalTZS, 'C0504D');
            if (isWithFuel && fuelCostUSD > 0) {
                addSummaryLine(`FUEL COST (${fuelLiters.toLocaleString()} L)`, fuelCostUSD, fuelCostTZS, 'ED7D31');
            }
            addSummaryLine('TOTAL TRIP COSTS', totalTripCostsUSD, totalTripCostsTZS, 'C0504D');
            addSummaryLine('PROJECTED NET PROFIT', netProfitUSD, netProfitUSD * tzR, netProfitUSD < 0 ? 'C0504D' : '107C10');

            currRow += 2;

            // 4. Detailed Expenses Breakdown
            const categories = [
                { id: 'TZ', label: 'TANZANIA OPERATIONS', rateLabel: `Exchange Rate: 1 USD = ${tzR} TZS` },
                { id: 'Zambia', label: 'ZAMBIA OPERATIONS', rateLabel: `Exchange Rate: 1 USD = ${zmwR} ZMW` },
                { id: 'DRC', label: 'DR CONGO OPERATIONS', rateLabel: `Exchange Rate: 1 USD = ${tzR} TZS` },
                { id: 'Rwanda', label: 'RWANDA OPERATIONS', rateLabel: `Exchange Rate: 1 USD = ${countryRates["Rwanda"] || 2} RWF` },
                { id: 'Burundi', label: 'BURUNDI OPERATIONS', rateLabel: `Exchange Rate: 1 USD = ${countryRates["Burundi"] || 1} BIF` },
                { id: 'Fixed', label: 'FIXED EXPENSES & OVERHEAD', rateLabel: '' }
            ];

            categories.forEach(cat => {
                const catExpenses = expenses.filter((e: any) => e.category === cat.id && !e.is_extra);
                if (catExpenses.length === 0 && !activeCountries.includes(cat.id)) return;

                const sectionHeaderIdx = currRow++;
                const sectionHeader = sheet.getRow(sectionHeaderIdx);
                sectionHeader.getCell(1).value = cat.label;
                sectionHeader.getCell(1).style = headerStyle;
                sheet.mergeCells(`A${sectionHeaderIdx}:E${sectionHeaderIdx}`);

                if ((cat as any).rateLabel && cat.id !== 'Fixed') {
                    const rateRowIdx = currRow++;
                    const rateRow = sheet.getRow(rateRowIdx);
                    rateRow.getCell(1).value = (cat as any).rateLabel;
                    rateRow.getCell(1).font = { italic: true, size: 9, color: { argb: '6B7280' } };
                    sheet.mergeCells(`A${rateRowIdx}:E${rateRowIdx}`);
                }

                const tableHeader = sheet.getRow(currRow++);
                tableHeader.getCell(1).value = 'Item Description';
                tableHeader.getCell(2).value = 'Nature';
                tableHeader.getCell(3).value = 'Amount (USD)';
                tableHeader.getCell(3).alignment = { horizontal: 'right' };
                
                let tzsCol = 4;
                if (cat.id === 'Zambia') {
                    tableHeader.getCell(4).value = 'Amount (ZMW)';
                    tableHeader.getCell(4).alignment = { horizontal: 'right' };
                    tzsCol = 5;
                } else if (cat.id === 'Rwanda') {
                    tableHeader.getCell(4).value = 'Amount (RWF)';
                    tableHeader.getCell(4).alignment = { horizontal: 'right' };
                    tzsCol = 5;
                } else if (cat.id === 'Burundi') {
                    tableHeader.getCell(4).value = 'Amount (BIF)';
                    tableHeader.getCell(4).alignment = { horizontal: 'right' };
                    tzsCol = 5;
                }
                
                tableHeader.getCell(tzsCol).value = 'Amount (TZS)';
                tableHeader.getCell(tzsCol).alignment = { horizontal: 'right' };
                
                tableHeader.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    const limit = ['Zambia', 'Rwanda', 'Burundi'].includes(cat.id) ? 5 : 4;
                    if (colNumber <= limit) {
                        c.font = { bold: true };
                        c.border = borderStyle;
                        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
                    }
                });

                catExpenses.forEach((exp: any) => {
                    const rowIdx = currRow++;
                    const row = sheet.getRow(rowIdx);
                    
                    const amt = parseFloat(exp.amount) || 0;
                    let amtUsd = 0;
                    let amtTzs = 0;
                    let amtLocal = 0;

                    const effectiveCurrency = (cat.id === 'DRC') ? 'USD' : (exp.currency || 'TZS');

                    if (effectiveCurrency === 'USD') {
                        amtUsd = amt;
                        amtTzs = amt * tzR;
                        if (cat.id === 'Zambia') amtLocal = amtTzs / (countryRates["Zambia"] || 140);
                        else if (cat.id === 'Rwanda') amtLocal = amtTzs / (countryRates["Rwanda"] || 2);
                        else if (cat.id === 'Burundi') amtLocal = amtTzs / (countryRates["Burundi"] || 1);
                    } else {
                        if (cat.id === 'TZ' || cat.id === 'Fixed') {
                            amtTzs = amt;
                            amtUsd = amt / tzR;
                        } else if (cat.id === 'Zambia') {
                            amtLocal = amt;
                            amtTzs = amt * (countryRates["Zambia"] || 140);
                            amtUsd = amtTzs / tzR;
                        } else if (cat.id === 'DRC') {
                            amtUsd = amt;
                            amtTzs = amt * tzR;
                        } else if (cat.id === 'Rwanda') {
                            amtLocal = amt;
                            amtTzs = amt * (countryRates["Rwanda"] || 2);
                            amtUsd = amtTzs / tzR;
                        } else if (cat.id === 'Burundi') {
                            amtLocal = amt;
                            amtTzs = amt * (countryRates["Burundi"] || 1);
                            amtUsd = amtTzs / tzR;
                        }
                    }

                    row.getCell(1).value = exp.item_name;
                    row.getCell(2).value = exp.nature || 'General';
                    
                    row.getCell(3).value = amtUsd;
                    row.getCell(3).numFmt = '"$"#,##0.00';
                    
                    if (cat.id === 'Zambia') {
                        row.getCell(4).value = Math.round(amtLocal);
                        row.getCell(4).numFmt = '#,##0 "K"';
                    } else if (cat.id === 'Rwanda') {
                        row.getCell(4).value = Math.round(amtLocal);
                        row.getCell(4).numFmt = '#,##0 "RWF"';
                    } else if (cat.id === 'Burundi') {
                        row.getCell(4).value = Math.round(amtLocal);
                        row.getCell(4).numFmt = '#,##0 "BIF"';
                    }

                    row.getCell(tzsCol).value = Math.round(amtTzs);
                    row.getCell(tzsCol).numFmt = '#,##0';
                    
                    row.eachCell({ includeEmpty: true }, (c, colNumber) => {
                        const limit = ['Zambia', 'Rwanda', 'Burundi'].includes(cat.id) ? 5 : 4;
                        if (colNumber <= limit) c.border = borderStyle;
                    });
                });

                const subTotalRowIdx = currRow++;
                const subTotalRow = sheet.getRow(subTotalRowIdx);
                subTotalRow.getCell(1).value = `SUBTOTAL ${cat.label}`;
                subTotalRow.getCell(1).style = subtotalStyle;
                
                subTotalRow.getCell(3).value = categoryTotals[cat.id]?.usd || 0;
                subTotalRow.getCell(3).numFmt = '"$"#,##0.00';
                
                if (cat.id === 'Zambia') {
                    subTotalRow.getCell(4).value = Math.round((categoryTotals[cat.id]?.usd || 0) * (countryRates["Zambia"] || 100));
                    subTotalRow.getCell(4).numFmt = '#,##0 "K"';
                } else if (cat.id === 'Rwanda') {
                    subTotalRow.getCell(4).value = Math.round((categoryTotals[cat.id]?.usd || 0) * (countryRates["Rwanda"] || 2));
                    subTotalRow.getCell(4).numFmt = '#,##0 "RWF"';
                } else if (cat.id === 'Burundi') {
                    subTotalRow.getCell(4).value = Math.round((categoryTotals[cat.id]?.usd || 0) * (countryRates["Burundi"] || 1));
                    subTotalRow.getCell(4).numFmt = '#,##0 "BIF"';
                }
                
                subTotalRow.getCell(tzsCol).value = categoryTotals[cat.id]?.tzs || 0;
                subTotalRow.getCell(tzsCol).numFmt = '#,##0';
                
                sheet.mergeCells(`A${subTotalRowIdx}:B${subTotalRowIdx}`);

                subTotalRow.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    const limit = ['Zambia', 'Rwanda', 'Burundi'].includes(cat.id) ? 5 : 4;
                    if (colNumber <= limit) {
                        c.font = { bold: true };
                        c.border = borderStyle;
                    }
                });

                currRow += 1;
            });

            // 4.1 UNBUDGETED / EXTRA EXPENSES
            if (extraExpensesArr.length > 0) {
                currRow++;
                const extraHeaderIdx = currRow++;
                const extraHeader = sheet.getRow(extraHeaderIdx);
                extraHeader.getCell(1).value = 'UNBUDGETED / EXTRA EXPENSES';
                extraHeader.getCell(1).style = { ...headerStyle, font: { bold: true, color: { argb: 'FFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC2626' } } };
                sheet.mergeCells(`A${extraHeaderIdx}:E${extraHeaderIdx}`);

                const tableHeader = sheet.getRow(currRow++);
                tableHeader.getCell(1).value = 'Item Description';
                tableHeader.getCell(2).value = 'Location / Country';
                tableHeader.getCell(3).value = 'Amount (USD)';
                tableHeader.getCell(3).alignment = { horizontal: 'right' };
                tableHeader.getCell(4).value = 'Amount (TZS)';
                tableHeader.getCell(4).alignment = { horizontal: 'right' };

                tableHeader.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    if (colNumber <= 4) {
                        c.font = { bold: true };
                        c.border = borderStyle;
                        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
                    }
                });

                extraExpensesArr.forEach((exp: any) => {
                    const rowIdx = currRow++;
                    const row = sheet.getRow(rowIdx);
                    
                    const amt = parseFloat(exp.amount) || 0;
                    let amtUsd = 0;
                    let amtTzs = 0;

                    const effectiveCurrency = (exp.category === 'DRC') ? 'USD' : (exp.currency || 'TZS');

                    if (effectiveCurrency === 'USD') {
                        amtUsd = amt;
                        amtTzs = amt * tzR;
                    } else if (effectiveCurrency === 'TZS' || exp.category === 'TZ') {
                        amtTzs = amt;
                        amtUsd = amt / tzR;
                    } else {
                        let localRate = 1;
                        if (exp.category === 'Zambia') localRate = countryRates["Zambia"] || 140;
                        else if (exp.category === 'Rwanda') localRate = countryRates["Rwanda"] || 2;
                        else if (exp.category === 'Burundi') localRate = countryRates["Burundi"] || 1;
                        
                        amtTzs = amt * localRate;
                        amtUsd = amtTzs / tzR;
                    }

                    row.getCell(1).value = exp.item_name;
                    row.getCell(2).value = exp.category === 'TZ' ? 'Tanzania' : exp.category;
                    
                    row.getCell(3).value = amtUsd;
                    row.getCell(3).numFmt = '"$"#,##0.00';
                    
                    row.getCell(4).value = Math.round(amtTzs);
                    row.getCell(4).numFmt = '#,##0';
                    
                    row.eachCell({ includeEmpty: true }, (c, colNumber) => {
                        if (colNumber <= 4) c.border = borderStyle;
                    });
                });

                const totalExtraUSD = Object.values(extraCategoryTotals).reduce((sum, c) => sum + c.usd, 0);
                const totalExtraTZS = totalExtraUSD * tzR;

                const subTotalRowIdx = currRow++;
                const subTotalRow = sheet.getRow(subTotalRowIdx);
                subTotalRow.getCell(1).value = `SUBTOTAL EXTRA EXPENSES`;
                subTotalRow.getCell(1).style = { ...subtotalStyle, font: { bold: true, color: { argb: '991B1B' } } };
                
                subTotalRow.getCell(3).value = totalExtraUSD;
                subTotalRow.getCell(3).numFmt = '"$"#,##0.00';
                
                subTotalRow.getCell(4).value = totalExtraTZS;
                subTotalRow.getCell(4).numFmt = '#,##0';

                sheet.mergeCells(`A${subTotalRowIdx}:B${subTotalRowIdx}`);

                subTotalRow.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    if (colNumber <= 4) c.border = borderStyle;
                });
            }

            currRow += 2;

            // 4.5 Fuel Allocation Section
            if (isWithFuel || fuelEntries.length > 0) {
                const fuelHeaderIdx = currRow++;
                const fuelHeader = sheet.getRow(fuelHeaderIdx);
                fuelHeader.getCell(1).value = 'FUEL ALLOCATION';
                fuelHeader.getCell(1).style = headerStyle;
                sheet.mergeCells(`A${fuelHeaderIdx}:E${fuelHeaderIdx}`);

                const fuelTableHeader = sheet.getRow(currRow++);
                fuelTableHeader.getCell(1).value = 'Station / Description';
                fuelTableHeader.getCell(2).value = 'Liters';
                fuelTableHeader.getCell(3).value = 'Price (TShs)';
                fuelTableHeader.getCell(3).alignment = { horizontal: 'right' };
                fuelTableHeader.getCell(4).value = 'Amount (USD)';
                fuelTableHeader.getCell(4).alignment = { horizontal: 'right' };
                fuelTableHeader.getCell(5).value = 'Amount (TZS)';
                fuelTableHeader.getCell(5).alignment = { horizontal: 'right' };

                fuelTableHeader.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    if (colNumber <= 5) {
                        c.font = { bold: true };
                        c.border = borderStyle;
                        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
                    }
                });

                const activeFuelEntries = fuelEntries.length > 0 ? fuelEntries : [{ liters: fuelLiters, price: trip.fuel_price || 0 }];
                let grandLiters = 0;
                let grandTZS = 0;

                activeFuelEntries.forEach((entry: any, idx: number) => {
                    const rowIdx = currRow++;
                    const row = sheet.getRow(rowIdx);
                    const liters = parseFloat(entry.liters) || 0;
                    const price = parseFloat(entry.price) || 0;
                    const tzs = liters * price;
                    const usd = tzs / tzR;

                    grandLiters += liters;
                    grandTZS += tzs;

                    row.getCell(1).value = entry.station || (idx === 0 ? 'Primary Fuel Station' : `Fuel Station ${idx + 1}`);
                    row.getCell(2).value = liters;
                    row.getCell(3).value = price;
                    
                    row.getCell(4).value = usd;
                    row.getCell(4).numFmt = '"$"#,##0.00';
                    
                    row.getCell(5).value = tzs;
                    row.getCell(5).numFmt = '#,##0';

                    row.eachCell({ includeEmpty: true }, (c, colNumber) => {
                        if (colNumber <= 5) c.border = borderStyle;
                    });
                });

                const fuelSubTotalRowIdx = currRow++;
                const fuelSubTotalRow = sheet.getRow(fuelSubTotalRowIdx);
                fuelSubTotalRow.getCell(1).value = 'SUBTOTAL FUEL ALLOCATION';
                fuelSubTotalRow.getCell(1).style = subtotalStyle;
                
                fuelSubTotalRow.getCell(2).value = grandLiters;
                fuelSubTotalRow.getCell(2).font = { bold: true };
                fuelSubTotalRow.getCell(2).border = borderStyle;
                
                fuelSubTotalRow.getCell(3).border = borderStyle;
                
                fuelSubTotalRow.getCell(4).value = grandTZS / tzR;
                fuelSubTotalRow.getCell(4).numFmt = '"$"#,##0.00';
                
                fuelSubTotalRow.getCell(5).value = grandTZS;
                fuelSubTotalRow.getCell(5).numFmt = '#,##0';
                
                sheet.mergeCells(`A${fuelSubTotalRowIdx}:A${fuelSubTotalRowIdx}`);

                fuelSubTotalRow.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    if (colNumber <= 5) {
                        if (colNumber !== 2) c.font = { bold: true };
                        c.border = borderStyle;
                    }
                });

                currRow += 2;
            }

            // 5. Signature Section
            const addSignatureTable = (title: string, name: string, pos: string) => {
                const headRow = sheet.getRow(currRow++);
                headRow.getCell(1).value = title.toUpperCase();
                headRow.getCell(2).value = 'POSITION';
                headRow.getCell(3).value = 'SIGNATURE & DATE';
                headRow.eachCell(c => {
                    c.style = titleStyle;
                    c.border = borderStyle;
                    c.font = { bold: true, size: 10 };
                });
                sheet.mergeCells(`C${currRow - 1}:E${currRow - 1}`);

                const dataRow = sheet.getRow(currRow++);
                dataRow.height = 40;
                dataRow.getCell(1).value = name;
                dataRow.getCell(2).value = pos;
                dataRow.eachCell(c => {
                    c.alignment = { vertical: 'middle' };
                    c.border = borderStyle;
                });
                sheet.mergeCells(`C${currRow - 1}:E${currRow - 1}`);
                currRow++;
            };

            sheet.getColumn(4).width = 25;

            addSignatureTable('Prepared By', trip.created_by_name || 'KONYA PAUL', 'Fleet Manager');
            addSignatureTable('First Approved By', 'YAHYA KILUA', 'Operations Manager');
            addSignatureTable('Final Approved By', 'SOOD M. SOOD', 'Managing Director');

            // 6. Lock the sheet (Read-only protection)
            sheet.protect('qoder123', {
                formatColumns: true,
                formatRows: true,
                formatCells: true,
                selectLockedCells: true,
                selectUnlockedCells: true,
                insertColumns: false,
                insertRows: false,
                deleteColumns: false,
                deleteRows: false
            });

            const workbookBuffer = await workbook.xlsx.writeBuffer();
            const tripRef = trip.reference_number || 'Trip';
            const routeSlug = trip.destination ? `_${trip.destination.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
            saveAs(new Blob([workbookBuffer]), `${tripRef}${routeSlug}.xlsx`);
            toast({
                title: "Excel Downloaded ✓",
                description: `Exported official Trip Budget & Clearance Sheet for ${trip.reference_number || "trip"}.`
            });
        } catch (err: any) {
            console.error("Excel export error:", err);
            toast({
                variant: "destructive",
                title: "Export Failed",
                description: err.message || "Failed to generate Excel file."
            });
        } finally {
            setIsExportingExcel(false);
            setDownloadingTripId(null);
        }
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto animate-in fade-in duration-300">
            {/* 👑 EXECUTIVE HEADER */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-6 shadow-xl border border-indigo-900/40 relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                                Executive Hub
                            </Badge>
                            <span className="text-xs text-slate-400 font-medium">Boss Direct Access</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
                            Trip Fund Approvals & Live Tracking
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                            One-stop command for executive leadership to review financial requests and live truck locations before releasing trip expenses.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 self-start md:self-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 shadow-sm"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>
                    </div>
                </div>

                {/* KPI CARDS INSIDE HEADER */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-white/10">
                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                        <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Awaiting Release</p>
                        <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{pendingCount}</p>
                        <p className="text-[10px] text-slate-400">Trips pending decision</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Approved / Dispatched</p>
                        <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{approvedCount}</p>
                        <p className="text-[10px] text-slate-400">Active journey & transit</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                        <p className="text-[10px] font-bold text-teal-300 uppercase tracking-wider">Completed Trips</p>
                        <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{completedCount}</p>
                        <p className="text-[10px] text-slate-400">Arrived & settled</p>
                    </div>
                </div>
            </div>

            {/* CONTROLS: SEARCH & TABS */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Responsive Tabs */}
                <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
                    <button
                        onClick={() => setSelectedTab("pending")}
                        className={cn(
                            "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                            selectedTab === "pending"
                                ? "bg-white text-indigo-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <span>Awaiting Release</span>
                        {pendingCount > 0 && (
                            <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center">
                                {pendingCount}
                            </Badge>
                        )}
                    </button>

                    <button
                        onClick={() => setSelectedTab("approved")}
                        className={cn(
                            "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                            selectedTab === "approved"
                                ? "bg-white text-indigo-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <span>Approved & Released</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {approvedCount}
                        </Badge>
                    </button>

                    <button
                        onClick={() => setSelectedTab("completed")}
                        className={cn(
                            "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                            selectedTab === "completed"
                                ? "bg-white text-indigo-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <span>Completed Trips</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 text-teal-800 border-teal-200">
                            {completedCount}
                        </Badge>
                    </button>

                    <button
                        onClick={() => setSelectedTab("all")}
                        className={cn(
                            "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                            selectedTab === "all"
                                ? "bg-white text-indigo-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        All Trips
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search truck, driver, route, client..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-10 bg-white border-slate-200 text-xs rounded-xl shadow-sm focus-visible:ring-indigo-500"
                    />
                </div>
            </div>

            {/* LIST OF TRIPS (Mobile-First Executive Cards) */}
            {isLoadingTrips ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Loading Executive Trip Data...
                    </p>
                </div>
            ) : filteredTrips.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                        <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                        No Trips Found
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        {selectedTab === "pending"
                            ? "Awesome! All trip expense requests have been reviewed and released."
                            : "No trips matching your current search query."}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredTrips.map((trip: any) => {
                        const isPending = isPendingStatus(trip.status);
                        const truckPlate = trip.truckPlate || "T --- ---";
                        const trailerPlate = trip.trailerPlate || "---";
                        const driverName = trip.driverName || "Unassigned Driver";
                        const driverPhone = trip.driverPhone || "";

                        return (
                            <Card
                                key={trip.id}
                                className={cn(
                                    "border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md bg-white",
                                    isPending
                                        ? "border-amber-200/90 ring-1 ring-amber-100"
                                        : "border-slate-200"
                                )}
                            >
                                <CardContent className="p-4 sm:p-5">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                        {/* SECTION 1: TRUCK, ROUTE, & CLIENT */}
                                        <div className="flex-1 space-y-3">
                                            {/* Top Line: Ref #, Status Badge, Client */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge
                                                    className={cn(
                                                        "text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider",
                                                        isPending
                                                            ? "bg-amber-100 text-amber-800 border-amber-300"
                                                            : trip.status === "Approved"
                                                            ? "bg-blue-100 text-blue-800 border-blue-300"
                                                            : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                                    )}
                                                >
                                                    {isPending ? "Awaiting Release" : trip.status}
                                                </Badge>

                                                <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                                    Ref: {trip.reference_number || "TRIP"}
                                                </span>

                                                {trip.client_name && (
                                                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 truncate max-w-[200px]">
                                                        {trip.client_name}
                                                    </span>
                                                )}

                                                <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">
                                                    Prepared: {format(new Date(trip.created_at), "dd MMM yyyy")}
                                                </span>
                                            </div>

                                            {/* Main Vehicle & Route Info */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                                {/* Truck & Driver */}
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-1.5 bg-slate-900 text-white rounded-lg">
                                                            <Truck size={14} />
                                                        </div>
                                                        <span className="text-sm font-black text-slate-900 tracking-tight">
                                                            {truckPlate}
                                                        </span>
                                                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                            Trailer: {trailerPlate}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 text-xs text-slate-600 pl-8">
                                                        <User size={12} className="text-slate-400 shrink-0" />
                                                        <span className="font-semibold">{driverName}</span>
                                                        {driverPhone && (
                                                            <a
                                                                href={`tel:${driverPhone}`}
                                                                className="text-indigo-600 hover:underline flex items-center gap-0.5 ml-1 text-[11px]"
                                                            >
                                                                <Phone size={10} />
                                                                {driverPhone}
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Route & Cargo */}
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                                                        <MapPin size={13} className="text-rose-500 shrink-0" />
                                                        <span className="truncate">{trip.origin || "DAR ES SALAAM"}</span>
                                                        <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                                        <span className="text-indigo-900 truncate">
                                                            {trip.destination || "DESTINATION"}
                                                        </span>
                                                    </div>

                                                    <div className="text-[11px] text-slate-500 pl-5">
                                                        <span className="font-medium text-slate-700">
                                                            {trip.cargo_outbound || "General Cargo"}
                                                        </span>
                                                        {trip.agreed_days && (
                                                            <span className="text-slate-400 ml-1.5 font-medium">
                                                                ({trip.agreed_days} days agreed)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* LIVE TRACKING BANNER */}
                                            <div 
                                                onClick={() => setLocationTrackingTrip(trip)}
                                                className="bg-slate-50 hover:bg-sky-50/60 border border-slate-200/80 hover:border-sky-300 rounded-xl p-2.5 flex items-center justify-between gap-2 mt-2 cursor-pointer transition-all group/tracking shadow-sm"
                                                title="Click to view full live location history"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={cn(
                                                        "w-2 h-2 rounded-full shrink-0",
                                                        trip.latestLocationUpdate ? "bg-sky-500 animate-pulse shadow-[0_0_6px_#0ea5e9]" : "bg-emerald-500 animate-pulse"
                                                    )} />
                                                    <div className="truncate">
                                                        <span className="text-[10px] font-bold text-slate-400 group-hover/tracking:text-sky-600 uppercase tracking-wider mr-1.5 transition-colors">
                                                            {trip.latestLocationUpdate ? "Live Checkpoint:" : "Live Tracking:"}
                                                        </span>
                                                        <span className="text-xs font-bold text-slate-800 group-hover/tracking:text-sky-950 transition-colors">
                                                            {trip.currentMilestone}
                                                        </span>
                                                        {trip.milestoneTime && (
                                                            <span className="text-[10px] text-slate-500 group-hover/tracking:text-sky-700 ml-1.5 font-normal hidden sm:inline">
                                                                ({formatDistanceToNow(new Date(trip.milestoneTime), { addSuffix: true })})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {trip.locationUpdates && trip.locationUpdates.length > 0 && (
                                                        <span className="text-[9px] font-bold text-sky-700 bg-sky-100/80 border border-sky-200 px-1.5 py-0.5 rounded-full">
                                                            {trip.locationUpdates.length} updates
                                                        </span>
                                                    )}
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[9px] font-bold px-1.5 py-0 h-4 uppercase border-slate-300 text-slate-600 bg-white group-hover/tracking:border-sky-300"
                                                    >
                                                        {trip.transitStatus}
                                                    </Badge>
                                                    <Eye size={12} className="text-slate-400 group-hover/tracking:text-sky-600 transition-colors ml-0.5" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECTION 2: FINANCIAL SUMMARY & BOSS 1-CLICK ACTION */}
                                        <div className="flex flex-col sm:flex-row lg:flex-col justify-between items-stretch lg:items-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 min-w-[240px]">
                                            {/* Money Requested */}
                                            <div className="text-left lg:text-right">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                                    Total Funds Requested
                                                </span>
                                                <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                                                    TShs {Math.round(trip.totalExpensesTZS).toLocaleString()}
                                                </div>
                                                <div className="text-xs font-bold text-emerald-600">
                                                    ≈ ${trip.totalExpensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                                </div>

                                                {trip.fuelLiters > 0 && (
                                                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 lg:ml-auto w-fit">
                                                        <Fuel size={11} />
                                                        <span>Fuel: {trip.fuelLiters.toLocaleString()} L</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleExportExcel(trip)}
                                                    disabled={isExportingExcel && downloadingTripId === trip.id}
                                                    className="h-9 px-2.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-200 gap-1.5 shadow-sm"
                                                    title="Download Excel budget breakdown"
                                                >
                                                    {isExportingExcel && downloadingTripId === trip.id ? (
                                                        <Loader2 size={13} className="animate-spin text-emerald-600" />
                                                    ) : (
                                                        <FileSpreadsheet size={13} className="text-emerald-600" />
                                                    )}
                                                    <span className="hidden sm:inline text-[11px]">Excel</span>
                                                </Button>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setSelectedTripDetails(trip)}
                                                    className="h-9 px-3 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border-slate-200 gap-1.5 flex-1 sm:flex-none"
                                                    title="View full item-by-item expense breakdown"
                                                >
                                                    <Eye size={13} />
                                                    <span>Breakdown</span>
                                                </Button>

                                                {isPending ? (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleOpenApproveDialog(trip)}
                                                        disabled={approveFundsMutation.isPending}
                                                        className="h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 gap-1.5 flex-1 sm:flex-none"
                                                    >
                                                        <CheckCircle2 size={14} />
                                                        <span>Approve Funds</span>
                                                    </Button>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                                                        <ShieldCheck size={14} />
                                                        <span>Funds Approved</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* 📋 EXPENSE BREAKDOWN DRAWER (Mobile Friendly) */}
            <Sheet
                open={!!selectedTripDetails}
                onOpenChange={(open) => !open && setSelectedTripDetails(null)}
            >
                <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto bg-white">
                    {selectedTripDetails && (
                        <div className="p-6 space-y-6">
                            <SheetHeader className="text-left border-b pb-4">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                        Ref: {selectedTripDetails.reference_number}
                                    </Badge>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {selectedTripDetails.client_name || "Client"}
                                    </span>
                                </div>
                                <SheetTitle className="text-lg font-black text-slate-900 flex items-center gap-2 mt-1">
                                    <Truck size={18} className="text-indigo-600" />
                                    {selectedTripDetails.truckPlate || selectedTripDetails.vehicle?.vehicle_no || "Vehicle Details"}
                                </SheetTitle>
                                <p className="text-xs text-slate-500">
                                    Route: {selectedTripDetails.origin} → {selectedTripDetails.destination}
                                </p>
                            </SheetHeader>

                            {/* Financial Summary Card */}
                            <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-[10px] font-bold uppercase text-slate-400">Total Requested</span>
                                    <span className="text-xl font-black text-emerald-400">
                                        TShs {Math.round(selectedTripDetails.totalExpensesTZS).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-baseline text-xs text-slate-300 pt-1 border-t border-white/10">
                                    <span>Approx. USD Value</span>
                                    <span className="font-bold">
                                        ${selectedTripDetails.totalExpensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                {selectedTripDetails.fuelLiters > 0 && (
                                    <div className="flex justify-between items-baseline text-xs text-amber-300 pt-1 border-t border-white/10">
                                        <span>Fuel Allocation</span>
                                        <span className="font-bold">
                                            {selectedTripDetails.fuelLiters.toLocaleString()} Liters
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Line Items List */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                                    Itemized Expense Breakdown ({tripExpenses.length} items)
                                </h4>

                                {isLoadingExpenses ? (
                                    <div className="py-8 text-center text-xs text-slate-400">
                                        <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-600" />
                                        Loading line items...
                                    </div>
                                ) : tripExpenses.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                                        No itemized expenses recorded on this sheet.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {tripExpenses.map((item: any) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 text-xs"
                                            >
                                                <div className="space-y-0.5">
                                                    <p className="font-bold text-slate-800">{item.item_name}</p>
                                                    <p className="text-[10px] text-slate-500 font-medium">
                                                        {item.category} • {item.nature || "Go & Return"}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-slate-900">
                                                        {item.currency} {parseFloat(item.amount || 0).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Drawer Action Buttons: Download Excel + 1-Click Approve */}
                            <div className="pt-4 border-t flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => handleExportExcel(selectedTripDetails, tripExpenses)}
                                    disabled={isExportingExcel || isLoadingExpenses}
                                    className="h-11 px-4 border-slate-300 text-slate-700 hover:bg-slate-100 font-bold rounded-xl text-xs gap-2 shrink-0 shadow-sm"
                                    title="Download Itemized Excel Budget"
                                >
                                    {isExportingExcel ? (
                                        <Loader2 size={16} className="animate-spin text-emerald-600" />
                                    ) : (
                                        <FileSpreadsheet size={16} className="text-emerald-600" />
                                    )}
                                    <span className="hidden sm:inline">Excel</span>
                                </Button>

                                {isPendingStatus(selectedTripDetails.status) ? (
                                    <Button
                                        onClick={() => {
                                            handleOpenApproveDialog(selectedTripDetails);
                                        }}
                                        className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider gap-2 shadow-lg shadow-emerald-600/20"
                                    >
                                        <CheckCircle2 size={16} />
                                        <span>Approve & Release Funds</span>
                                    </Button>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center gap-1.5 h-11 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                                        <ShieldCheck size={16} />
                                        <span>Funds Approved</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* 🛡️ CONFIRM APPROVAL DIALOG */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="max-w-md bg-white rounded-2xl p-6">
                    <DialogHeader>
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                            <ShieldCheck size={20} />
                        </div>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            Confirm Fund Release
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            You are approving and releasing funds for trip{" "}
                            <span className="font-bold text-slate-800">
                                {tripToApprove?.reference_number}
                            </span>{" "}
                            ({tripToApprove?.truckPlate || tripToApprove?.vehicle?.vehicle_no || "---"}).
                        </DialogDescription>
                    </DialogHeader>

                    {tripToApprove && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Destination:</span>
                                <span className="font-bold text-slate-800">{tripToApprove.destination}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Driver:</span>
                                <span className="font-bold text-slate-800">
                                    {tripToApprove.driverName || tripToApprove.driver?.full_name || "Unassigned"}
                                </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-slate-200">
                                <span className="font-bold text-slate-700">Total Release:</span>
                                <span className="font-black text-emerald-700 text-sm">
                                    TShs {Math.round(tripToApprove.totalExpensesTZS).toLocaleString()} ($
                                    {tripToApprove.totalExpensesUSD.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    })})
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5 pt-2">
                        <label className="text-xs font-bold text-slate-700">
                            Executive Note / Instructions (Optional):
                        </label>
                        <Input
                            placeholder="e.g. Approved via Executive Hub. Release 50% fuel first..."
                            value={approvalNote}
                            onChange={(e) => setApprovalNote(e.target.value)}
                            className="h-9 text-xs"
                        />
                    </div>

                    <DialogFooter className="flex gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => setIsApproveDialogOpen(false)}
                            disabled={approveFundsMutation.isPending}
                            className="h-10 rounded-xl text-xs font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (tripToApprove) {
                                    approveFundsMutation.mutate({
                                        tripId: tripToApprove.id,
                                        note: approvalNote
                                    });
                                }
                            }}
                            disabled={approveFundsMutation.isPending}
                            className="h-10 px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md shadow-emerald-600/20"
                        >
                            {approveFundsMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <CheckCircle2 size={16} />
                            )}
                            <span>Confirm & Release</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* LIVE TRACKING & CHECKPOINTS TIMELINE MODAL */}
            <Dialog open={!!locationTrackingTrip} onOpenChange={(o) => !o && setLocationTrackingTrip(null)}>
                <DialogContent className="max-w-md p-6 rounded-2xl bg-white border border-slate-200 shadow-2xl">
                    {locationTrackingTrip && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse shadow-[0_0_8px_#0ea5e9]" />
                                    <span className="text-[10px] font-black uppercase text-sky-600 tracking-widest">
                                        Executive Live Vehicle Tracker
                                    </span>
                                </div>
                                <DialogTitle className="text-lg font-black text-slate-900 flex items-center justify-between">
                                    <span>{locationTrackingTrip.truckPlate || "Truck"}</span>
                                    <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-[10px] font-bold">
                                        {locationTrackingTrip.transitStatus}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-500">
                                    {locationTrackingTrip.client_name ? `${locationTrackingTrip.client_name} • ` : ""}
                                    {locationTrackingTrip.origin || "Origin"} → {locationTrackingTrip.destination || "Destination"}
                                    {locationTrackingTrip.reference_number && ` (Ref: ${locationTrackingTrip.reference_number})`}
                                </DialogDescription>
                            </DialogHeader>

                            {/* Current Real-time Location Card */}
                            <div className="bg-gradient-to-br from-sky-50 to-blue-50/50 rounded-xl p-4 border border-sky-200/80 my-2 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-sky-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <MapPin size={13} className="text-sky-500" />
                                        Current Live Position
                                    </span>
                                    {locationTrackingTrip.milestoneTime && (
                                        <span className="text-[10px] font-bold text-sky-600 bg-white/80 px-2 py-0.5 rounded-full border border-sky-200">
                                            {formatDistanceToNow(new Date(locationTrackingTrip.milestoneTime), { addSuffix: true })}
                                        </span>
                                    )}
                                </div>
                                <div className="text-base font-black text-slate-900 mt-1.5">
                                    {locationTrackingTrip.latestLocationUpdate 
                                        ? locationTrackingTrip.latestLocationUpdate.location 
                                        : locationTrackingTrip.currentMilestone}
                                </div>
                                {locationTrackingTrip.latestLocationUpdate?.reason && (
                                    <div className="text-xs text-sky-800 font-medium mt-1 bg-white/60 p-2 rounded-lg border border-sky-100 italic">
                                        "{locationTrackingTrip.latestLocationUpdate.reason}"
                                    </div>
                                )}
                                {locationTrackingTrip.driverName && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2 pt-2 border-t border-sky-200/40">
                                        <User size={11} className="text-slate-400" />
                                        <span>Driver: <strong className="text-slate-700">{locationTrackingTrip.driverName}</strong></span>
                                        {locationTrackingTrip.driverPhone && (
                                            <span className="text-slate-400">({locationTrackingTrip.driverPhone})</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Checkpoint Movement Timeline */}
                            <div className="mt-3">
                                <h4 className="text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-3 flex items-center gap-1.5">
                                    <Clock size={13} />
                                    Location Checkpoint History ({(locationTrackingTrip.locationUpdates || []).length})
                                </h4>

                                {(locationTrackingTrip.locationUpdates || []).length === 0 ? (
                                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <MapPin size={24} className="mx-auto text-slate-300 mb-1.5" />
                                        <p className="text-xs text-slate-600 font-bold">No custom checkpoints logged yet</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5 max-w-[240px] mx-auto">
                                            Updates saved by the transit & logistics team will automatically appear here in real time.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="max-h-[220px] overflow-y-auto pr-1 space-y-0">
                                        {locationTrackingTrip.locationUpdates.map((update: any, idx: number) => {
                                            const isLatest = idx === 0;
                                            return (
                                                <div key={update.id} className="flex gap-3 relative">
                                                    <div className="flex flex-col items-center">
                                                        <div className={cn(
                                                            "w-2.5 h-2.5 rounded-full z-10 shrink-0 mt-0.5",
                                                            isLatest 
                                                                ? "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)] ring-2 ring-sky-200" 
                                                                : "bg-slate-300"
                                                        )} />
                                                        {idx < locationTrackingTrip.locationUpdates.length - 1 && (
                                                            <div className="w-0.5 flex-1 bg-slate-200 min-h-[24px]" />
                                                        )}
                                                    </div>
                                                    <div className="pb-3 flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className={cn(
                                                                "text-xs font-black",
                                                                isLatest ? "text-sky-900" : "text-slate-700"
                                                            )}>
                                                                {update.location}
                                                            </span>
                                                            <span className={cn(
                                                                "text-[9px] font-bold whitespace-nowrap shrink-0",
                                                                isLatest ? "text-sky-600" : "text-slate-400"
                                                            )}>
                                                                {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                                                            </span>
                                                        </div>
                                                        {update.reason && (
                                                            <p className="text-[11px] text-slate-500 font-medium italic mt-0.5">
                                                                {update.reason}
                                                            </p>
                                                        )}
                                                        <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                                                            {format(new Date(update.created_at), "dd MMM yyyy, HH:mm")}
                                                            {update.updated_by && ` • by ${update.updated_by}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="pt-3 border-t border-slate-100 mt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setLocationTrackingTrip(null)}
                                    className="w-full h-9 rounded-xl text-xs font-semibold"
                                >
                                    Close
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
