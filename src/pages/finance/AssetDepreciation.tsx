import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingDown, Truck, Info, Settings } from "lucide-react";

export default function AssetDepreciation() {
  const { data: fleet, isLoading } = useQuery({
    queryKey: ["logistics-fleet-depreciation"],
    queryFn: async () => {
      const { data, error } = await supabase.from("logistics_fleet").select("*").eq("status", "Active");
      if (error) throw error;
      return data;
    }
  });

  const calculateDepreciation = (vehicle: any) => {
    // Mock logic for demonstration: assume an initial value of 150,000,000 TShs and 10% depreciation per year since created_at
    const initialValue = 150000000;
    const yearCreated = new Date(vehicle.created_at || Date.now()).getFullYear();
    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - yearCreated);
    
    // Straight line depreciation 10% per year, max 90%
    const depreciationRate = Math.min(age * 0.1, 0.9); 
    const currentValue = initialValue * (1 - depreciationRate);
    
    return {
      initialValue,
      age,
      currentValue
    };
  };

  const fmtTZS = (v: number) => `TShs ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <TrendingDown className="w-8 h-8 text-amber-600" />
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Asset Depreciation</h1>
          <p className="text-slate-500">Track the current depreciated value of your active fleet</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 shadow-sm border-amber-100">
          <CardHeader className="bg-white border-b">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-500" /> Fleet Valuation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Vehicle Plate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Age (Years)</TableHead>
                  <TableHead>Est. Initial Value</TableHead>
                  <TableHead>Current Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading fleet...</TableCell></TableRow>
                ) : fleet?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">No active vehicles found.</TableCell></TableRow>
                ) : (
                  fleet?.map((vehicle) => {
                    const stats = calculateDepreciation(vehicle);
                    return (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-bold text-slate-800">{vehicle.vehicle_no || vehicle.horse_number}</TableCell>
                        <TableCell className="capitalize">{vehicle.vehicle_type}</TableCell>
                        <TableCell>{stats.age}</TableCell>
                        <TableCell className="text-slate-500">{fmtTZS(stats.initialValue)}</TableCell>
                        <TableCell className="font-bold text-amber-700">{fmtTZS(stats.currentValue)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-amber-100 h-fit">
          <CardHeader className="bg-white border-b">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Info className="w-5 h-5 text-amber-500" /> Depreciation Policy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4 text-sm text-slate-600">
            <p>
              By default, this module uses a **10% straight-line depreciation** model based on an estimated starting value of TShs 150M per truck.
            </p>
            <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
              In a future update, you will be able to input the exact purchase price and date for each asset directly.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
