import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase as sb } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Truck, Package, Calendar, Wrench, Search, Filter } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';

const ReplacedVehicleParts = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Fetch all closed requisitions for vehicles
    const { data: replacedParts, isLoading } = useQuery({
        queryKey: ["replaced-vehicle-parts"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(id, vehicle_no, horse_number)
                `)
                .eq("status", "Closed")
                .not("vehicle_id", "is", null)
                .order("status_updated_at", { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    // Filter and group parts by vehicle
    const groupedParts = useMemo(() => {
        if (!replacedParts) return {};
        
        let filteredParts = replacedParts;

        // Apply Search Filter (Plate number, item name)
        if (searchTerm.trim() !== '') {
            const lowerSearch = searchTerm.toLowerCase();
            filteredParts = filteredParts.filter(part => {
                const vehicle = part.vehicle;
                const plateNo = (vehicle?.vehicle_no || vehicle?.horse_number || `Vehicle ID: ${vehicle?.id}`).toLowerCase();
                const itemName = (part.item_name || '').toLowerCase();
                return plateNo.includes(lowerSearch) || itemName.includes(lowerSearch);
            });
        }

        // Apply Date Filter
        if (dateFrom) {
            filteredParts = filteredParts.filter(part => {
                if (!part.status_updated_at) return false;
                return new Date(part.status_updated_at) >= new Date(dateFrom);
            });
        }
        if (dateTo) {
            filteredParts = filteredParts.filter(part => {
                if (!part.status_updated_at) return false;
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                return new Date(part.status_updated_at) <= toDate;
            });
        }
        
        return filteredParts.reduce((acc, part) => {
            const vehicle = part.vehicle;
            if (!vehicle) return acc;
            
            const vehicleIdentifier = vehicle.vehicle_no || vehicle.horse_number || `Vehicle ID: ${vehicle.id}`;
            
            if (!acc[vehicleIdentifier]) {
                acc[vehicleIdentifier] = [];
            }
            acc[vehicleIdentifier].push(part);
            return acc;
        }, {} as Record<string, any[]>);
    }, [replacedParts, searchTerm, dateFrom, dateTo]);

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const vehicleKeys = Object.keys(groupedParts);

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-3">
                        <Wrench className="h-8 w-8 text-emerald-600" />
                        Replaced Vehicle Parts
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        View old items that were removed and replaced per vehicle.
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-2 text-sm bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">
                    <Truck className="w-4 h-4 mr-2" />
                    Total Vehicles: {vehicleKeys.length}
                </Badge>
            </div>

            {/* Filters Section */}
            <Card className="mb-6 border-border/50 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                <Search className="w-4 h-4" /> Search
                            </label>
                            <Input 
                                placeholder="Search by plate number or item name..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="max-w-md"
                            />
                        </div>
                        <div className="w-full md:w-auto space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                <Filter className="w-4 h-4" /> From Date
                            </label>
                            <Input 
                                type="date" 
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div className="w-full md:w-auto space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                <Filter className="w-4 h-4" /> To Date
                            </label>
                            <Input 
                                type="date" 
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {vehicleKeys.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                        <Package className="h-12 w-12 text-muted-foreground mb-4" />
                        <CardTitle className="text-xl mb-2">No replaced parts found</CardTitle>
                        <CardDescription>
                            There are currently no closed requisitions for vehicle parts.
                        </CardDescription>
                    </CardContent>
                </Card>
            ) : (
                <Accordion type="multiple" className="space-y-4">
                    {vehicleKeys.map((vehicleId) => {
                        const parts = groupedParts[vehicleId];
                        const totalSpent = parts.reduce((sum, part) => sum + (part.total_price || 0), 0);

                        return (
                            <AccordionItem value={vehicleId} key={vehicleId} className="border rounded-lg bg-card shadow-sm px-4">
                                <AccordionTrigger className="hover:no-underline py-4">
                                    <div className="flex items-center justify-between w-full pr-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 rounded-full">
                                                <Truck className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex flex-col items-start">
                                                <span className="font-semibold text-lg">{vehicleId}</span>
                                                <span className="text-sm text-muted-foreground">
                                                    {parts.length} replaced {parts.length === 1 ? 'item' : 'items'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
                                            <p className="font-semibold text-emerald-600">{totalSpent.toLocaleString()} TShs</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="pt-4 pb-2">
                                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                            {parts.map((part) => (
                                                <Card key={part.id} className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors shadow-sm">
                                                    <div className="bg-muted/30 p-3 border-b flex justify-between items-center">
                                                        <Badge variant="secondary" className="font-mono text-xs">
                                                            {part.id ? `REQ-${part.id.substring(0, 8).toUpperCase()}` : 'REQ-UNKNOWN'}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {part.status_updated_at ? format(new Date(part.status_updated_at), 'dd MMM yyyy') : 'Unknown Date'}
                                                        </span>
                                                    </div>
                                                    <CardContent className="p-4 space-y-3">
                                                        <div>
                                                            <h4 className="font-medium text-base truncate" title={part.item_name || 'Unnamed Item'}>
                                                                {part.item_name || 'Unnamed Item'}
                                                            </h4>
                                                            <p className="text-sm text-muted-foreground">
                                                                Qty: {part.quantity_approved || part.quantity_requested || '-'}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
                                                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md flex items-center">
                                                                {(part.total_price || 0).toLocaleString()} TShs
                                                            </span>
                                                            <Badge variant="outline" className="text-[10px]">
                                                                Replaced
                                                            </Badge>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
        </div>
    );
};

export default ReplacedVehicleParts;
