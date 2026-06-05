import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { 
  ClipboardCheck, Search, Plus, Trash2, Edit3, CheckCircle2, AlertTriangle, 
  HelpCircle, ShieldCheck, ArrowRight, RefreshCw, Check, ChevronsUpDown, Info 
} from "lucide-react";

interface VehicleEquipmentProps {
  language: "en" | "sw";
  vehicles: any[] | undefined;
}

export default function VehicleEquipment({ language, vehicles = [] }: VehicleEquipmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [vehicleSearchOpen, setVehicleSearchOpen] = useState(false);
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState("");
  
  // Dialog States
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Form States
  const [presetItem, setPresetItem] = useState("Spare Tyre");
  const [customItem, setCustomItem] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<"Good" | "Fair" | "Damaged" | "Missing">("Good");
  const [notes, setNotes] = useState("");
  
  const [editingItem, setEditingItem] = useState<any>(null);
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, boolean>>({});
  
  // Local Fallback Storage Trigger
  const [isLocalMode, setIsLocalMode] = useState(false);

  // Fetch all equipment items
  const { data: equipmentItems = [], isLoading, refetch } = useQuery({
    queryKey: ["vehicle-equipment"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("vehicle_equipment")
          .select("*")
          .eq("is_deleted", false);
        
        if (error) throw error;
        setIsLocalMode(false);
        return data;
      } catch (err) {
        console.warn("Using Local Storage Fallback for Vehicle Equipment:", err);
        setIsLocalMode(true);
        const local = localStorage.getItem("local_vehicle_equipment");
        if (local) {
          return JSON.parse(local);
        }
        
        // Seed default items in localStorage if empty
        const defaultSeeded: any[] = [];
        localStorage.setItem("local_vehicle_equipment", JSON.stringify(defaultSeeded));
        return defaultSeeded;
      }
    }
  });

  // Seed default equipment items for a vehicle if it has none
  const seedDefaultEquipment = (vehicleId: string) => {
    const defaultPresets = [
      { id: `seed-1-${vehicleId}`, vehicle_id: vehicleId, item_name: "Spare Tyre", serial_number: "ST-" + Math.floor(100000 + Math.random() * 900000), quantity: 1, condition: "Good", notes: "Standard factory wheel backup", assigned_at: new Date().toISOString(), last_checked_at: new Date().toISOString() },
      { id: `seed-2-${vehicleId}`, vehicle_id: vehicleId, item_name: "Fire Extinguisher 9kg", serial_number: "FE-" + Math.floor(100000 + Math.random() * 900000), quantity: 1, condition: "Good", notes: "A2 Dry Powder", assigned_at: new Date().toISOString(), last_checked_at: new Date().toISOString() },
      { id: `seed-3-${vehicleId}`, vehicle_id: vehicleId, item_name: "Reflector Triangle (Pair)", serial_number: "RT-" + Math.floor(100000 + Math.random() * 900000), quantity: 2, condition: "Good", notes: "Heavy Duty High Visibility", assigned_at: new Date().toISOString(), last_checked_at: new Date().toISOString() },
      { id: `seed-4-${vehicleId}`, vehicle_id: vehicleId, item_name: "Mechanical Jack", serial_number: "JK-" + Math.floor(100000 + Math.random() * 900000), quantity: 1, condition: "Fair", notes: "20 Ton Hydraulic", assigned_at: new Date().toISOString(), last_checked_at: new Date().toISOString() },
      { id: `seed-5-${vehicleId}`, vehicle_id: vehicleId, item_name: "Wheel Spanner", serial_number: "SP-" + Math.floor(100000 + Math.random() * 900000), quantity: 1, condition: "Good", notes: "L-Shaped 21mm", assigned_at: new Date().toISOString(), last_checked_at: new Date().toISOString() }
    ];

    if (isLocalMode) {
      const all = [...equipmentItems, ...defaultPresets];
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(all));
      queryClient.setQueryData(["vehicle-equipment"], all);
      toast({
        title: language === 'en' ? "Inventory Pre-populated" : "Vifaa Vimeongezwa",
        description: language === 'en' ? "Seeded 5 standard safety equipment checklist items for this truck." : "Kifaa 5 vya usalama vimepakiwa kwa gari hili."
      });
    } else {
      // Async database insert
      Promise.all(defaultPresets.map(item => {
        const { id, ...data } = item;
        return supabase.from("vehicle_equipment").insert([data]);
      })).then(() => {
        refetch();
        toast({
          title: language === 'en' ? "Inventory Pre-populated" : "Vifaa Vimeongezwa",
          description: language === 'en' ? "Seeded 5 standard safety equipment checklist items for this truck." : "Kifaa 5 vya usalama vimepakiwa kwa gari hili."
        });
      });
    }
  };

  // Filter equipment for the selected vehicle
  const currentVehicleEquipment = useMemo(() => {
    if (!selectedVehicle) return [];
    return equipmentItems.filter((item: any) => item.vehicle_id === selectedVehicle.id && !item.is_deleted);
  }, [equipmentItems, selectedVehicle]);

  // Compute Vehicle Stats
  const vehicleStats = useMemo(() => {
    const stats: Record<string, { total: number; missing: number; damaged: number; fair: number; good: number }> = {};
    
    // Initialize stats for all vehicles
    vehicles.forEach((v: any) => {
      stats[v.id] = { total: 0, missing: 0, damaged: 0, fair: 0, good: 0 };
    });

    equipmentItems.forEach((item: any) => {
      if (item.is_deleted || !stats[item.vehicle_id]) return;
      const vStat = stats[item.vehicle_id];
      vStat.total += item.quantity;
      if (item.condition === 'Missing') vStat.missing += item.quantity;
      else if (item.condition === 'Damaged') vStat.damaged += item.quantity;
      else if (item.condition === 'Fair') vStat.fair += item.quantity;
      else if (item.condition === 'Good') vStat.good += item.quantity;
    });

    return stats;
  }, [vehicles, equipmentItems]);

  // Auto-fill checklist answers
  useEffect(() => {
    if (isChecklistModalOpen) {
      const init: Record<string, boolean> = {};
      currentVehicleEquipment.forEach((item: any) => {
        init[item.id] = item.condition === "Good" || item.condition === "Fair";
      });
      setChecklistAnswers(init);
    }
  }, [isChecklistModalOpen, currentVehicleEquipment]);

  // Filter vehicles for search combobox
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v: any) =>
      v.plate_number.toLowerCase().includes(vehicleSearchTerm.toLowerCase())
    );
  }, [vehicles, vehicleSearchTerm]);

  // Handle Equipment Assignment
  const handleAssignEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalItemName = presetItem === "Custom" ? customItem : presetItem;
    if (!finalItemName.trim()) return;

    const payload = {
      vehicle_id: selectedVehicle.id,
      item_name: finalItemName.trim(),
      serial_number: serialNumber.trim() || null,
      quantity,
      condition,
      notes: notes.trim() || null,
      assigned_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString()
    };

    if (isLocalMode) {
      const newItem = { id: "local-" + Date.now(), ...payload, is_deleted: false };
      const updated = [newItem, ...equipmentItems];
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(updated));
      queryClient.setQueryData(["vehicle-equipment"], updated);
      toast({ title: "Equipment Assigned", description: `${finalItemName} has been added successfully.` });
      setIsAssignModalOpen(false);
      resetForm();
    } else {
      const { error } = await supabase.from("vehicle_equipment").insert([payload]);
      if (error) {
        toast({ variant: "destructive", title: "Error assigning equipment", description: error.message });
      } else {
        refetch();
        toast({ title: "Equipment Assigned", description: `${finalItemName} has been added successfully.` });
        setIsAssignModalOpen(false);
        resetForm();
      }
    }
  };

  // Quick Verification Present Check
  const handleQuickVerify = async (itemId: string) => {
    const now = new Date().toISOString();
    if (isLocalMode) {
      const updated = equipmentItems.map((item: any) => 
        item.id === itemId ? { ...item, last_checked_at: now, condition: item.condition === "Missing" ? "Good" : item.condition } : item
      );
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(updated));
      queryClient.setQueryData(["vehicle-equipment"], updated);
      toast({ title: "Verified Present", description: "Checked timestamp updated." });
    } else {
      const currentItem = equipmentItems.find((i: any) => i.id === itemId);
      const nextCondition = currentItem?.condition === "Missing" ? "Good" : currentItem?.condition;
      const { error } = await supabase
        .from("vehicle_equipment")
        .update({ last_checked_at: now, condition: nextCondition })
        .eq("id", itemId);
      
      if (error) {
        toast({ variant: "destructive", title: "Verify failed", description: error.message });
      } else {
        refetch();
        toast({ title: "Verified Present", description: "Checked timestamp updated." });
      }
    }
  };

  // Edit Equipment
  const handleEditEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const payload = {
      item_name: presetItem === "Custom" ? customItem : presetItem,
      serial_number: serialNumber.trim() || null,
      quantity,
      condition,
      notes: notes.trim() || null,
      last_checked_at: new Date().toISOString()
    };

    if (isLocalMode) {
      const updated = equipmentItems.map((item: any) => 
        item.id === editingItem.id ? { ...item, ...payload } : item
      );
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(updated));
      queryClient.setQueryData(["vehicle-equipment"], updated);
      toast({ title: "Asset Updated", description: "Changes saved successfully." });
      setIsEditModalOpen(false);
      setEditingItem(null);
      resetForm();
    } else {
      const { error } = await supabase
        .from("vehicle_equipment")
        .update(payload)
        .eq("id", editingItem.id);
      
      if (error) {
        toast({ variant: "destructive", title: "Update failed", description: error.message });
      } else {
        refetch();
        toast({ title: "Asset Updated", description: "Changes saved successfully." });
        setIsEditModalOpen(false);
        setEditingItem(null);
        resetForm();
      }
    }
  };

  // Change individual condition from row dropdown
  const handleUpdateCondition = async (itemId: string, newCond: "Good" | "Fair" | "Damaged" | "Missing") => {
    const now = new Date().toISOString();
    if (isLocalMode) {
      const updated = equipmentItems.map((item: any) => 
        item.id === itemId ? { ...item, condition: newCond, last_checked_at: now } : item
      );
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(updated));
      queryClient.setQueryData(["vehicle-equipment"], updated);
      toast({ title: "Condition Updated", description: `Marked as ${newCond}.` });
    } else {
      const { error } = await supabase
        .from("vehicle_equipment")
        .update({ condition: newCond, last_checked_at: now })
        .eq("id", itemId);
      
      if (error) {
        toast({ variant: "destructive", title: "Failed to update condition", description: error.message });
      } else {
        refetch();
        toast({ title: "Condition Updated", description: `Marked as ${newCond}.` });
      }
    }
  };

  // Delete/Remove Equipment
  const handleDeleteEquipment = async (itemId: string) => {
    if (!confirm("Are you sure you want to remove this item from the vehicle?")) return;

    if (isLocalMode) {
      const updated = equipmentItems.map((item: any) => 
        item.id === itemId ? { ...item, is_deleted: true, deleted_at: new Date().toISOString() } : item
      );
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(updated));
      queryClient.setQueryData(["vehicle-equipment"], updated);
      toast({ title: "Asset Removed", description: "Item has been removed from vehicle registry." });
    } else {
      const { error } = await supabase
        .from("vehicle_equipment")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", itemId);
      
      if (error) {
        toast({ variant: "destructive", title: "Deletion failed", description: error.message });
      } else {
        refetch();
        toast({ title: "Asset Removed", description: "Item has been removed from vehicle registry." });
      }
    }
  };

  // Pre-Departure checklist signoff
  const handlePreDepartureSignoff = async () => {
    const uncheckedItems = currentVehicleEquipment.filter((item: any) => !checklistAnswers[item.id]);
    
    // Construct check logs
    const logDetails = currentVehicleEquipment.map((item: any) => {
      return `${item.item_name} (${checklistAnswers[item.id] ? "Present" : "Missing/Not Verified"})`;
    }).join(", ");

    // Write audit log entry
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.email || "Garage Operator";
      await supabase.from("activity_logs").insert([{
        user_id: user?.id || null,
        action: `Vehicle Pre-Departure Verified: ${selectedVehicle.plate_number}`,
        details: `Verified by ${userName}. Status checklist: ${logDetails}. ${uncheckedItems.length} items flagged.`,
        created_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.warn("Failed to write activity logs:", e);
    }

    // Update conditions in batch
    const now = new Date().toISOString();
    const updatedItems = equipmentItems.map((item: any) => {
      if (item.vehicle_id !== selectedVehicle.id || item.is_deleted) return item;
      const isChecked = checklistAnswers[item.id];
      return {
        ...item,
        last_checked_at: now,
        condition: isChecked ? (item.condition === 'Missing' ? 'Good' : item.condition) : 'Missing'
      };
    });

    if (isLocalMode) {
      localStorage.setItem("local_vehicle_equipment", JSON.stringify(updatedItems));
      queryClient.setQueryData(["vehicle-equipment"], updatedItems);
    } else {
      // Direct updates
      await Promise.all(currentVehicleEquipment.map((item: any) => {
        const isChecked = checklistAnswers[item.id];
        return supabase.from("vehicle_equipment")
          .update({
            last_checked_at: now,
            condition: isChecked ? (item.condition === 'Missing' ? 'Good' : item.condition) : 'Missing'
          })
          .eq("id", item.id);
      }));
      refetch();
    }

    toast({
      title: language === 'en' ? "Departure Authorized!" : "Uondoshaji Umeidhinishwa!",
      description: language === 'en' ? `Pre-Departure check verified for ${selectedVehicle.plate_number}.` : `Uhakiki wa uondoshaji umekamilika kwa ${selectedVehicle.plate_number}.`,
      variant: "default"
    });
    setIsChecklistModalOpen(false);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    if (["Spare Tyre", "Fire Extinguisher 9kg", "Reflector Triangle (Pair)", "Mechanical Jack", "Wheel Spanner", "First Aid Kit", "Tool Box", "Wheel Chooks (Vigingi)", "Presure Gauge (Kipimia Upepo)", "Belts (Mikanda ya Mzigo)", "Tarpaulin (Turubai) 40Ft", "Chains & Binder", "Air Pipes (Mpira wa Upepo)"].includes(item.item_name)) {
      setPresetItem(item.item_name);
      setCustomItem("");
    } else {
      setPresetItem("Custom");
      setCustomItem(item.item_name);
    }
    setSerialNumber(item.serial_number || "");
    setQuantity(item.quantity);
    setCondition(item.condition);
    setNotes(item.notes || "");
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setPresetItem("Spare Tyre");
    setCustomItem("");
    setSerialNumber("");
    setQuantity(1);
    setCondition("Good");
    setNotes("");
  };

  // UI Helpers
  const getConditionBadge = (cond: "Good" | "Fair" | "Damaged" | "Missing") => {
    switch (cond) {
      case "Good":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">Good</Badge>;
      case "Fair":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-100">Fair</Badge>;
      case "Damaged":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">Damaged</Badge>;
      case "Missing":
        return <Badge className="bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-100">Missing</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-slate-600" />
            {language === 'en' ? 'Vehicle Assigned Equipment' : 'Vifaa Vilivyokabidhiwa kwa Gari'}
          </h1>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.1em]">
            {language === 'en' ? 'Audit and Track on-board safety toolkits & travel assets' : 'Kagua na kufuatilia vifaa vya usalama vya gari'}
          </p>
        </div>

        {/* Sync / Mode badge */}
        <div className="flex items-center gap-2">
          {isLocalMode && (
            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 animate-pulse text-[10px] py-1 px-2.5 font-semibold">
              ⚠️ Local Testing Mode (Database Connected but Mocking)
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="h-9 text-xs font-semibold bg-white text-slate-600 flex items-center gap-1.5 border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Records
          </Button>
        </div>
      </div>

      {/* Main Vehicle Lookup and Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Lookup Column */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-none shadow-md bg-white">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                {language === 'en' ? 'Select Vehicle' : 'Chagua Gari'}
              </CardTitle>
              <CardDescription className="text-[11px]">
                {language === 'en' ? 'Quickly search plate number to view equipment' : 'Tafuta namba ya gari kuona vifaa vyake'}
              </CardDescription>
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
                            {vehicleStats[v.id]?.total > 0 && (
                              <Badge className="bg-slate-100 text-slate-600 text-[9px] hover:bg-slate-100">
                                {vehicleStats[v.id].total} items
                              </Badge>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Quick Preset Selector List if no vehicle is active */}
              {!selectedVehicle && (
                <div className="mt-6 space-y-3">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    {language === 'en' ? 'Active Fleet Checklist Overview' : 'Muhtasari wa Magari'}
                  </Label>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {vehicles.slice(0, 8).map((v: any) => {
                      const stats = vehicleStats[v.id] || { total: 0, missing: 0, damaged: 0 };
                      return (
                        <div 
                          key={v.id} 
                          onClick={() => setSelectedVehicle(v)}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-all group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700 text-xs group-hover:text-indigo-600 transition-colors">{v.plate_number}</span>
                            <span className="text-[9px] text-slate-400 capitalize">{v.asset_type || "Truck"}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            {stats.total > 0 ? (
                              <>
                                <Badge variant="outline" className="text-[9px] bg-slate-50 border-slate-200">
                                  {stats.total} total
                                </Badge>
                                {stats.missing > 0 && (
                                  <Badge className="bg-rose-50 text-rose-600 border-rose-200 text-[9px]">
                                    {stats.missing} missing
                                  </Badge>
                                )}
                                {stats.damaged > 0 && (
                                  <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-[9px]">
                                    {stats.damaged} damaged
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] italic text-slate-400 font-medium">No items assigned</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Dashboard Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {selectedVehicle ? (
            <div className="space-y-6">
              
              {/* Selected Vehicle Information Card */}
              <Card className="border-none shadow-md bg-white overflow-hidden relative">
                {/* Decorative border bar based on vehicle status */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-700" />
                
                <CardHeader className="pb-4 pt-5 px-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 pl-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold tracking-tight text-slate-800">{selectedVehicle.plate_number}</span>
                      <Badge className="bg-slate-100 text-slate-700 uppercase tracking-widest text-[9px] border hover:bg-slate-100">
                        {selectedVehicle.asset_type || "Heavy Truck"}
                      </Badge>
                      <Badge className={`uppercase text-[9px] tracking-widest py-0.5 ${
                        selectedVehicle.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        'bg-amber-50 text-amber-600 border border-amber-200'
                      }`}>
                        {selectedVehicle.status || 'Active'}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {language === 'en' ? 'Manage safety toolkits, spare wheels, and checklist verification.' : 'Simamia vifaa vya dharura, matairi ya ziada na kagua kadi za usalama.'}
                    </CardDescription>
                  </div>

                  {/* Top quick-action buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setIsChecklistModalOpen(true)}
                      disabled={currentVehicleEquipment.length === 0}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Pre-Departure Check
                    </Button>
                    
                    <Button
                      size="sm"
                      onClick={() => {
                        resetForm();
                        setIsAssignModalOpen(true);
                      }}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs h-9 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Assign Item
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0">
                  {/* Detailed Stats strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 border-b text-center divide-x bg-slate-50/20">
                    <div className="py-3.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items Assigned</p>
                      <p className="text-lg font-bold text-slate-700 mt-0.5">{vehicleStats[selectedVehicle.id]?.total || 0}</p>
                    </div>
                    <div className="py-3.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Good / Fair</p>
                      <p className="text-lg font-bold text-emerald-600 mt-0.5">
                        {(vehicleStats[selectedVehicle.id]?.good || 0) + (vehicleStats[selectedVehicle.id]?.fair || 0)}
                      </p>
                    </div>
                    <div className="py-3.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Damaged Items</p>
                      <p className="text-lg font-bold text-amber-600 mt-0.5">{vehicleStats[selectedVehicle.id]?.damaged || 0}</p>
                    </div>
                    <div className="py-3.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Missing Items</p>
                      <p className="text-lg font-bold text-rose-600 mt-0.5">{vehicleStats[selectedVehicle.id]?.missing || 0}</p>
                    </div>
                  </div>

                  {/* Assigned Equipment table */}
                  {currentVehicleEquipment.length > 0 ? (
                    <Table>
                      <TableHeader className="bg-slate-50/40 border-b">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[180px]">Item</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[120px]">Serial / ID</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[80px] text-center">Qty</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[110px]">Condition</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[130px]">Last Checked</TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[150px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentVehicleEquipment.map((item: any) => (
                          <TableRow key={item.id} className="hover:bg-slate-50/40 border-b border-slate-100 last:border-none transition-colors">
                            <TableCell className="py-3 font-semibold text-slate-700 text-xs">
                              <div className="flex flex-col">
                                <span>{item.item_name}</span>
                                {item.notes && <span className="text-[10px] text-slate-400 font-normal italic mt-0.5">{item.notes}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 font-mono text-[11px] text-slate-500">
                              {item.serial_number || "—"}
                            </TableCell>
                            <TableCell className="py-3 text-center text-xs font-semibold text-slate-600">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="py-3">
                              <Select
                                value={item.condition}
                                onValueChange={(val: any) => handleUpdateCondition(item.id, val)}
                              >
                                <SelectTrigger className="h-7 w-[100px] text-[11px] font-bold border-none bg-transparent hover:bg-slate-50 p-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Good" className="text-xs text-emerald-600 font-semibold">Good</SelectItem>
                                  <SelectItem value="Fair" className="text-xs text-blue-600 font-semibold">Fair</SelectItem>
                                  <SelectItem value="Damaged" className="text-xs text-amber-600 font-semibold">Damaged</SelectItem>
                                  <SelectItem value="Missing" className="text-xs text-rose-600 font-semibold">Missing</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-3 text-[11px] text-slate-500">
                              <div className="flex flex-col">
                                <span>{item.last_checked_at ? new Date(item.last_checked_at).toLocaleDateString() : 'N/A'}</span>
                                <span className="text-[9px] text-slate-400">{item.last_checked_at ? new Date(item.last_checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleQuickVerify(item.id)}
                                  title="Verify present on-board"
                                  className="w-8 h-8 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditModal(item)}
                                  title="Edit details"
                                  className="w-8 h-8 rounded-full text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteEquipment(item.id)}
                                  title="Remove item"
                                  className="w-8 h-8 rounded-full text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-12 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto border">
                        <AlertTriangle className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-700">No Equipment Tracked Yet</p>
                        <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                          There are no on-board safety tools or items currently registered for this truck. Add standard defaults or input custom assets.
                        </p>
                      </div>
                      <div className="pt-2 flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => seedDefaultEquipment(selectedVehicle.id)}
                          className="bg-indigo-550 border-indigo-200 text-indigo-600 border bg-indigo-50 hover:bg-indigo-100 font-semibold text-[11px] uppercase tracking-wider"
                        >
                          Auto-populate Standard Safety Toolkit
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          ) : (
            <Card className="border-2 border-dashed border-slate-200 p-12 text-center bg-slate-50/20 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <ClipboardCheck className="w-7 h-7 text-slate-400" />
              </div>
              <h2 className="text-base font-bold text-slate-700">No Vehicle Selected</h2>
              <p className="text-xs text-slate-400 max-w-sm mt-1.5">
                Search or select a vehicle plate from the sidebar lookup tool to view, audit, and sign off on on-board toolkits.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-500 animate-bounce" />
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Select a truck to start inspection</span>
              </div>
            </Card>
          )}

        </div>
      </div>

      {/* dialog 1: Assign Equipment Modal */}
      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-tight text-sm">
              <Plus className="w-4.5 h-4.5 text-indigo-500" />
              {language === 'en' ? 'Assign On-Board Item' : 'Kabidhi Kifaa cha Gari'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {language === 'en' ? 'Add standard security toolkit items or enter a custom equipment item.' : 'Ongeza vifaa kwenye stoo ya usalama ya gari.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignEquipment} className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item Category</Label>
              <Select value={presetItem} onValueChange={setPresetItem}>
                <SelectTrigger className="h-9 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Spare Tyre">Spare Tyre</SelectItem>
                  <SelectItem value="Fire Extinguisher 9kg">Fire Extinguisher 9kg</SelectItem>
                  <SelectItem value="Reflector Triangle (Pair)">Reflector Triangle (Pair)</SelectItem>
                  <SelectItem value="Mechanical Jack">Mechanical Jack</SelectItem>
                  <SelectItem value="Wheel Spanner">Wheel Spanner</SelectItem>
                  <SelectItem value="First Aid Kit">First Aid Kit</SelectItem>
                  <SelectItem value="Tool Box">Tool Box</SelectItem>
                  <SelectItem value="Wheel Chooks (Vigingi)">Wheel Chooks (Vigingi)</SelectItem>
                  <SelectItem value="Presure Gauge (Kipimia Upepo)">Presure Gauge (Kipimia Upepo)</SelectItem>
                  <SelectItem value="Belts (Mikanda ya Mzigo)">Belts (Mikanda ya Mzigo)</SelectItem>
                  <SelectItem value="Tarpaulin (Turubai) 40Ft">Tarpaulin (Turubai) 40Ft</SelectItem>
                  <SelectItem value="Chains & Binder">Chains & Binder</SelectItem>
                  <SelectItem value="Air Pipes (Mpira wa Upepo)">Air Pipes (Mpira wa Upepo)</SelectItem>
                  <SelectItem value="Custom">Custom / Other Item</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {presetItem === "Custom" && (
              <div className="space-y-1.5 animate-fadeIn">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custom Item Name</Label>
                <Input 
                  required
                  placeholder="Enter item description..."
                  value={customItem}
                  onChange={(e) => setCustomItem(e.target.value)}
                  className="h-9 border-slate-200 bg-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Serial Number / Asset ID</Label>
                <Input 
                  placeholder="e.g. SN-88293"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="h-9 border-slate-200 bg-white font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quantity</Label>
                <Input 
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="h-9 border-slate-200 bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Initial Condition</Label>
              <Select value={condition} onValueChange={(val: any) => setCondition(val)}>
                <SelectTrigger className="h-9 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Good">Good Condition (Operational)</SelectItem>
                  <SelectItem value="Fair">Fair / Worn (Operational)</SelectItem>
                  <SelectItem value="Damaged">Damaged (Requires Action)</SelectItem>
                  <SelectItem value="Missing">Missing from Vehicle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</Label>
              <Textarea 
                placeholder="Optional assignment comments or conditions details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px] max-h-[100px] border-slate-200 bg-white text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsAssignModalOpen(false)}
                className="h-9 text-xs font-semibold uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="h-9 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white uppercase tracking-wider"
              >
                Assign Asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* dialog 2: Edit Equipment Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-tight text-sm">
              <Edit3 className="w-4 h-4 text-indigo-500" />
              Edit On-Board Item
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditEquipment} className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item Category</Label>
              <Select value={presetItem} onValueChange={setPresetItem}>
                <SelectTrigger className="h-9 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Spare Tyre">Spare Tyre</SelectItem>
                  <SelectItem value="Fire Extinguisher 9kg">Fire Extinguisher 9kg</SelectItem>
                  <SelectItem value="Reflector Triangle (Pair)">Reflector Triangle (Pair)</SelectItem>
                  <SelectItem value="Mechanical Jack">Mechanical Jack</SelectItem>
                  <SelectItem value="Wheel Spanner">Wheel Spanner</SelectItem>
                  <SelectItem value="First Aid Kit">First Aid Kit</SelectItem>
                  <SelectItem value="Tool Box">Tool Box</SelectItem>
                  <SelectItem value="Wheel Chooks (Vigingi)">Wheel Chooks (Vigingi)</SelectItem>
                  <SelectItem value="Presure Gauge (Kipimia Upepo)">Presure Gauge (Kipimia Upepo)</SelectItem>
                  <SelectItem value="Belts (Mikanda ya Mzigo)">Belts (Mikanda ya Mzigo)</SelectItem>
                  <SelectItem value="Tarpaulin (Turubai) 40Ft">Tarpaulin (Turubai) 40Ft</SelectItem>
                  <SelectItem value="Chains & Binder">Chains & Binder</SelectItem>
                  <SelectItem value="Air Pipes (Mpira wa Upepo)">Air Pipes (Mpira wa Upepo)</SelectItem>
                  <SelectItem value="Custom">Custom / Other Item</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {presetItem === "Custom" && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custom Item Name</Label>
                <Input 
                  required
                  placeholder="Enter item description..."
                  value={customItem}
                  onChange={(e) => setCustomItem(e.target.value)}
                  className="h-9 border-slate-200 bg-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Serial Number / Asset ID</Label>
                <Input 
                  placeholder="e.g. SN-88293"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="h-9 border-slate-200 bg-white font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quantity</Label>
                <Input 
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="h-9 border-slate-200 bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Condition</Label>
              <Select value={condition} onValueChange={(val: any) => setCondition(val)}>
                <SelectTrigger className="h-9 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Good">Good Condition (Operational)</SelectItem>
                  <SelectItem value="Fair">Fair / Worn (Operational)</SelectItem>
                  <SelectItem value="Damaged">Damaged (Requires Action)</SelectItem>
                  <SelectItem value="Missing">Missing from Vehicle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</Label>
              <Textarea 
                placeholder="Comments..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px] max-h-[100px] border-slate-200 bg-white text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditModalOpen(false)}
                className="h-9 text-xs font-semibold uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="h-9 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white uppercase tracking-wider"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* dialog 3: Pre-Departure Checklist Modal */}
      <Dialog open={isChecklistModalOpen} onOpenChange={setIsChecklistModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white border-none shadow-2xl">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-tight text-sm">
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              {language === 'en' ? 'Pre-Departure Safety Checklist' : 'Kadi ya Usalama ya Uondoshaji'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {language === 'en' 
                ? `Verify that all on-board equipment is physically present in vehicle ${selectedVehicle?.plate_number} before departure.`
                : `Hakiki kuwa vifaa vyote vipo kwenye gari ${selectedVehicle?.plate_number} kabla ya safari.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3 max-h-[300px] overflow-y-auto pr-1">
            
            {/* Warning if any items are previously marked as damaged or missing */}
            {currentVehicleEquipment.some((i: any) => i.condition === 'Damaged' || i.condition === 'Missing') && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 leading-relaxed font-semibold">
                  Attention: Some items were flagged as damaged or missing in the last check. Ensure replacements have been provided.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {currentVehicleEquipment.map((item: any) => (
                <div 
                  key={item.id}
                  onClick={() => {
                    setChecklistAnswers({
                      ...checklistAnswers,
                      [item.id]: !checklistAnswers[item.id]
                    });
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:bg-slate-50 ${
                    checklistAnswers[item.id] 
                      ? 'border-emerald-200 bg-emerald-50/10' 
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center mt-0.5 transition-all ${
                      checklistAnswers[item.id] 
                        ? 'bg-emerald-600 border-emerald-600 text-white' 
                        : 'border-slate-300 text-transparent'
                    }`}>
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700">{item.item_name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Qty: {item.quantity} {item.serial_number ? `| SN: ${item.serial_number}` : ''}
                      </span>
                    </div>
                  </div>

                  <div>
                    {checklistAnswers[item.id] ? (
                      <Badge className="bg-emerald-100 text-emerald-700 text-[9px] hover:bg-emerald-100">Present</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px]">Missing</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="border-t pt-3 flex sm:items-center sm:justify-between">
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              Logs verified on digital audit trail.
            </div>
            
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsChecklistModalOpen(false)}
                className="h-9 text-xs font-semibold uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handlePreDepartureSignoff}
                className="h-9 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white uppercase tracking-wider"
              >
                Authorize Departure
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
