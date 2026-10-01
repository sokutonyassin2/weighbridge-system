import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    Camera,
    CameraOff,
    View,
    RefreshCw,
    History as HistoryIcon,
    Truck,
    Monitor,
    User,
    XCircle,
    ChevronLeft,
    ChevronRight,
    ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

const SERVER_URL = "http://192.168.1.216:5000";

interface AuditLog {
    id: string;
    timestamp: string;
    detected_weight: number;
    photo_filename: string;
    type: 'ghost' | 'manual' | 'auto';
    shift: 'Day_Shift' | 'Night_Shift';
    status: 'unmatched' | 'matched' | 'dismissed';
    session_start?: string;
    session_end?: string;
    dismissed?: boolean;
    dismiss_reason?: string;
}

interface VehicleEntry {
    id: string;
    vehicle_no: string;
    gross_weight: number;
    tare_weight: number;
    entry_time: string;
    status: string;
    operator_photo_url?: string;
    wb_number?: string;
    vehicle_type?: string;
    entered_by?: string;
}

export default function GuardianEye() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedShift, setSelectedShift] = useState<string>("all");
    const [selectedZoomImage, setSelectedZoomImage] = useState<string | null>(null);
    const [dismissTarget, setDismissTarget] = useState<AuditLog | null>(null);
    const [dismissReason, setDismissReason] = useState("");
    const [activeGhostIndex, setActiveGhostIndex] = useState<Record<string, number>>({});

    // --- Fetch Local Photos from Central Server ---
    const { data: localPhotos = [], isLoading: isLoadingLocal, refetch: refetchLocal } = useQuery({
        queryKey: ["guardian-local-photos", selectedDate],
        queryFn: async () => {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            console.log("🔍 Fetching Local Photos for:", dateStr);

            try {
                const response = await fetch(`${SERVER_URL}/api/photos/list-local?date=${dateStr}`);
                const result = await response.json();

                if (!result.success) throw new Error(result.error);

                console.log(`✅ Local Photos Found: ${result.photos?.length || 0} items`);
                return (result.photos || []) as any[];
            } catch (err) {
                console.error("❌ Local Photo Fetch Error:", err);
                return [];
            }
        },
        refetchInterval: 30000,
    });

    // --- Fetch Verified Entries ---
    const { data: verifiedEntries = [], isLoading: isLoadingVerified, refetch: refetchVerified } = useQuery({
        queryKey: ["guardian-verified", selectedDate, selectedShift],
        queryFn: async () => {
            const dayStart = startOfDay(selectedDate).toISOString();
            const dayEnd = endOfDay(selectedDate).toISOString();

            let query = (supabase as any)
                .from("vehicle_entries")
                .select(`
                  id, vehicle_no, entry_time, wb_number, entered_by,
                  weigh_records (gross_weight, photo_url)
                `)
                .gte("entry_time", dayStart)
                .lte("entry_time", dayEnd);

            const { data, error } = await query.order("entry_time", { ascending: false });

            if (error) {
                console.error("❌ Verified Entries Query Error:", error);
                return [];
            }

            console.log(`✅ Verified Entries Received: ${data?.length || 0} items`);

            let filteredData = data || [];
            if (selectedShift !== "all") {
                filteredData = (data as any[] || []).filter(entry => {
                    const entryTime = entry.entry_time ? new Date(entry.entry_time) : new Date();
                    const hour = entryTime.getHours();
                    const isDay = hour >= 7 && hour < 18;
                    return selectedShift === 'day' ? isDay : !isDay;
                });
            }

            return (filteredData as any[] || []).map(entry => ({
                ...entry,
                gross_weight: entry.weigh_records?.[0]?.gross_weight || 0,
                vehicle_type: "Vehicle",
                operator_photo_url: entry.weigh_records?.[0]?.photo_url || null,
                entered_by: entry.entered_by || "Unknown"
            })) as VehicleEntry[];
        },
        refetchInterval: 30000,
    });

    // --- Fetch Audit Logs from Supabase ---
    const { data: dbAuditLogs = [], refetch: refetchAuditLogs } = useQuery({
        queryKey: ["camera-audit-logs", selectedDate],
        queryFn: async () => {
            const dayStart = startOfDay(selectedDate).toISOString();
            const dayEnd = endOfDay(selectedDate).toISOString();

            console.log("🔍 Fetching Supabase Audit Logs:", { dayStart, dayEnd });

            const { data, error } = await supabase
                .from("camera_audit_logs")
                .select("*")
                .gte("timestamp", dayStart)
                .lte("timestamp", dayEnd)
                .order("timestamp", { ascending: false });

            if (error) {
                console.error("❌ Audit Logs Query Error:", error);
                return [];
            }
            return data;
        },
        refetchInterval: 30000,
    });

    const refetchAll = () => {
        refetchLocal();
        refetchVerified();
        refetchAuditLogs();
    };


    // --- Create Unified Event Feed ---
    const unifiedEvents = useMemo(() => {
        const events: { id: string, timestamp: string, entry: VehicleEntry | null, ghosts: AuditLog[], status: 'matched' | 'missing_manual' | 'missing_ghost' | 'dismissed' }[] = [];
        const matchedGhostIds = new Set<string>();

        // Fix invalid ISO strings with colon before milliseconds (e.g. 2026-03-12T10:45:30:123Z -> 2026-03-12T10:45:30.123Z)
        const parseGhostTime = (ts: string) => {
            const cleanTs = ts.replace(/:(\d{3}Z)$/, '.$1');
            const date = new Date(cleanTs);
            return isNaN(date.getTime()) ? new Date() : date;
        };

        // 1. Process and enrich Local Ghost Photos discovered on the server
        let ghostPhotos = localPhotos
            .filter(p => p.type === 'ghost')
            .map(p => {
                // Find matching record in Supabase to get the correct UUID ID and dismissal status
                const dbMatch = dbAuditLogs.find(log => log.photo_filename === p.filename);
                return {
                    ...p,
                    id: dbMatch?.id, // This is crucial for dismissal!
                    dismissed: dbMatch?.dismissed || false,
                    dismiss_reason: dbMatch?.dismiss_reason
                };
            });

        // Match the selected shift if not "all"
        if (selectedShift !== "all") {
            const shiftName = selectedShift === "day" ? "Day_Shift" : "Night_Shift";
            ghostPhotos = ghostPhotos.filter(p => p.shift === shiftName);
        }

        // We want to match Verified Entries to the CLOSEST Ghost Photos
        (verifiedEntries || []).forEach(entry => {
            const entryTime = new Date(entry.entry_time).getTime();

            // Find all ghost photos within 30 minutes
            const matchedGhosts = ghostPhotos.filter(ghost => {
                const ghostTime = parseGhostTime(ghost.timestamp).getTime();
                return Math.abs(entryTime - ghostTime) <= 30 * 60 * 1000;
            }).sort((a, b) => {
                const diffA = Math.abs(parseGhostTime(a.timestamp).getTime() - entryTime);
                const diffB = Math.abs(parseGhostTime(b.timestamp).getTime() - entryTime);
                return diffA - diffB;
            });

            if (matchedGhosts.length > 0) {
                // We have one or more matches! Form a single block.
                matchedGhosts.forEach(g => matchedGhostIds.add(g.filename));

                events.push({
                    id: `match-entry-${entry.id}`,
                    timestamp: matchedGhosts[0].timestamp, // use the closest ghost timestamp
                    entry: entry,
                    ghosts: matchedGhosts.map(g => ({ ...g, photo_filename: g.filename } as any)),
                    status: "matched"
                });
            } else {
                events.push({
                    id: `entry-${entry.id}`,
                    timestamp: entry.entry_time,
                    entry: entry,
                    ghosts: [],
                    status: "missing_ghost"
                });
            }
        });

        // 2. Any ghost photos that didn't get matched to an entry are missing an operator entry
        const unmatchedGhosts = ghostPhotos.filter(g => !matchedGhostIds.has(g.filename));

        // Group them by proximity (within 5 minutes of each other) to avoid double blocks
        const groupedUnmatched: any[][] = [];
        unmatchedGhosts.forEach(ghost => {
            let foundGroup = false;
            for (const group of groupedUnmatched) {
                const groupTime = parseGhostTime(group[0].timestamp).getTime();
                const thisTime = parseGhostTime(ghost.timestamp).getTime();
                if (Math.abs(groupTime - thisTime) <= 5 * 60 * 1000) {
                    group.push(ghost);
                    foundGroup = true;
                    break;
                }
            }
            if (!foundGroup) {
                groupedUnmatched.push([ghost]);
            }
        });

        groupedUnmatched.forEach(group => {
            // Check if any in group were already dismissed in DB
            const isDismissed = group.some(g => g.dismissed);

            events.push({
                id: `ghost-${group[0].filename}`,
                timestamp: group[0].timestamp,
                entry: null,
                ghosts: group.map((g: any) => ({ ...g, photo_filename: g.filename } as any)),
                status: isDismissed ? "dismissed" : "missing_manual"
            });
        });

        // Sort by timestamp descending - safely
        events.sort((a, b) => {
            const timeA = a.timestamp ? parseGhostTime(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? parseGhostTime(b.timestamp).getTime() : 0;
            return timeB - timeA;
        });

        return events;
    }, [localPhotos, verifiedEntries, dbAuditLogs, selectedShift]);

    // --- Dismiss mutation ---
    const dismissMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
            const { error } = await (supabase as any)
                .from("camera_audit_logs")
                .update({
                    dismissed: true,
                    dismissed_by: user?.email || "Admin",
                    dismiss_reason: reason,
                    dismissed_at: new Date().toISOString(),
                    status: "dismissed",
                })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Dismissed", description: "Ghost entry has been dismissed and logged." });
            setDismissTarget(null);
            setDismissReason("");
            refetchLocal();
        },
        onError: () => {
            toast({ title: "Error", description: "Could not dismiss entry.", variant: "destructive" });
        },
    });

    const handleDismiss = () => {
        if (!dismissReason.trim()) return;
        if (!dismissTarget) return;

        if (!dismissTarget.id) {
            console.error("❌ Dismiss Error: No database ID found for photo", dismissTarget.photo_filename);
            toast({
                title: "Error",
                description: "This photo hasn't been synced to the database yet. Wait a moment and try again.",
                variant: "destructive"
            });
            return;
        }

        dismissMutation.mutate({ id: dismissTarget.id, reason: dismissReason });
    };

    const getGhostPhotoUrl = (log: any) => {
        if (!log.path) return "/placeholder-image.jpg";
        return `${SERVER_URL}/photos${log.path.startsWith('/') ? '' : '/'}${log.path}`;
    };

    const getManualPhotoUrl = (entry: VehicleEntry) => {
        if (!entry.operator_photo_url) return "/placeholder-image.jpg";
        // If it's already a full URL, return it
        if (entry.operator_photo_url.startsWith('http')) return entry.operator_photo_url;

        // Covert macOS paths to central server URL
        if (entry.operator_photo_url.includes('WeighbridgePhotos')) {
            const parts = entry.operator_photo_url.split('WeighbridgePhotos');
            if (parts.length > 1) {
                return `${SERVER_URL}/photos${parts[1].replace(/\\/g, '/')}`;
            }
        }

        // Convert Windows paths to central server URL
        if (entry.operator_photo_url.includes('CameraPhotos')) {
            const parts = entry.operator_photo_url.split('CameraPhotos');
            if (parts.length > 1) {
                return `${SERVER_URL}/photos${parts[1].replace(/\\/g, '/')}`;
            }
        }

        // Fallback
        return entry.operator_photo_url;
    };

    const getShiftColor = (shiftStr: string | undefined | null) => {
        if (!shiftStr) return "bg-gray-100 text-gray-700 border-gray-200";
        const lower = shiftStr.toLowerCase();
        return lower.includes("day")
            ? "bg-amber-100 text-amber-700 border-amber-200"
            : "bg-indigo-100 text-indigo-700 border-indigo-200";
    };

    const getShiftFromDate = (dateString: string) => {
        if (!dateString) return "Unknown Shift";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Unknown Shift";
        const hour = date.getHours();
        return hour >= 7 && hour < 18 ? "Day Shift" : "Night Shift";
    };

    const safeFormat = (dateString: string | undefined | null, formatStr: string) => {
        if (!dateString) return "—";
        const cleanTs = dateString.replace(/:(\d{3}Z)$/, '.$1');
        const date = new Date(cleanTs);
        if (isNaN(date.getTime())) return "—";
        return format(date, formatStr);
    };

    const ghostDetections = unifiedEvents.filter(r => r.status === 'missing_manual').length;

    return (
        <div className="flex flex-col gap-6 p-6 bg-slate-50/50 min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Monitor className="text-slate-800 w-8 h-8" />
                        Guardian Eye <span className="text-slate-300">|</span> <span className="font-medium text-slate-500 text-xl">Camera Observer Dashboard</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Auditing scale activity & ghost vehicle detection in real-time.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-white items-center p-1 rounded-lg border shadow-sm px-2 gap-2 hover:border-blue-400 transition-colors">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <input
                            type="date"
                            value={format(selectedDate, 'yyyy-MM-dd')}
                            onChange={(e) => {
                                const [y, m, d] = e.target.value.split('-').map(Number);
                                if (y && m && d) {
                                    const newDate = new Date();
                                    newDate.setFullYear(y);
                                    newDate.setMonth(m - 1);
                                    newDate.setDate(d);
                                    newDate.setHours(0, 0, 0, 0);
                                    setSelectedDate(newDate);
                                }
                            }}
                            className="text-sm font-bold text-slate-700 bg-transparent border-none outline-none cursor-pointer p-1"
                        />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <Button
                            variant={selectedShift === "all" ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 px-4 text-xs font-bold ${selectedShift === "all" ? "bg-white shadow-sm" : "text-slate-500"}`}
                            onClick={() => setSelectedShift("all")}
                        >
                            All
                        </Button>
                        <Button
                            variant={selectedShift === "day" ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 px-4 text-xs font-bold ${selectedShift === "day" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                            onClick={() => setSelectedShift("day")}
                        >
                            Day
                        </Button>
                        <Button
                            variant={selectedShift === "night" ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 px-4 text-xs font-bold ${selectedShift === "night" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                            onClick={() => setSelectedShift("night")}
                        >
                            Night
                        </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={refetchAll} className="h-10 text-slate-600 font-medium">
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="border-green-100 bg-green-50/20 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-100 p-3 rounded-full text-green-600">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Logged Vehicles</p>
                                <p className="text-2xl font-bold">{verifiedEntries.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-red-100 bg-red-50/20 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-red-100 p-3 rounded-full text-red-600">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Ghost Detections</p>
                                <p className="text-2xl font-bold text-red-600">{ghostDetections}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-center h-full">
                            <div className="space-y-1">
                                <p className="text-sm text-slate-500 font-medium">System Health</p>
                                <div className={`flex items-center gap-2 font-bold text-green-600`}>
                                    <div className={`w-2 h-2 rounded-full bg-green-600 animate-pulse`} />
                                    Central Server Online (Remote Audit Active)
                                </div>
                            </div>
                            <Activity className={"text-red-100 w-12 h-12"} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Unified Feed Area */}
            <div className="h-[calc(100vh-320px)] min-h-[600px] mt-2 xl:px-4">
                <Card className="flex flex-col overflow-hidden border-slate-200 shadow-sm h-full max-w-[1200px] mx-auto">
                    <CardHeader className="bg-slate-50/50 border-b shrink-0 py-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <CardTitle className="text-slate-800 flex items-center gap-2 mb-1">
                                    <View className="w-5 h-5 text-blue-500" /> Dual-Photo Audit Feed
                                </CardTitle>
                                <CardDescription>Correlating manual operator captures with automated hardware captures side-by-side.</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="outline" className="bg-white text-slate-700 font-bold border-slate-200">LIVE SYNC</Badge>
                                <Badge variant="destructive" className="animate-pulse shadow-sm shadow-red-500/50 bg-red-600 font-bold border-red-700">HAWKEYE ACTIVE</Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <CardContent className="p-4 sm:p-6 space-y-6 bg-slate-50/30">
                            {isLoadingLocal || isLoadingVerified ? (
                                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)
                            ) : unifiedEvents.length === 0 ? (
                                <div className="text-center py-24 text-slate-400">
                                    <ShieldCheck className="w-16 h-16 mx-auto mb-4 opacity-20 text-green-500" />
                                    <p className="text-lg font-medium">No scale activity recorded today.</p>
                                    <p className="text-sm mt-1 opacity-60">All vehicles detected by the hardware or operator will appear here.</p>
                                </div>
                            ) : (
                                unifiedEvents.map((event) => (
                                    <div key={event.id} className={`relative p-5 rounded-2xl border-2 transition-all hover:shadow-lg bg-white 
                                        ${event.status === 'missing_manual' ? 'border-red-200 shadow-md shadow-red-100/50' :
                                            event.status === 'missing_ghost' ? 'border-amber-200 shadow-sm shadow-amber-100/50' :
                                                event.status === 'dismissed' ? 'border-slate-200 opacity-60' : 'border-green-100 hover:border-green-300'}`}>

                                        {/* Status Header */}
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 pb-4 border-b border-slate-100 border-dashed gap-4">
                                            <div className="flex items-center gap-3">
                                                {event.status === 'missing_manual' ? (
                                                    <Badge variant="destructive" className="bg-red-600 py-1.5 px-3 flex items-center gap-1.5 shadow-sm shadow-red-200"><AlertTriangle className="w-3.5 h-3.5" /> GHOST VEHICLE</Badge>
                                                ) : event.status === 'missing_ghost' ? (
                                                    <Badge variant="outline" className="text-amber-700 border-amber-300 py-1.5 px-3 bg-amber-50 flex items-center gap-1.5"><CameraOff className="w-3.5 h-3.5" /> NO HARDWARE TRIGGER</Badge>
                                                ) : event.status === 'dismissed' ? (
                                                    <Badge variant="secondary" className="py-1.5 px-3 bg-slate-100 text-slate-500">DISMISSED GHOST</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-green-700 border-green-300 py-1.5 px-3 bg-green-50 flex items-center gap-1.5 shadow-sm shadow-green-100">
                                                        <CheckCircle className="w-3.5 h-3.5" /> VERIFIED MATCH
                                                    </Badge>
                                                )}
                                                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-md border border-slate-200">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {safeFormat(event.timestamp, 'HH:mm:ss aa')}
                                                </div>
                                            </div>

                                            {/* Contextual Stats */}
                                            {event.entry && (
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{event.entry.vehicle_type}</p>
                                                        <p className="text-base font-black text-slate-800 tracking-tight leading-none mt-0.5">{event.entry.vehicle_no}</p>
                                                    </div>
                                                    <div className="h-10 w-px bg-slate-200" />
                                                    <div className="text-left min-w-[90px]">
                                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Gross WT</p>
                                                        <p className="text-sm font-black text-slate-700 leading-none mt-1">{event.entry.gross_weight?.toLocaleString() || "—"} kg</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dual Image Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* LEFT: MANUAL */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                                        <User className="w-4 h-4 text-blue-500" /> Operator Entry
                                                    </p>
                                                    {event.entry && <span className="text-slate-400 font-medium capitalize text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">By {event.entry.entered_by}</span>}
                                                </div>
                                                <div className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border-2 ${!event.entry ? 'bg-red-50/50 border-red-200 border-dashed flex flex-col items-center justify-center text-red-500' : 'bg-slate-100 border-slate-200 shadow-inner'}`}>
                                                    {event.entry ? (
                                                        <>
                                                            <img
                                                                src={getManualPhotoUrl(event.entry)}
                                                                className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.02] transition-transform duration-300"
                                                                onClick={() => setSelectedZoomImage(getManualPhotoUrl(event.entry))}
                                                                alt="Manual Capture"
                                                                onError={(e) => (e.currentTarget.src = "/placeholder-image.jpg")}
                                                            />
                                                            <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded font-medium shadow-lg flex items-center gap-1.5 border border-white/10">
                                                                <Camera className="w-3.5 h-3.5 text-blue-400" /> Official Record
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-center p-6 bg-red-50/50 w-full h-full flex flex-col items-center justify-center">
                                                            <div className="bg-red-100 p-3 rounded-full mb-3">
                                                                <XCircle className="w-8 h-8 opacity-60 text-red-600" />
                                                            </div>
                                                            <span className="text-sm font-bold uppercase tracking-wider text-red-800">Missing Record</span>
                                                            <p className="text-xs text-red-500 font-medium mt-1 leading-snug max-w-[200px]">Operator did not save a matching weight ticket.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* RIGHT: AUTO */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                                        <Activity className="w-4 h-4 text-red-500" /> Hardware Capture
                                                    </p>
                                                    {event.ghosts && event.ghosts.length > 0 && <span className="text-slate-400 font-bold text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Scale: {event.ghosts[activeGhostIndex[event.id] || 0]?.detected_weight?.toLocaleString() || "—"} kg</span>}
                                                </div>
                                                <div className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border-2 ${!event.ghosts || event.ghosts.length === 0 ? 'bg-amber-50/50 border-amber-200 border-dashed flex flex-col items-center justify-center text-amber-600' : 'bg-slate-100 border-slate-200 shadow-inner group'}`}>
                                                    {event.ghosts && event.ghosts.length > 0 ? (
                                                        <>
                                                            <img
                                                                src={getGhostPhotoUrl(event.ghosts[activeGhostIndex[event.id] || 0])}
                                                                className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.02] transition-transform duration-300"
                                                                onClick={() => setSelectedZoomImage(getGhostPhotoUrl(event.ghosts[activeGhostIndex[event.id] || 0]))}
                                                                alt="Auto Capture"
                                                                onError={(e) => (e.currentTarget.src = "/placeholder-image.jpg")}
                                                            />
                                                            <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded font-medium shadow-lg flex items-center gap-1.5 border border-white/10">
                                                                <Activity className="w-3.5 h-3.5 text-red-400" /> AI Detection
                                                            </div>

                                                            {/* Image Slider Controls */}
                                                            {event.ghosts.length > 1 && (
                                                                <>
                                                                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full font-bold shadow-lg flex items-center gap-1.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        Image {(activeGhostIndex[event.id] || 0) + 1} of {event.ghosts.length}
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveGhostIndex(prev => ({
                                                                                ...prev,
                                                                                [event.id]: Math.max(0, (prev[event.id] || 0) - 1)
                                                                            }));
                                                                        }}
                                                                        disabled={(activeGhostIndex[event.id] || 0) === 0}
                                                                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-1.5 rounded-full disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100"
                                                                    >
                                                                        <ChevronLeft className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveGhostIndex(prev => ({
                                                                                ...prev,
                                                                                [event.id]: Math.min(event.ghosts.length - 1, (prev[event.id] || 0) + 1)
                                                                            }));
                                                                        }}
                                                                        disabled={(activeGhostIndex[event.id] || 0) === event.ghosts.length - 1}
                                                                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-1.5 rounded-full disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100"
                                                                    >
                                                                        <ChevronRight className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="text-center p-6 bg-amber-50/50 w-full h-full flex flex-col items-center justify-center">
                                                            <div className="bg-amber-100 p-3 rounded-full mb-3">
                                                                <CameraOff className="w-8 h-8 opacity-60 text-amber-600" />
                                                            </div>
                                                            <span className="text-sm font-bold uppercase tracking-wider text-amber-800">No Hardware Image</span>
                                                            <p className="text-xs text-amber-600 font-medium mt-1 leading-snug max-w-[200px]">Camera did not automatically fire for this entry.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action buttons if it's a ghost */}
                                        {event.status === 'missing_manual' && (
                                            <div className="mt-5 pt-4 border-t border-red-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-red-50/30 p-3 rounded-xl">
                                                <div className="flex items-start gap-3">
                                                    <div className="bg-red-100 text-red-600 p-2 rounded-lg mt-0.5">
                                                        <AlertTriangle className="w-5 h-5 shadow-sm" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-red-800">Unrecorded Vehicle Detected</p>
                                                        <p className="text-xs text-red-600/80 font-medium mt-0.5">A vehicle was stable on the scale ({event.ghosts[0]?.detected_weight} kg) without a digital entry being saved by the operator.</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full sm:w-auto border-red-200 text-red-700 bg-white hover:bg-red-600 hover:text-white text-xs font-bold shadow-sm"
                                                    onClick={() => setDismissTarget(event.ghosts[0]!)}
                                                >
                                                    Dismiss False Alarm
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </ScrollArea>
                </Card>
            </div>

            {/* Zoom Dialog */}
            <Dialog open={!!selectedZoomImage} onOpenChange={(open) => !open && setSelectedZoomImage(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90 border-none">
                    <DialogHeader className="p-4 absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Camera className="w-5 h-5" /> High-Resolution Inspection View
                        </DialogTitle>
                    </DialogHeader>
                    {selectedZoomImage && (
                        <div className="flex items-center justify-center min-h-[40vh] bg-slate-900">
                            <img
                                src={selectedZoomImage}
                                alt="Zoomed view"
                                className="max-w-full max-h-[85vh] object-contain shadow-2xl"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = "/placeholder-image.jpg";
                                }}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dismiss Dialog */}
            <Dialog open={!!dismissTarget} onOpenChange={(o) => (!o && setDismissTarget(null))}>
                <DialogContent className="rounded-2xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Dismiss Detaction</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-slate-500">Provide a reason for why this ghost detection is valid and not a system entry.</p>
                        <Input
                            placeholder="e.g. Vehicle backed off scale..."
                            value={dismissReason}
                            onChange={(e) => setDismissReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDismissTarget(null)}>Cancel</Button>
                        <Button onClick={handleDismiss} disabled={dismissMutation.isPending} className="bg-red-600 hover:bg-red-700">
                            Dismiss Detection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
