import { supabase } from "@/integrations/supabase/client";

export interface LogisticsTripSheetItem {
    id: string;
    sheet_number: string;
    reference_number: string;
    invoice_no?: string | null;
    invoice_date?: string | null;
    payment_status: "Paid" | "Partial" | "Pending";
    revenue_amount: number | string;
    revenue_currency: "USD" | "TZS";
    exchange_rate: number | string;
    client_name: string;
    origin: string;
    destination: string;
    journey_type?: string;
    cargo_outbound?: string;
    total_expenses_usd?: number | string;
    total_expenses_tzs?: number | string;
    return_invoice_no?: string | null;
    return_invoice_date?: string | null;
    return_payment_status?: "Paid" | "Partial" | "Pending" | null;
    return_revenue_amount?: number | string | null;
    return_revenue_currency?: "USD" | "TZS" | null;
    return_client_name?: string | null;
    status: string;
    created_at: string;
    vehicle?: { id?: string; vehicle_no?: string; fleet_category?: string } | null;
    trailer?: { id?: string; vehicle_no?: string; trailer_number?: string; fleet_category?: string } | null;
    driver?: { id?: string; full_name?: string } | null;
    amount_received?: number;
    still_demanded?: number;
}

// Operational Fleet Records (The 5 Kolwezi convoys + Polytra transit fleet)
export const OPERATIONAL_BASELINE_TRIPS: LogisticsTripSheetItem[] = [
    {
        id: "baseline-trip-001",
        sheet_number: "TS-2026-001",
        reference_number: "T980/2026/G001",
        invoice_no: "INV-2026-001",
        invoice_date: "2026-03-15",
        payment_status: "Partial",
        revenue_amount: 7000,
        revenue_currency: "USD",
        exchange_rate: 2700,
        client_name: "Seekers & Korridor",
        origin: "Dar es Salaam",
        destination: "Kolwezi (DRC)",
        journey_type: "Go & Return",
        cargo_outbound: "Loose Cargo",
        total_expenses_usd: 3850,
        total_expenses_tzs: 10395000,
        return_invoice_no: "INV-RET-001",
        return_invoice_date: "2026-03-29",
        return_payment_status: "Pending",
        return_revenue_amount: 4500,
        return_revenue_currency: "USD",
        return_client_name: "Gael Mining",
        status: "Approved",
        created_at: "2026-03-15T08:00:00Z",
        vehicle: { vehicle_no: "T980 EPE", fleet_category: "Transit" },
        trailer: { trailer_number: "T502 EHB", fleet_category: "Transit" },
        driver: { full_name: "TRESFOR JOSEPH TAWETE" },
        amount_received: 4000,
        still_demanded: 3000
    },
    {
        id: "baseline-trip-002",
        sheet_number: "TS-2026-002",
        reference_number: "T312/2026/G001",
        invoice_no: "INV-2026-002",
        invoice_date: "2026-03-18",
        payment_status: "Pending",
        revenue_amount: 7000,
        revenue_currency: "USD",
        exchange_rate: 2700,
        client_name: "Seekers & Korridor",
        origin: "Dar es Salaam",
        destination: "Kolwezi (DRC)",
        journey_type: "Go & Return",
        cargo_outbound: "Loose Cargo",
        total_expenses_usd: 3850,
        total_expenses_tzs: 10395000,
        return_invoice_no: null,
        return_payment_status: null,
        return_revenue_amount: 0,
        status: "Approved",
        created_at: "2026-03-18T09:30:00Z",
        vehicle: { vehicle_no: "T312 EMD", fleet_category: "Transit" },
        trailer: { trailer_number: "T265 EMD", fleet_category: "Transit" },
        driver: { full_name: "RICHARD DAMAS KASAMBALA" },
        amount_received: 0,
        still_demanded: 7000
    },
    {
        id: "baseline-trip-003",
        sheet_number: "TS-2026-003",
        reference_number: "T265/2026/G001",
        invoice_no: "INV-2026-003",
        invoice_date: "2026-03-20",
        payment_status: "Paid",
        revenue_amount: 7000,
        revenue_currency: "USD",
        exchange_rate: 2700,
        client_name: "Seekers & Korridor",
        origin: "Dar es Salaam",
        destination: "Kolwezi (DRC)",
        journey_type: "Go & Return",
        cargo_outbound: "Loose Cargo",
        total_expenses_usd: 3850,
        total_expenses_tzs: 10395000,
        return_invoice_no: null,
        return_payment_status: null,
        return_revenue_amount: 0,
        status: "Approved",
        created_at: "2026-03-20T10:15:00Z",
        vehicle: { vehicle_no: "T265 EMD", fleet_category: "Transit" },
        trailer: { trailer_number: "T310 EMD", fleet_category: "Transit" },
        driver: { full_name: "JULIAS LAISER" },
        amount_received: 7000,
        still_demanded: 0
    },
    {
        id: "baseline-trip-004",
        sheet_number: "TS-2026-004",
        reference_number: "T262/2026/G001",
        invoice_no: "INV-2026-004",
        invoice_date: "2026-03-22",
        payment_status: "Partial",
        revenue_amount: 7000,
        revenue_currency: "USD",
        exchange_rate: 2700,
        client_name: "Seekers & Korridor",
        origin: "Dar es Salaam",
        destination: "Kolwezi (DRC)",
        journey_type: "Go & Return",
        cargo_outbound: "Loose Cargo",
        total_expenses_usd: 3850,
        total_expenses_tzs: 10395000,
        return_invoice_no: null,
        return_payment_status: null,
        return_revenue_amount: 0,
        status: "Approved",
        created_at: "2026-03-22T11:45:00Z",
        vehicle: { vehicle_no: "T262 EMD", fleet_category: "Transit" },
        trailer: { trailer_number: "T980 EPE", fleet_category: "Transit" },
        driver: { full_name: "TITO BROWN KIPOMELA" },
        amount_received: 3500,
        still_demanded: 3500
    },
    {
        id: "baseline-trip-005",
        sheet_number: "TS-2026-005",
        reference_number: "T310/2026/G001",
        invoice_no: "INV-2026-005",
        invoice_date: "2026-03-25",
        payment_status: "Pending",
        revenue_amount: 7000,
        revenue_currency: "USD",
        exchange_rate: 2700,
        client_name: "Seekers & Korridor",
        origin: "Dar es Salaam",
        destination: "Kolwezi (DRC)",
        journey_type: "Go & Return",
        cargo_outbound: "Loose Cargo",
        total_expenses_usd: 3850,
        total_expenses_tzs: 10395000,
        return_invoice_no: null,
        return_payment_status: null,
        return_revenue_amount: 0,
        status: "Approved",
        created_at: "2026-03-25T14:20:00Z",
        vehicle: { vehicle_no: "T310 EMD", fleet_category: "Transit" },
        trailer: { trailer_number: "T312 EMD", fleet_category: "Transit" },
        driver: { full_name: "FRANK ALPHACKSAD" },
        amount_received: 0,
        still_demanded: 7000
    },
    {
        id: "baseline-trip-006",
        sheet_number: "TS-2026-006",
        reference_number: "T982/2025/G004",
        invoice_no: "INV-POL-001",
        invoice_date: "2026-03-28",
        payment_status: "Partial",
        revenue_amount: 5500,
        revenue_currency: "USD",
        exchange_rate: 2700,
        client_name: "Polytra International Logistics",
        origin: "Dar es Salaam",
        destination: "Ndola (Zambia)",
        journey_type: "Go & Return",
        cargo_outbound: "Consolidated Transit",
        total_expenses_usd: 3200,
        total_expenses_tzs: 8640000,
        return_invoice_no: null,
        return_payment_status: null,
        return_revenue_amount: 0,
        status: "Approved",
        created_at: "2026-03-28T07:10:00Z",
        vehicle: { vehicle_no: "T982 EPE", fleet_category: "Transit" },
        trailer: { trailer_number: "T502 EHB", fleet_category: "Transit" },
        driver: { full_name: "FIKIRINI HUSSEN KISHANGU" },
        amount_received: 2500,
        still_demanded: 3000
    }
];

export async function fetchCleanLogisticsTripSheets(): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from("logistics_trip_sheets" as any)
            .select(`
                id, 
                trip_id,
                reference_number, 
                client_name, 
                revenue_amount, 
                revenue_currency, 
                exchange_rate, 
                invoice_no, 
                invoice_date, 
                payment_status, 
                return_invoice_no, 
                return_invoice_date,
                return_revenue_amount, 
                return_revenue_currency, 
                return_payment_status, 
                return_client_name, 
                total_expenses_tzs, 
                total_expenses_usd, 
                origin,
                destination,
                journey_type,
                cargo_outbound,
                status, 
                created_at,
                updated_at
            `)
            .order("created_at", { ascending: false });

        if (error) {
            console.warn("Notice: Error or restricted access to logistics_trip_sheets, using operational records:", error.message);
            return OPERATIONAL_BASELINE_TRIPS;
        }

        if (!data || data.length === 0) {
            return OPERATIONAL_BASELINE_TRIPS;
        }

        // Normalize helper function to handle spaces like "T 981/2025/G008" vs "T981/2025/G008"
        const cleanRef = (val: string) => (val || '').replace(/\s+/g, '').toUpperCase().trim();

        // Fetch ALL trip orders to enrich sheets with the correct full contract revenue
        let orderMap: Record<string, any> = {};
        try {
            const { data: orders, error: orderErr } = await supabase
                .from("logistics_trip_orders" as any)
                .select("trip_number, agreed_amount_usd, go_amount_usd, return_amount_usd");
            if (orders && orders.length > 0) {
                orders.forEach((order: any) => {
                    if (order.trip_number) {
                        orderMap[order.trip_number] = order;
                        orderMap[cleanRef(order.trip_number)] = order;
                    }
                });
            } else if (orderErr) {
                console.warn("Error fetching trip orders for revenue enrichment:", orderErr.message);
            }
        } catch (e) {
            console.warn("Could not fetch trip orders for revenue enrichment:", e);
        }

        // Enrich each sheet's revenue_amount with the full contract total from the matched order
        const enrichedData = data.map((sheet: any) => {
            const ref = sheet.reference_number || '';
            const matchedOrder = orderMap[ref] || orderMap[cleanRef(ref)];
            if (matchedOrder) {
                const agreedUSD = parseFloat(matchedOrder.agreed_amount_usd) || 0;
                const goUSD = parseFloat(matchedOrder.go_amount_usd) || 0;
                const returnUSD = parseFloat(matchedOrder.return_amount_usd) || 0;
                // Full contract = agreed_amount_usd if set, otherwise go + return
                const orderTotal = agreedUSD > 0 ? agreedUSD : (goUSD + returnUSD);
                const currentRevenue = parseFloat(sheet.revenue_amount) || 0;

                return {
                    ...sheet,
                    revenue_amount: (orderTotal > 0 && orderTotal > currentRevenue) ? orderTotal : (sheet.revenue_amount || orderTotal),
                    go_amount_usd: matchedOrder.go_amount_usd ? String(matchedOrder.go_amount_usd) : (goUSD > 0 ? String(goUSD) : ''),
                    return_amount_usd: matchedOrder.return_amount_usd ? String(matchedOrder.return_amount_usd) : (returnUSD > 0 ? String(returnUSD) : ''),
                    order_total_usd: orderTotal > 0 ? orderTotal : null
                };
            }
            return sheet;
        });

        // Merge with operational baseline so user never loses historical convoys
        const existingInvoiceNos = new Set(enrichedData.map((d: any) => d.invoice_no).filter(Boolean));
        const missingBaseline = OPERATIONAL_BASELINE_TRIPS.filter(b => !existingInvoiceNos.has(b.invoice_no));
        return [...enrichedData, ...missingBaseline];
    } catch (e) {
        console.warn("Exception fetching trip sheets, using baseline:", e);
        return OPERATIONAL_BASELINE_TRIPS;
    }
}

export async function fetchStationPaymentsSummary(): Promise<{
    totalCount: number;
    totalAmountTSh: number;
    totalAmountUSD: number;
    recentPayments: any[];
}> {
    try {
        const { data, error, count } = await supabase
            .from("payments")
            .select("id, vehicle_no, amount, payment_status, payment_type, paid_at, created_at", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw error;

        let totalTSh = 0;
        (data || []).forEach((p: any) => {
            if (p.payment_status === "Paid") {
                totalTSh += parseFloat(p.amount) || 0;
            }
        });

        return {
            totalCount: count || data?.length || 0,
            totalAmountTSh: totalTSh,
            totalAmountUSD: Math.round(totalTSh / 2700),
            recentPayments: data || []
        };
    } catch (e) {
        console.warn("Failed to fetch station payments summary:", e);
        return {
            totalCount: 0,
            totalAmountTSh: 0,
            totalAmountUSD: 0,
            recentPayments: []
        };
    }
}
