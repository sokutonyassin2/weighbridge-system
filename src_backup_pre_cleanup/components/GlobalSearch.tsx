import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Plus, History as HistoryIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getShortEntryId } from "@/lib/utils";
import { format } from "date-fns";

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchVehicles = async () => {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        let query = supabase
          .from("vehicle_entries")
          .select(`
            *,
            vehicle_types (type_name)
          `)
          .order("entry_time", { ascending: false })
          .limit(10);

        // Search by WB number (e.g., WB-123)
        if (searchQuery.startsWith("WB-")) {
          const wbNumber = searchQuery.replace("WB-", "");
          if (!isNaN(Number(wbNumber))) {
            query = query.eq("wb_number", Number(wbNumber));
          }
        } else {
          // Search by vehicle number
          query = query.ilike("vehicle_no", `%${searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        setResults(data || []);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchVehicles, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelect = (entry: any) => {
    setOpen(false);
    setSearchQuery("");
    navigate(`/weigh/${entry.id}`);
  };

  const handleNewEntry = (vehicleNo: string) => {
    setOpen(false);
    setSearchQuery("");
    navigate(`/entry?prefill=${encodeURIComponent(vehicleNo)}`);
  };

  const handleViewHistory = (vehicleNo: string) => {
    setOpen(false);
    setSearchQuery("");
    navigate(`/vehicle-history?search=${encodeURIComponent(vehicleNo)}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-64 justify-start text-left font-normal">
          <Search className="mr-2 h-4 w-4" />
          <span className="text-muted-foreground">Search by Entry ID or Vehicle...</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type WB-123 or vehicle number..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {searchQuery.length < 2 ? (
              <CommandEmpty>Type at least 2 characters to search</CommandEmpty>
            ) : loading ? (
              <CommandEmpty>Searching...</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>
                <div className="space-y-2">
                  <p>No entries found</p>
                  {searchQuery.length >= 2 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleNewEntry(searchQuery)}
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Entry for "{searchQuery.toUpperCase()}"
                    </Button>
                  )}
                </div>
              </CommandEmpty>
            ) : (
              <CommandGroup heading="Search Results">
                {results.slice(0, 1).map((entry) => (
                  <div key={entry.id} className="p-2 space-y-2">
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{entry.vehicle_no}</span>
                        <span className="text-xs text-muted-foreground">
                          {getShortEntryId(entry.id, entry.wb_number)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.vehicle_types?.type_name} • {format(new Date(entry.entry_time), "MMM dd, HH:mm")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewHistory(entry.vehicle_no)}
                        className="flex-1"
                      >
                        <HistoryIcon className="mr-2 h-4 w-4" />
                        View History
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleNewEntry(entry.vehicle_no)}
                        className="flex-1"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Entry
                      </Button>
                    </div>
                  </div>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
