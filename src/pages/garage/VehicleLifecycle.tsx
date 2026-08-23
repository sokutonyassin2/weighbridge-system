import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Search, TrendingUp, AlertTriangle, Clock, Wrench, Package, Calendar, ChevronsUpDown, ArrowRight, DollarSign, Gauge, Truck } from "lucide-react";

interface VehicleLifecycleProps {
  language: "en" | "sw";
  vehicles: any[] | undefined;
}

export default function VehicleLifecycle({ language, vehicles = [] }: VehicleLifecycleProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [vehicleSearchOpen, setVehicleSearchOpen] = useState(false);
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState("");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const year = d.getFullYear();
      const month = d.getMonth();
      const val = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en', { month: 'long', year: 'numeric' });
      opts.push({ value: val, label });
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  }, []);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v: any) =>
      v.plate_number.toLowerCase().includes(vehicleSearchTerm.toLowerCase())
    );
  }, [vehicles, vehicleSearchTerm]);

  // Fetch Jobs and Faults
  const { data: jobHistory = [], isLoading: isLoadingJobs } = useQuery({
    queryKey: ["lifecycle-jobs", selectedVehicle?.id],
    enabled: !!selectedVehicle?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("garage_job_cards")
        .select(`
          id, status, opened_at, closed_at, odometer_at_fault,
          fault_list:garage_job_faults(
            id, status, mechanic_notes, created_at,
            fault_type:garage_fault_types(fault_name, category)
          )
        `)
        .eq("vehicle_id", selectedVehicle.id)
        .order("opened_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch Part Usage (Combined from Garage Store and Procurement Requisitions)
  const { data: partUsage = [], isLoading: isLoadingParts } = useQuery({
    queryKey: ["lifecycle-parts", selectedVehicle?.id],
    enabled: !!selectedVehicle?.id,
    queryFn: async () => {
      // 1. Fetch Garage Store Issues
      const { data: usageData, error: usageError } = await supabase
        .from("garage_inventory_usage")
        .select("*, item:garage_inventory(unit_price)")
        .eq("vehicle_id", selectedVehicle.id)
        .order("created_at", { ascending: false });
      
      if (usageError) throw usageError;

      // 2. Fetch Procurement Purchases
      const { data: reqData, error: reqError } = await supabase
        .from("garage_requisitions")
        .select("*")
        .eq("vehicle_id", selectedVehicle.id)
        .eq("status", "Closed")
        .order("status_updated_at", { ascending: false });
      
      if (reqError) throw reqError;

      // Price mapping fallback for garage issues
      const { data: reqs } = await supabase.from("garage_requisitions").select("item_id, unit_price").gt("unit_price", 0);
      const priceMap: Record<string, number> = {};
      (reqs || []).forEach((r: any) => { if(r.item_id) priceMap[r.item_id] = r.unit_price; });

      const processedUsage = (usageData || []).map((p: any) => ({
          ...p,
          source: 'store',
          augmented_price: p.item?.unit_price > 0 ? p.item.unit_price : (priceMap[p.item_id] || 0)
      }));

      const processedReqs = (reqData || []).map((r: any) => ({
          ...r,
          source: 'procurement',
          augmented_price: r.unit_price || 0,
          quantity_used: r.quantity_requested || 1,
          created_at: r.status_updated_at || r.created_at,
          item_name: r.item_name || 'Procured Part',
          issued_to: r.requested_by || 'Direct Procure',
          notes: r.description ? `Procured: ${r.description}` : 'Procured directly via requisitions'
      }));

      const combined = [...processedUsage, ...processedReqs];
      return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  });

  const filteredMonthCost = useMemo(() => {
    if (!selectedVehicle || partUsage.length === 0) return 0;
    const [y, m] = selectedMonth.split('-').map(Number);
    return partUsage.filter((p: any) => {
      const d = new Date(p.created_at);
      return d.getMonth() === (m - 1) && d.getFullYear() === y;
    }).reduce((sum: number, p: any) => sum + (p.quantity_used * (p.augmented_price || 0)), 0);
  }, [partUsage, selectedVehicle, selectedMonth]);

  const totalOverallCost = useMemo(() => {
    if (!selectedVehicle || partUsage.length === 0) return 0;
    return partUsage.reduce((sum: number, p: any) => sum + (p.quantity_used * (p.augmented_price || 0)), 0);
  }, [partUsage, selectedVehicle]);

  const latestOdometer = useMemo(() => {
    if (!selectedVehicle || jobHistory.length === 0) return null;
    const withOdo = jobHistory.filter((j: any) => j.odometer_at_fault && j.odometer_at_fault > 0);
    if (withOdo.length === 0) return null;
    return withOdo[0].odometer_at_fault;
  }, [jobHistory, selectedVehicle]);

  // Generate unified timeline
  const timeline = useMemo(() => {
    if (!selectedVehicle) return [];
    
    const events: any[] = [];
    
    // Process faults
    jobHistory.forEach((job: any) => {
      (job.fault_list || []).forEach((fault: any) => {
        events.push({
          type: 'fault',
          date: new Date(fault.created_at || job.opened_at),
          title: `Fault Logged: ${fault.fault_type?.fault_name || 'Unknown Issue'}`,
          category: fault.fault_type?.category || 'General',
          notes: fault.mechanic_notes,
          odometer: job.odometer_at_fault,
          status: fault.status,
          rawName: fault.fault_type?.fault_name
        });
      });
    });

    // Process part usage
    partUsage.forEach((part: any) => {
      events.push({
        type: 'part',
        date: new Date(part.created_at),
        title: part.source === 'procurement' ? `Procured/Replaced: ${part.item_name}` : `Item Requested: ${part.item_name}`,
        quantity: part.quantity_used,
        issued_to: part.issued_to,
        notes: part.notes,
        rawName: part.item_name,
        source: part.source
      });
    });

    // Sort descending by date
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [jobHistory, partUsage, selectedVehicle]);

  // Recurrence & Lifespan Analytics Engine
  const analytics = useMemo(() => {
    if (!selectedVehicle) return { recurringFaults: [], recurringParts: [] };

    const processRecurrence = (type: 'fault' | 'part') => {
      const items = timeline.filter(e => e.type === type);
      const groups: Record<string, any[]> = {};
      
      items.forEach(item => {
        if (!item.rawName) return;
        if (!groups[item.rawName]) groups[item.rawName] = [];
        groups[item.rawName].push(item);
      });

      const recurring: any[] = [];
      Object.keys(groups).forEach(name => {
        const occurrences = groups[name];
        if (occurrences.length > 1) {
          // Calculate time between latest and previous
          // Occurrences are already sorted descending
          let totalDays = 0;
          let totalMileage = 0;
          let mileageCount = 0;

          for (let i = 0; i < occurrences.length - 1; i++) {
            const latest = occurrences[i];
            const prev = occurrences[i + 1];
            
            const diffTime = Math.abs(latest.date.getTime() - prev.date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            totalDays += diffDays;

            if (latest.odometer && prev.odometer) {
              totalMileage += Math.abs(Number(latest.odometer) - Number(prev.odometer));
              mileageCount++;
            }
          }

          recurring.push({
            name,
            count: occurrences.length,
            latestDate: occurrences[0].date,
            avgDaysLifespan: Math.round(totalDays / (occurrences.length - 1)),
            avgMileageLifespan: mileageCount > 0 ? Math.round(totalMileage / mileageCount) : null
          });
        }
      });

      return recurring.sort((a, b) => b.count - a.count); // Sort by highest frequency
    };

    return {
      recurringFaults: processRecurrence('fault'),
      recurringParts: processRecurrence('part')
    };
  }, [timeline, selectedVehicle]);

  const isLoading = isLoadingJobs || isLoadingParts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            {language === 'en' ? 'Vehicle Lifecycle Analytics' : 'Uchambuzi wa Maisha ya Gari'}
          </h1>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.1em]">
            {language === 'en' ? 'Track recurring issues and part lifespans' : 'Fuatilia matatizo ya mara kwa mara'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Lookup Column */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-none shadow-md bg-white">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                {language === 'en' ? 'Select Vehicle' : 'Chagua Gari'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Popover open={vehicleSearchOpen} onOpenChange={setVehicleSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehicleSearchOpen}
                    className="w-full justify-between h-10 border-slate-200 text-slate-700 bg-white font-medium hover:bg-slate-50"
                  >
                    {selectedVehicle ? (
                      <span className="flex items-center gap-2 text-slate-800 font-bold">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] tracking-wide uppercase font-semibold">
                          {selectedVehicle.asset_type || "Truck"}
                        </span>
                        {selectedVehicle.plate_number}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">
                        {language === 'en' ? "Search Plate Number..." : "Tafuta namba ya gari..."}
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-slate-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder={language === 'en' ? "Type plate number..." : "Andika namba..."} 
                      value={vehicleSearchTerm}
                      onValueChange={setVehicleSearchTerm}
                      className="h-9"
                    />
                    <CommandList className="max-h-[250px]">
                      <CommandEmpty>No vehicle found.</CommandEmpty>
                      <CommandGroup>
                        {filteredVehicles.map((v: any) => (
                          <CommandItem
                            key={v.id}
                            value={v.plate_number}
                            onSelect={() => {
                              setSelectedVehicle(v);
                              setVehicleSearchOpen(false);
                              setVehicleSearchTerm("");
                            }}
                            className="flex items-center justify-between py-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                                {v.asset_type || "Truck"}
                              </span>
                              <span className="font-bold text-slate-700 text-xs">{v.plate_number}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {!selectedVehicle && (
                <div className="mt-6 p-4 rounded-lg bg-indigo-50/50 border border-indigo-100 text-center">
                  <TrendingUp className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
                  <p className="text-xs text-indigo-800 font-medium">Select a vehicle to view its entire historical timeline and part degradation rates.</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {selectedVehicle && (
            <>
            <Card className="border-none shadow-md bg-gradient-to-br from-slate-800 to-slate-900 text-white">
              <CardContent className="p-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vehicle Selected</p>
                <p className="text-2xl font-bold tracking-tight">{selectedVehicle.plate_number}</p>
                {latestOdometer && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-[11px] font-bold text-sky-400">{Number(latestOdometer).toLocaleString()} KM</span>
                    <span className="text-[9px] text-slate-500 uppercase">Current Odometer</span>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-700 pt-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Faults</p>
                    <p className="text-xl font-bold text-indigo-400 mt-0.5">{timeline.filter(t => t.type === 'fault').length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Parts Logged</p>
                    <p className="text-xl font-bold text-emerald-400 mt-0.5">{timeline.filter(t => t.type === 'part').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-white">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Repair Cost Analysis</p>
                </div>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-full h-9 text-xs font-medium border-slate-200 bg-slate-50">
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-rose-50 rounded-lg p-3 border border-rose-100">
                    <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Selected Month</p>
                    <p className="text-lg font-bold text-rose-700 mt-1">TZS {filteredMonthCost.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">All-Time Total</p>
                    <p className="text-lg font-bold text-slate-800 mt-1">TZS {totalOverallCost.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            </>
          )}
        </div>

        {/* Right Dashboard Area */}
        <div className="lg:col-span-2 space-y-6">
          {selectedVehicle ? (
            <>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                <>
                  {/* Lifespan & Recurrence Alerts */}
                  {(analytics.recurringFaults.length > 0 || analytics.recurringParts.length > 0) && (
                    <Card className="border-rose-100 shadow-md bg-white overflow-hidden">
                      <div className="bg-rose-50 border-b border-rose-100 p-4 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                        <div>
                          <h3 className="text-sm font-bold text-rose-800 tracking-tight">Recurring Issues Detected</h3>
                          <p className="text-[11px] text-rose-600">These items have failed multiple times on this vehicle.</p>
                        </div>
                      </div>
                      <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                          {analytics.recurringParts.map((part, i) => (
                            <div key={`p-${i}`} className="p-4 hover:bg-slate-50 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                                  <Package className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{part.name}</p>
                                  <p className="text-[11px] font-semibold text-slate-500">
                                    Replaced <span className="text-orange-600">{part.count} times</span>
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-4">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Lifespan</p>
                                  <p className="text-sm font-bold text-slate-700">~{part.avgDaysLifespan} days</p>
                                </div>
                                {part.avgMileageLifespan && (
                                  <div className="hidden sm:block">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Mileage</p>
                                    <p className="text-sm font-bold text-slate-700">{part.avgMileageLifespan.toLocaleString()} km</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          
                          {analytics.recurringFaults.map((fault, i) => (
                            <div key={`f-${i}`} className="p-4 hover:bg-slate-50 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                                  <Wrench className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{fault.name}</p>
                                  <p className="text-[11px] font-semibold text-slate-500">
                                    Fault occurred <span className="text-rose-600">{fault.count} times</span>
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-4">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Time Between</p>
                                  <p className="text-sm font-bold text-slate-700">~{fault.avgDaysLifespan} days</p>
                                </div>
                                {fault.avgMileageLifespan && (
                                  <div className="hidden sm:block">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Mileage Between</p>
                                    <p className="text-sm font-bold text-slate-700">{fault.avgMileageLifespan.toLocaleString()} km</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Chronological Timeline */}
                  <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-4 pt-5 px-6 border-b">
                      <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        Full Chronological History
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {timeline.length > 0 ? (
                        <div className="relative border-l-2 border-slate-100 ml-3 pl-6 space-y-8">
                          {timeline.map((event, index) => (
                            <div key={index} className="relative">
                              {/* Timeline dot */}
                              <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm flex items-center justify-center
                                ${event.type === 'fault' ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                              />
                              
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-1">
                                <h4 className={`text-sm font-bold ${event.type === 'fault' ? 'text-rose-700' : 'text-emerald-700'}`}>
                                  {event.title}
                                </h4>
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                                  <Clock className="w-3 h-3" />
                                  {event.date.toLocaleDateString()} {event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              
                              <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 mt-2 space-y-2">
                                {event.type === 'fault' ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[9px] bg-white text-slate-600">{event.category}</Badge>
                                      {event.status && (
                                        <Badge variant="outline" className={`text-[9px] ${event.status === 'Resolved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                          {event.status}
                                        </Badge>
                                      )}
                                      {event.odometer && (
                                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                          {event.odometer} km
                                        </span>
                                      )}
                                    </div>
                                    {event.notes && (
                                      <p className="text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2">"{event.notes}"</p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">Qty: {event.quantity}</span>
                                      <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                                        <Truck className="w-3 h-3 text-slate-400" /> Issued to: {event.issued_to}
                                      </span>
                                      {event.source === 'procurement' ? (
                                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200">Procured Directly</Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200">From Garage Store</Badge>
                                      )}
                                    </div>
                                    {event.notes && (
                                      <p className="text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2">"{event.notes}"</p>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-slate-400">
                          <Activity className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm font-semibold text-slate-600">No History Available</p>
                          <p className="text-xs">This vehicle has no recorded faults or part issues.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          ) : (
            <Card className="border-2 border-dashed border-slate-200 p-12 text-center bg-slate-50/20 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Search className="w-7 h-7 text-slate-400" />
              </div>
              <h2 className="text-base font-bold text-slate-700">No Vehicle Selected</h2>
              <p className="text-xs text-slate-400 max-w-sm mt-1.5">
                Search or select a vehicle plate from the left panel to generate its lifecycle analytics and repair timeline.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-500 animate-bounce" />
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Select a truck to analyze</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
