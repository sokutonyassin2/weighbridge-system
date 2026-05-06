import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Clock, MapPin, Truck, CheckCircle2, User, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface TripTimelineProps {
    tripId: string;
    vehicleNo?: string;
    tripNumber?: string;
}

const MILESTONE_PRESETS = [
    "Left HQ / Departed",
    "Reached Checkpoint",
    "Reached Tunduma",
    "Departed Tunduma",
    "Reached Customer",
    "Offloading Started",
    "Offloading Completed",
    "Reloading (for Return)",
    "Reached Border (Return)",
    "Reached HQ (Completion)",
    "Delayed / Breakdown",
    "Other"
];

export const TripTimeline = ({ tripId, vehicleNo, tripNumber }: TripTimelineProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { userProfile, user } = useAuth();
    
    const [isLogging, setIsLogging] = useState(false);
    const [newEvent, setNewEvent] = useState({
        event_type: "",
        location_name: "",
        notes: ""
    });

    // Fetch Events
    const { data: events, isLoading } = useQuery({
        queryKey: ["logistics_trip_events", tripId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_events" as any)
                .select("*")
                .eq("trip_id", tripId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []) as any[];
        },
        enabled: !!tripId
    });

    const addEventMutation = useMutation({
        mutationFn: async (eventData: typeof newEvent) => {
            if (!eventData.event_type) {
                throw new Error("Please select an event type.");
            }
            const { error } = await supabase.from("logistics_trip_events" as any).insert([{
                trip_id: tripId,
                event_type: eventData.event_type,
                location_name: eventData.location_name,
                notes: eventData.notes,
                operator_id: user?.id,
                operator_name: userProfile?.full_name || user?.email
            }]);
            
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_events", tripId] });
            setIsLogging(false);
            setNewEvent({ event_type: "", location_name: "", notes: "" });
            toast({ title: "Milestone Logged", description: "The timeline has been updated." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    const getEventIcon = (type: string) => {
        const lower = type.toLowerCase();
        if (lower.includes('departed') || lower.includes('left')) return <Truck className="w-4 h-4 text-blue-500" />;
        if (lower.includes('reached') || lower.includes('arrived')) return <MapPin className="w-4 h-4 text-emerald-500" />;
        if (lower.includes('completed')) return <CheckCircle2 className="w-4 h-4 text-green-600" />;
        if (lower.includes('delay') || lower.includes('breakdown')) return <AlertTriangle className="w-4 h-4 text-red-500" />;
        return <Clock className="w-4 h-4 text-slate-500" />;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Trip Timeline</h3>
                    <p className="text-xs text-slate-500 font-medium">Tracking history for {tripNumber || 'this trip'} {vehicleNo ? `(${vehicleNo})` : ''}</p>
                </div>
                {!isLogging && (
                    <Button size="sm" onClick={() => setIsLogging(true)} className="gap-2 bg-slate-900">
                        <Plus className="w-4 h-4" /> Log Milestone
                    </Button>
                )}
            </div>

            {isLogging && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold text-sm text-slate-700">New Milestone</h4>
                        <Button variant="ghost" size="sm" className="h-6 text-slate-400" onClick={() => setIsLogging(false)}>Cancel</Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase text-slate-500">Event Type *</Label>
                            <Select value={newEvent.event_type} onValueChange={(v) => setNewEvent({...newEvent, event_type: v})}>
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Select event..." /></SelectTrigger>
                                <SelectContent>
                                    {MILESTONE_PRESETS.map(preset => (
                                        <SelectItem key={preset} value={preset}>{preset}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase text-slate-500">Location (Optional)</Label>
                            <Input placeholder="e.g. Makambako" className="bg-white" value={newEvent.location_name} onChange={(e) => setNewEvent({...newEvent, location_name: e.target.value})} />
                        </div>
                    </div>
                    
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Notes (Optional)</Label>
                        <Textarea placeholder="Any additional details or delay reasons..." className="resize-none bg-white h-20" value={newEvent.notes} onChange={(e) => setNewEvent({...newEvent, notes: e.target.value})} />
                    </div>

                    <Button className="w-full font-bold bg-blue-600 hover:bg-blue-700" onClick={() => addEventMutation.mutate(newEvent)} disabled={addEventMutation.isPending}>
                        {addEventMutation.isPending ? "Saving..." : "Save Milestone to Timeline"}
                    </Button>
                </div>
            )}

            <div className="relative pl-4 space-y-6 pt-2 pb-6">
                {/* Vertical Line */}
                <div className="absolute left-[27px] top-4 bottom-0 w-0.5 bg-slate-200"></div>

                {isLoading ? (
                    <div className="text-sm text-slate-500 text-center py-4">Loading timeline...</div>
                ) : events?.length === 0 ? (
                    <div className="text-sm text-slate-500 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        No milestones logged yet. Click "Log Milestone" to start tracking.
                    </div>
                ) : (
                    events?.map((event, index) => (
                        <div key={event.id} className="relative flex gap-4 items-start group animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${index * 50}ms` }}>
                            {/* Dot/Icon */}
                            <div className="relative z-10 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm shrink-0 mt-0.5 group-hover:border-primary transition-colors">
                                {getEventIcon(event.event_type)}
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 bg-white border border-slate-100 shadow-sm rounded-xl p-3 md:p-4 hover:shadow-md transition-shadow">
                                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2">
                                    <div>
                                        <h4 className="font-bold text-slate-900">{event.event_type}</h4>
                                        {event.location_name && (
                                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1 font-medium">
                                                <MapPin className="w-3 h-3" /> {event.location_name}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-md shrink-0 w-fit">
                                        <Clock className="w-3 h-3" />
                                        {format(new Date(event.created_at), "MMM dd, HH:mm")}
                                    </div>
                                </div>
                                
                                {event.notes && (
                                    <div className="mt-3 text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                        {event.notes}
                                    </div>
                                )}
                                
                                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                                    <User className="w-3 h-3" /> Logged by {event.operator_name || 'System'}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
