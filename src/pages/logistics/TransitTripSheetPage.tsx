import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, Globe } from "lucide-react";
import { format } from "date-fns";

const fmt = (d: any) => d ? format(new Date(d), "dd MMM yyyy") : "—";
const daysBetween = (a: any, b: any): number | null => {
    if (!a || !b) return null;
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
};

const TransitTripSheetPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data: trip, isLoading } = useQuery({
        queryKey: ["transit_trip_sheet", id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_transit_trips" as any)
                .select("*")
                .eq("id", id)
                .single();
            if (error) throw error;
            return data as any;
        },
        enabled: !!id
    });

    const { data: linkedTrip } = useQuery({
        queryKey: ["linked_trip", trip?.trip_id],
        queryFn: async () => {
            if (!trip || !trip.trip_id) return null;
            const isReturn = trip.leg_type === "R";
            const targetTripId = isReturn ? trip.trip_id.replace('/R', '/G') : trip.trip_id.replace('/G', '/R');
            
            const { data, error } = await supabase
                .from("logistics_transit_trips" as any)
                .select("*")
                .eq("trip_id", targetTripId)
                .single();
            if (error) return null;
            return data as any;
        },
        enabled: !!trip?.trip_id && trip.leg_type !== undefined
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1a3a5c] border-t-transparent" />
                    <p className="text-sm text-slate-500 font-medium">Loading Trip Sheet…</p>
                </div>
            </div>
        );
    }

    if (!trip) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <Globe className="w-16 h-16 text-slate-300" />
                <p className="text-slate-500 font-bold text-lg">Trip not found.</p>
                <Button onClick={() => navigate(-1)} variant="outline">Go Back</Button>
            </div>
        );
    }

    const goDays = daysBetween(trip.dispatch_date, trip.offloading_date || new Date().toISOString().slice(0, 10));
    const returnDays = trip.leg_type === "R" ? goDays : null;

    return (
        <>
            {/* ─── Screen Controls (hidden when printing) ─── */}
            <div className="print:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
                <Button
                    variant="ghost"
                    className="text-white hover:bg-slate-700 gap-2"
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Transit
                </Button>
                <span className="font-bold text-sm tracking-wider">{trip.trip_id}</span>
                <Button
                    className="bg-white text-slate-900 hover:bg-slate-100 font-bold gap-2"
                    onClick={() => window.print()}
                >
                    <Printer className="w-4 h-4" /> Print Trip Sheet
                </Button>
            </div>

            {/* ─── Full-Page Trip Sheet (A4 optimized) ─── */}
            <div className="print:pt-0 pt-16 min-h-screen bg-slate-50 print:bg-white text-slate-900 font-['Outfit']">
                <div className="max-w-[210mm] mx-auto bg-white shadow-xl print:shadow-none print:max-w-none p-12 print:p-8 space-y-10">

                    {/* Clean Header */}
                    <div className="border-t-[1px] border-slate-200 pt-8 flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-[#1a3a5c]">Transit Trip Sheet</h1>
                            <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-[0.2em]">Polytra International Logistics</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold text-slate-800">{trip.trip_id}</div>
                            <div className="flex flex-col items-end gap-1.5 mt-2">
                                <p className={`inline-block px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${trip.is_tanker ? "bg-blue-50 text-blue-600 border border-blue-100" : trip.leg_type === "G" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
                                    {trip.is_tanker ? "Tanker — Outbound" : trip.leg_type === "G" ? "Flatbed — Outbound" : "Flatbed — Return"}
                                </p>
                                <div className="text-[9px] font-medium text-slate-400 italic">
                                    Generated: {format(new Date(), "dd MMM yyyy, HH:mm")}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Context Bar */}
                    <div className="grid grid-cols-2 gap-8 bg-slate-50/50 p-8 rounded-3xl border border-slate-100">
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1 block">Trip Reference / Number</Label>
                            <div className="text-base font-semibold text-slate-700">{trip.reference_number || "—"}</div>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1 block">Associated Invoice</Label>
                            <div className="text-base font-semibold text-slate-700">{trip.invoice_no || "—"}</div>
                        </div>
                    </div>

                    {/* Section 1: Vehicle & Driver */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#1a3a5c] border-b-2 border-slate-100 pb-2">
                            Asset & Crew Details
                        </h2>
                        <div className="grid grid-cols-3 gap-x-12 gap-y-6 text-sm">
                            <InfoRow label="Truck No." value={trip.truck_no} bold />
                            <InfoRow label="Trailer No." value={trip.trailer_no} bold />
                            <InfoRow label="Current Status" value={trip.status} bold />
                            <InfoRow label="Driver Name" value={trip.driver_name} bold />
                            <InfoRow label="Licence No." value={trip.license_no} />
                            <InfoRow label="Passport No." value={trip.passport_no} />
                            <InfoRow label="Contact" value={trip.contact_no} bold />
                            <InfoRow label="Current Location" value={trip.location} />
                            <InfoRow label="Final Destination" value={trip.destination} bold />
                        </div>
                    </section>

                    {/* Section 2: Cargo & Documentation */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#1a3a5c] border-b-2 border-slate-100 pb-2">
                            Consignment Logistics
                        </h2>
                        <div className="grid grid-cols-3 gap-x-12 gap-y-6 text-sm">
                            <InfoRow label="Cargo Description" value={trip.cargo} bold />
                            <InfoRow label="BL / Consignment" value={trip.bl_number} mono bold />
                            <InfoRow label="Container No." value={trip.container_no} mono bold />
                        </div>
                    </section>

                    {/* Section 3: Milestone Dates */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#1a3a5c] border-b-2 border-slate-100 pb-2">
                            Official Transit Timeline
                        </h2>
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                                        <th className="px-6 py-4 text-left">Milestone Event</th>
                                        <th className="px-6 py-4 text-left">Timeline Date</th>
                                        <th className="px-6 py-4 text-left">Notes / Duration</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <TimelineRow milestone="Arrival at Loading Site" date={trip.arrival_loading_date} />
                                    <TimelineRow milestone="Loading Completion" date={trip.loading_date} />
                                    <TimelineRow milestone="Official Dispatch" date={trip.dispatch_date} highlight />
                                    
                                    {(trip.borders_data || []).map((border: any, idx: number) => (
                                        <div key={idx} className="contents">
                                            <TimelineRow 
                                                milestone={`${border.name || `Border ${idx+1}`} — Arrival`} 
                                                date={border.arrival} 
                                            />
                                            <TimelineRow 
                                                milestone={`${border.name || `Border ${idx+1}`} — Crossing`} 
                                                date={border.crossing} 
                                                highlight
                                            />
                                            <TimelineRow 
                                                milestone={`${border.name || `Border ${idx+1}`} — Departure`} 
                                                date={border.departure}
                                                note={border.arrival && border.departure ? `${daysBetween(border.arrival, border.departure)} day(s) stay` : ""}
                                            />
                                        </div>
                                    ))}

                                    <TimelineRow milestone="Arrival at Offloading Site" date={trip.arrive_offloading_site_date} />
                                    <TimelineRow
                                        milestone="Final Offloading"
                                        date={trip.offloading_date}
                                        highlight={trip.status === "Completed"}
                                    />
                                    <TimelineRow milestone="Final HQ Return" date={trip.hq_arrival_date} highlight />
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Section 4: Trip Summary Metrics */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#1a3a5c] border-b-2 border-slate-100 pb-2">
                            Trip Efficiency Metrics
                        </h2>
                        <div className="grid grid-cols-4 gap-4">
                            <SummaryCard
                                label="Borders Crossed"
                                value={`${(trip.borders_data || []).length}`}
                            />
                            <SummaryCard
                                label="Transit Leg"
                                value={trip.nature === "Go & Return" ? "ROUND" : "SINGLE"}
                            />
                            <SummaryCard
                                label="Standing Chg"
                                value={trip.standing_charges > 0 ? `$${Number(trip.standing_charges).toLocaleString()}` : "—"}
                                warn={trip.standing_charges > 0}
                            />
                            <SummaryCard
                                label="Total Leg Days"
                                value={trip.total_trip_days ? `${trip.total_trip_days} Days` : `${goDays || "—"} Days`}
                                note="Official transit duration"
                                highlight
                            />
                            {linkedTrip && (
                                <SummaryCard
                                    label="Total Round Trip"
                                    value={`${(trip.total_trip_days || 0) + (linkedTrip.total_trip_days || 0)} Days`}
                                    note={`Combined with ${linkedTrip.trip_id}`}
                                    highlight
                                />
                            )}
                        </div>
                    </section>

                    {/* Section 5: Signature Blocks */}
                    <section className="pt-12">
                        <div className="grid grid-cols-3 gap-12">
                            {["Prepared By", "Verified By", "Authorized By"].map(role => (
                                <div key={role} className="space-y-8">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{role}</p>
                                    <div className="border-b border-slate-900 pb-1 italic text-slate-300 text-xs text-center">Digital Seal Required</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Professional Footer */}
                    <div className="text-center pt-12 border-t border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            POLYTRA INTERNATIONAL LOGISTICS — OPERATIONAL TRANSIT DOCUMENT
                        </p>
                        <p className="text-[8px] text-slate-300 mt-1 uppercase tracking-widest">
                            Generated by SUDSUD System • Official Version {new Date().getFullYear()}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const InfoRow = ({ label, value, bold, mono }: { label: string; value?: any; bold?: boolean; mono?: boolean }) => (
    <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className={`text-slate-700 ${bold ? "font-bold text-sm" : "font-medium text-sm"} ${mono ? "font-mono" : ""}`}>
            {value || <span className="text-slate-300">Not Provided</span>}
        </p>
    </div>
);

const TimelineRow = ({ milestone, date, note, highlight }: { milestone: string; date?: any; note?: string; highlight?: boolean }) => (
    <tr className={`text-sm ${highlight ? "bg-slate-50/80" : ""}`}>
        <td className="px-6 py-4 font-semibold text-slate-600">{milestone}</td>
        <td className="px-6 py-4 font-bold text-slate-800">{fmt(date)}</td>
        <td className="px-6 py-4 text-slate-400 text-[11px] font-medium">{note || ""}</td>
    </tr>
);

const SummaryCard = ({ label, value, warn, highlight }: { label: string; value: string; warn?: boolean; highlight?: boolean }) => (
    <div className={`rounded-2xl p-6 text-center border transition-all ${highlight ? "border-slate-200 bg-white shadow-sm" : warn ? "border-amber-200 bg-amber-50/30" : "border-slate-100 bg-slate-50/50"}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">{label}</p>
        <p className={`text-xl font-bold ${highlight ? "text-[#1a3a5c]" : warn ? "text-amber-600" : "text-slate-700"}`}>{value}</p>
    </div>
);

export default TransitTripSheetPage;
