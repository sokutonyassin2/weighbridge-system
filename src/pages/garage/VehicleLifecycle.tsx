import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Activity, Search, TrendingUp, AlertTriangle, Clock, Wrench, Package, Calendar, ChevronsUpDown, ArrowRight, DollarSign, Gauge, Truck, Check, X, Tag, Download, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import WorkshopDirectorsReport from "./WorkshopDirectorsReport";
import { BarChart3 } from "lucide-react";

interface VehicleLifecycleProps {
  language: "en" | "sw";
  vehicles: any[] | undefined;
}

export default function VehicleLifecycle({ language, vehicles = [] }: VehicleLifecycleProps) {
  // Support Multi-Vehicle selection
  const [activeTab, setActiveTab] = useState<"lifecycle" | "directors_report">("lifecycle");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
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
      (v.plate_number || v.vehicle_no || "").toLowerCase().includes(vehicleSearchTerm.toLowerCase()) ||
      (v.asset_type || "").toLowerCase().includes(vehicleSearchTerm.toLowerCase())
    );
  }, [vehicles, vehicleSearchTerm]);

  const selectedVehiclesList = useMemo(() => {
    return vehicles.filter((v: any) => selectedVehicleIds.includes(v.id));
  }, [vehicles, selectedVehicleIds]);

  const toggleVehicleSelection = (vehId: string) => {
    setSelectedVehicleIds(prev => 
      prev.includes(vehId) ? prev.filter(id => id !== vehId) : [...prev, vehId]
    );
  };

  const selectAllVehicles = () => {
    if (selectedVehicleIds.length === vehicles.length) {
      setSelectedVehicleIds([]);
    } else {
      setSelectedVehicleIds(vehicles.map((v: any) => v.id));
    }
  };

  // Fetch Profiles to resolve UUID -> Human names
  const { data: userProfiles = [] } = useQuery({
    queryKey: ["all-user-profiles"],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email");
        return data || [];
      } catch {
        return [];
      }
    }
  });

  // Fetch Garage Personnel for mechanic names
  const { data: garagePersonnel = [] } = useQuery({
    queryKey: ["all-garage-personnel"],
    queryFn: async () => {
      try {
        const { data } = await (supabase as any)
          .from("garage_personnel")
          .select("id, name");
        return data || [];
      } catch {
        return [];
      }
    }
  });

  const resolveUserName = (rawIdOrName: string) => {
    if (!rawIdOrName) return "Staff";
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rawIdOrName).trim());
    if (isUUID) {
      const foundUser = userProfiles.find((p: any) => p.id === String(rawIdOrName).trim());
      if (foundUser?.full_name) return foundUser.full_name;
      const foundPersonnel = garagePersonnel.find((p: any) => p.id === String(rawIdOrName).trim());
      if (foundPersonnel?.name) return foundPersonnel.name;
      return "Garage Staff";
    }
    return rawIdOrName;
  };

  // Helper: resolve vehicle plate from vehicles prop
  const resolveVehiclePlate = (vehicleId: string) => {
    const v = vehicles.find((veh: any) => veh.id === vehicleId);
    return v?.plate_number || v?.vehicle_no || "Unit";
  };

  // Fetch Jobs and Faults for all selected vehicles
  const { data: jobHistory = [], isLoading: isLoadingJobs } = useQuery({
    queryKey: ["lifecycle-jobs-multi", selectedVehicleIds],
    enabled: selectedVehicleIds.length > 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("garage_job_cards")
          .select(`
            id, status, opened_at, closed_at, odometer_at_fault, vehicle_id,
            fault_list:garage_job_faults(
              id, status, mechanic_notes, created_at, mechanic_id,
              fault_type:garage_fault_types(fault_name, category)
            )
          `)
          .in("vehicle_id", selectedVehicleIds)
          .order("opened_at", { ascending: false });
        
        if (error) {
          console.warn("Error fetching jobHistory:", error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.error("Job history fetch failed:", e);
        return [];
      }
    }
  });

  // Fetch Part Usage and Procurement Prices
  const { data: partUsage = [], isLoading: isLoadingParts } = useQuery({
    queryKey: ["lifecycle-parts-multi", selectedVehicleIds],
    enabled: selectedVehicleIds.length > 0,
    queryFn: async () => {
      // Run both queries in PARALLEL for speed
      const [usageResult, reqResult] = await Promise.all([
        supabase
          .from("garage_inventory_usage")
          .select("*, item:garage_inventory(unit_price, selling_price)")
          .in("vehicle_id", selectedVehicleIds)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false }),
        supabase
          .from("garage_requisitions")
          .select("*")
          .in("vehicle_id", selectedVehicleIds)
          .eq("status", "Closed")
          .eq("is_deleted", false)
          .order("status_updated_at", { ascending: false })
      ]);

      const usageData = (!usageResult.error && usageResult.data) ? usageResult.data : [];
      const reqData = (!reqResult.error && reqResult.data) ? reqResult.data : [];

      // Build price map from the requisitions we already fetched (no extra query needed)
      const priceMap: Record<string, number> = {};
      reqData.forEach((r: any) => {
        if (r.item_id && r.unit_price > 0) priceMap[r.item_id] = r.unit_price;
        if (r.item_name && r.unit_price > 0) priceMap[r.item_name.toLowerCase().trim()] = r.unit_price;
      });

      const processedUsage = (usageData || []).map((p: any) => {
        const itemPrice = p.item?.unit_price || p.item?.selling_price || priceMap[p.item_id] || 0;
        return {
          ...p,
          source: 'store',
          unit_price: itemPrice,
          total_price: (p.quantity_used || 1) * itemPrice,
          vehicle_plate: resolveVehiclePlate(p.vehicle_id)
        };
      });

      const processedReqs = (reqData || []).map((r: any) => {
        const itemPrice = r.unit_price || priceMap[r.item_name?.toLowerCase()?.trim()] || 0;
        const qty = r.quantity_requested || r.quantity || 1;
        const requestedByName = resolveUserName(r.requested_by);
        return {
          ...r,
          source: 'procurement',
          unit_price: itemPrice,
          total_price: qty * itemPrice,
          quantity_used: qty,
          created_at: r.status_updated_at || r.created_at,
          item_name: r.item_name || 'Procured Part',
          issued_to: requestedByName,
          notes: r.description ? `Procured: ${r.description}` : 'Procured directly via requisitions',
          vehicle_plate: resolveVehiclePlate(r.vehicle_id)
        };
      });

      const combined = [...processedUsage, ...processedReqs];
      return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  });

  const exportToExcel = () => {
    const dataToExport = partUsage.map(p => ({
      Date: new Date(p.created_at).toLocaleDateString(),
      Vehicle: p.vehicle_plate,
      Item: p.item_name || 'N/A',
      Source: p.source,
      Quantity: p.quantity_used,
      Unit_Price: p.unit_price,
      Total_Price: p.total_price,
      Notes: p.notes
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lifecycle");
    XLSX.writeFile(workbook, `Vehicle_Lifecycle_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filteredMonthCost = useMemo(() => {
    if (selectedVehicleIds.length === 0 || partUsage.length === 0) return 0;
    const [y, m] = selectedMonth.split('-').map(Number);
    return partUsage.filter((p: any) => {
      const d = new Date(p.created_at);
      return d.getMonth() === (m - 1) && d.getFullYear() === y;
    }).reduce((sum: number, p: any) => sum + (p.total_price || (p.quantity_used * (p.unit_price || 0))), 0);
  }, [partUsage, selectedVehicleIds, selectedMonth]);

  const totalOverallCost = useMemo(() => {
    if (selectedVehicleIds.length === 0 || partUsage.length === 0) return 0;
    return partUsage.reduce((sum: number, p: any) => sum + (p.total_price || (p.quantity_used * (p.unit_price || 0))), 0);
  }, [partUsage, selectedVehicleIds]);

  const timeline = useMemo(() => {
    if (selectedVehicleIds.length === 0) return [];
    
    const events: any[] = [];
    
    jobHistory.forEach((job: any) => {
      const vehPlate = resolveVehiclePlate(job.vehicle_id);
      (job.fault_list || []).forEach((fault: any) => {
        const mechanicName = garagePersonnel.find((p: any) => p.id === fault.mechanic_id)?.name;
        events.push({
          type: 'fault',
          date: new Date(fault.created_at || job.opened_at),
          title: `Fault Logged: ${fault.fault_type?.fault_name || 'Unknown Issue'}`,
          category: fault.fault_type?.category || 'General',
          notes: fault.mechanic_notes,
          odometer: job.odometer_at_fault,
          status: fault.status,
          rawName: fault.fault_type?.fault_name,
          vehicle_plate: vehPlate,
          assigned_to: mechanicName
        });
      });
    });

    partUsage.forEach((part: any) => {
      const displayIssuedTo = resolveUserName(part.issued_to);
      events.push({
        type: 'part',
        date: new Date(part.created_at),
        title: part.source === 'procurement' ? `Procured/Replaced: ${part.item_name}` : `Item Requested: ${part.item_name}`,
        quantity: part.quantity_used || 1,
        issued_to: displayIssuedTo,
        notes: part.notes,
        rawName: part.item_name,
        source: part.source,
        unit_price: part.unit_price || 0,
        total_price: part.total_price || 0,
        vehicle_plate: part.vehicle_plate
      });
    });

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [jobHistory, partUsage, selectedVehicleIds, garagePersonnel, userProfiles]);

  const analytics = useMemo(() => {
    if (selectedVehicleIds.length === 0) return { recurringFaults: [], recurringParts: [] };

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
      return recurring.sort((a, b) => b.count - a.count);
    };

    return {
      recurringFaults: processRecurrence('fault'),
      recurringParts: processRecurrence('part')
    };
  }, [timeline, selectedVehicleIds]);

  const isLoading = isLoadingJobs || isLoadingParts;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            {language === 'en' ? 'Fleet Analytics & Workshop Operations' : 'Uchambuzi wa Magari & Karakana'}
          </h1>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.1em]">
            {language === 'en' ? 'Real-time vehicle lifecycle metrics, recurring fault tracking & executive workshop reporting' : 'Vipimo vya maisha ya gari, matatizo yanayojirudia na ripoti kuu ya karakana'}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <Button
            type="button"
            variant={activeTab === 'lifecycle' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('lifecycle')}
            className={activeTab === 'lifecycle' ? 'bg-white text-indigo-700 shadow-sm hover:bg-white font-bold text-xs h-8' : 'text-slate-600 hover:text-slate-900 font-semibold text-xs h-8'}
          >
            <Activity className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            {language === 'en' ? 'Lifecycle & Parts Lifespan' : 'Maisha ya Magari & Vipuri'}
          </Button>
          <Button
            type="button"
            variant={activeTab === 'directors_report' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('directors_report')}
            className={activeTab === 'directors_report' ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 font-bold text-xs h-8' : 'text-slate-600 hover:text-slate-900 font-semibold text-xs h-8'}
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            {language === 'en' ? "Workshop Director's Report" : 'Ripoti ya Wakurugenzi'}
          </Button>
        </div>
      </div>

      {activeTab === 'directors_report' ? (
        <WorkshopDirectorsReport language={language} vehicles={vehicles} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-none shadow-md bg-white">
            <CardHeader className="pb-3 border-b bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600" />
                {language === 'en' ? 'Select Vehicles (Multi-Select)' : 'Chagua Magari (Zaidi ya Moja)'}
              </CardTitle>
              {vehicles.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={selectAllVehicles}
                  className="h-6 text-[10px] text-indigo-600 font-bold p-1 hover:bg-indigo-50"
                >
                  {selectedVehicleIds.length === vehicles.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <Popover open={vehicleSearchOpen} onOpenChange={setVehicleSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehicleSearchOpen}
                    className="w-full justify-between h-10 border-slate-200 text-slate-700 bg-white font-medium hover:bg-slate-50"
                  >
                    {selectedVehicleIds.length > 0 ? (
                      <span className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                        <Badge className="bg-indigo-600 text-white text-[10px] font-bold">
                          {selectedVehicleIds.length}
                        </Badge>
                        <span>Vehicles Selected</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal text-xs">
                        {language === 'en' ? "Search & select vehicles..." : "Tafuta na uchague magari..."}
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-slate-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0 z-[9999]" align="start">
                  <Command>
                    <CommandInput 
                      placeholder={language === 'en' ? "Filter plates..." : "Chuja namba..."} 
                      value={vehicleSearchTerm}
                      onValueChange={setVehicleSearchTerm}
                      className="h-9 text-xs"
                    />
                    <CommandList className="max-h-[280px]">
                      <CommandEmpty>No vehicle found.</CommandEmpty>
                      <CommandGroup>
                        {filteredVehicles.map((v: any) => {
                          const isChecked = selectedVehicleIds.includes(v.id);
                          return (
                            <CommandItem
                              key={v.id}
                              value={`${v.plate_number} ${v.vehicle_no || ''} ${v.asset_type || ''}`}
                              onSelect={() => toggleVehicleSelection(v.id)}
                              className="flex items-center justify-between py-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox 
                                  checked={isChecked}
                                  onCheckedChange={() => toggleVehicleSelection(v.id)}
                                  className="h-4 w-4"
                                />
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                                  {v.asset_type || "Truck"}
                                </span>
                                <span className="font-bold text-slate-800 text-xs">{v.plate_number || v.vehicle_no}</span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {selectedVehiclesList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-[120px] overflow-y-auto pr-1">
                  {selectedVehiclesList.map((v: any) => (
                    <Badge 
                      key={v.id} 
                      variant="secondary"
                      className="bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200 text-[10px] font-bold py-0.5 px-2 gap-1 flex items-center"
                    >
                      <span>{v.plate_number || v.vehicle_no}</span>
                      <X 
                        className="w-3 h-3 cursor-pointer text-indigo-400 hover:text-indigo-700" 
                        onClick={() => toggleVehicleSelection(v.id)} 
                      />
                    </Badge>
                  ))}
                </div>
              )}

              {selectedVehicleIds.length === 0 && (
                <div className="mt-4 p-4 rounded-lg bg-indigo-50/50 border border-indigo-100 text-center">
                  <TrendingUp className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
                  <p className="text-xs text-indigo-800 font-medium">Select one or multiple vehicles to compare historical timeline, part costs, and degradation rates.</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {selectedVehicleIds.length > 0 && (
            <>
            <Card className="border-none shadow-md bg-gradient-to-br from-slate-800 to-slate-900 text-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  {selectedVehicleIds.length === 1 ? 'Selected Vehicle' : 'Fleet Filter Active'}
                </p>
                <p className="text-xl font-bold tracking-tight">
                  {selectedVehicleIds.length === 1 
                    ? selectedVehiclesList[0]?.plate_number 
                    : `${selectedVehicleIds.length} Fleet Units Selected`}
                </p>
                
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
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Combined Parts Investment</p>
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
                    <p className="text-base font-bold text-rose-700 mt-1">TZS {filteredMonthCost.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">All-Time Total</p>
                    <p className="text-base font-bold text-slate-800 mt-1">TZS {totalOverallCost.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            </>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {selectedVehicleIds.length > 0 ? (
            <>
              {isLoading ? (
                <Card className="border-none shadow-md bg-white">
                  <CardContent className="flex items-center justify-center py-16">
                    <div className="text-center space-y-3">
                      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading lifecycle data...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Recurring Issues Detected */}
                  {(analytics.recurringFaults.length > 0 || analytics.recurringParts.length > 0) && (
                    <Card className="border-none shadow-md bg-white">
                      <CardHeader className="pb-3 border-b bg-amber-50/50">
                        <CardTitle className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          Recurring Issues Detected
                        </CardTitle>
                        <CardDescription className="text-[10px] text-amber-600 font-medium">
                          Items appearing more than once across the selected fleet units
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        {analytics.recurringFaults.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <Wrench className="w-3 h-3" /> Recurring Faults
                            </p>
                            {analytics.recurringFaults.map((rf: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between bg-rose-50 rounded-lg p-3 border border-rose-100">
                                <div>
                                  <p className="text-xs font-bold text-rose-800">{rf.name}</p>
                                  <p className="text-[10px] text-rose-500">
                                    Avg {rf.avgDaysLifespan} days between occurrences
                                    {rf.avgMileageLifespan && ` · ~${rf.avgMileageLifespan.toLocaleString()} km`}
                                  </p>
                                </div>
                                <Badge className="bg-rose-600 text-white text-xs font-bold">{rf.count}×</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                        {analytics.recurringParts.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <Package className="w-3 h-3" /> Recurring Parts
                            </p>
                            {analytics.recurringParts.map((rp: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between bg-amber-50 rounded-lg p-3 border border-amber-100">
                                <div>
                                  <p className="text-xs font-bold text-amber-800">{rp.name}</p>
                                  <p className="text-[10px] text-amber-500">
                                    Avg {rp.avgDaysLifespan} days between replacements
                                    {rp.avgMileageLifespan && ` · ~${rp.avgMileageLifespan.toLocaleString()} km`}
                                  </p>
                                </div>
                                <Badge className="bg-amber-600 text-white text-xs font-bold">{rp.count}×</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Full Chronological History */}
                  <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-3 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                          <Clock className="w-4 h-4 text-indigo-600" />
                          Full Chronological History
                        </CardTitle>
                        <CardDescription className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {timeline.length} events across {selectedVehicleIds.length} vehicle(s)
                        </CardDescription>
                      </div>
                      {timeline.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exportToExcel}
                          className="h-8 text-[10px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1.5"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Export Excel
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="p-4">
                      {timeline.length > 0 ? (
                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                          {timeline.map((event: any, idx: number) => (
                            <div key={idx} className="relative pl-6 border-l-2 border-slate-200 pb-4 last:pb-0">
                              <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${event.type === 'fault' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-[10px] font-bold text-slate-400">
                                  <Calendar className="w-3 h-3 inline mr-1" />
                                  {event.date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </span>
                                {selectedVehicleIds.length > 1 && (
                                  <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-300 font-bold">
                                    <Truck className="w-2.5 h-2.5 mr-0.5" />
                                    {event.vehicle_plate}
                                  </Badge>
                                )}
                                <Badge className={`text-[9px] font-bold ${event.type === 'fault' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {event.type === 'fault' ? 'FAULT' : 'PART'}
                                </Badge>
                                {event.type === 'part' && event.total_price > 0 && (
                                  <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                                    <Tag className="w-2.5 h-2.5 mr-0.5" />
                                    TZS {event.total_price.toLocaleString()} Total
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs font-bold text-slate-800 mt-0.5">{event.title}</p>

                              <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 mt-2 space-y-2">
                                {event.type === 'fault' ? (
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-[9px] bg-white text-slate-600">{event.category}</Badge>
                                      {event.status && (
                                        <Badge variant="outline" className={`text-[9px] ${event.status === 'Resolved' || event.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                          {event.status}
                                        </Badge>
                                      )}
                                      {event.assigned_to && (
                                        <span className="text-[10px] font-medium text-slate-500 bg-white border px-2 py-0.5 rounded">
                                          Mechanic: <strong className="text-slate-700">{event.assigned_to}</strong>
                                        </span>
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
                                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">Qty: {event.quantity}</span>
                                      <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                                        <Truck className="w-3 h-3 text-slate-400" /> Issued to: <strong className="text-slate-900">{event.issued_to}</strong>
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
                          <p className="text-xs">These vehicles have no recorded faults or part issues.</p>
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
                Search and select one or multiple vehicle plates from the left panel to generate comparative lifecycle analytics and repair timelines.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-500 animate-bounce" />
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Select trucks to analyze</span>
              </div>
            </Card>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
