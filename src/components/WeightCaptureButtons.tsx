import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Scale, AlertCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import HardwareWebSocket from "@/lib/hardwareWebSocket";

interface WeightCaptureButtonsProps {
  onCaptureGross: (weight: string) => void;
  onCaptureTare: (weight: string) => void;
  onCaptureGVM?: (weight: string) => void;
  onCaptureGTM?: (weight: string) => void;
  onCaptureTrailer?: (weight: string) => void;
  showGVMFields?: boolean;
  disabled?: boolean;
  vehicleNo?: string;
  entryId?: string;
}

interface WeightSettings {
  automaticMode: boolean;
  hardwareIntegrationEnabled: boolean;
  hardwareBridgeUrl: string;
}

export function WeightCaptureButtons({
  onCaptureGross,
  onCaptureTare,
  onCaptureGVM,
  onCaptureGTM,
  onCaptureTrailer,
  showGVMFields = false,
  disabled = false,
  vehicleNo,
  entryId,
}: WeightCaptureButtonsProps) {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [isCapturing, setIsCapturing] = useState<string | null>(null);
  const [hardwareStatus, setHardwareStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'error'>('disconnected');
  const [liveWeight, setLiveWeight] = useState<string>("0");
  const [settings, setSettings] = useState<WeightSettings>({
    automaticMode: false,
    hardwareIntegrationEnabled: false,
    hardwareBridgeUrl: "http://localhost:5000",
  });

  const hardwareWebSocket = new HardwareWebSocket(settings.hardwareBridgeUrl);

  const isAdmin = userRole === "admin";

  useEffect(() => {
    const saved = localStorage.getItem("weightCaptureSettings");
    if (saved) {
      const parsed = JSON.parse(saved);
      setSettings({
        automaticMode: parsed.automaticMode ?? false,
        hardwareIntegrationEnabled: parsed.hardwareIntegrationEnabled ?? false,
        hardwareBridgeUrl: parsed.hardwareBridgeUrl ?? "http://localhost:5000",
      });
    }
  }, []);

  // Initialize hardware connection when settings change
  useEffect(() => {
    if (!settings.hardwareIntegrationEnabled || !vehicleNo || !entryId) return;

    const connectToHardware = async () => {
      setHardwareStatus('connecting');
      try {
        await hardwareWebSocket.connect();
        setHardwareStatus('connected');

        // Listen for internal weight results (Capture)
        const handleWeightUpdate = (event: any) => {
          const { detail } = event;
          if (detail.entryId === entryId && detail.vehicleNo === vehicleNo) {
            switch (detail.type) {
              case 'gross':
                onCaptureGross(detail.weight.toString());
                break;
              case 'tare':
                onCaptureTare(detail.weight.toString());
                break;
              case 'gvm':
                onCaptureGVM?.(detail.weight.toString());
                break;
              case 'gtm':
                onCaptureGTM?.(detail.weight.toString());
                break;
              case 'trailer':
                onCaptureTrailer?.(detail.weight.toString());
                break;
            }
          }
        };

        // Listen for LIVE streaming updates
        const handleLiveUpdate = (event: any) => {
          const { detail } = event;
          if (detail && detail.weight !== undefined) {
            setLiveWeight(detail.weight.toString());
          }
        };

        window.addEventListener('weightUpdate', handleWeightUpdate);
        window.addEventListener('liveWeightUpdate', handleLiveUpdate);

        // Cleanup function
        return () => {
          window.removeEventListener('weightUpdate', handleWeightUpdate);
          window.removeEventListener('liveWeightUpdate', handleLiveUpdate);
          hardwareWebSocket.disconnect();
        };
      } catch (error) {
        console.error('Failed to connect to hardware:', error);
        setHardwareStatus('error');
      }
    };

    connectToHardware();

    // Clean up on unmount
    return () => {
      hardwareWebSocket.disconnect();
    };
  }, [settings.hardwareIntegrationEnabled, settings.hardwareBridgeUrl, vehicleNo, entryId,
    onCaptureGross, onCaptureTare, onCaptureGVM, onCaptureGTM, onCaptureTrailer]);

  const captureWeight = async (type: 'gross' | 'tare' | 'gvm' | 'gtm' | 'trailer') => {
    if (!vehicleNo || !entryId) {
      toast({
        variant: "destructive",
        title: "No Active Vehicle",
        description: "Enter a vehicle first to enable weight capture.",
      });
      return;
    }

    setIsCapturing(type);

    try {
      // Fetch weight from the server which will proxy to your helper program
      const response = await fetch(`${settings.hardwareBridgeUrl}/api/hardware/weight?entryId=${entryId}&vehicleNo=${vehicleNo}&type=${type}`, {
        method: "GET",
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get weight from hardware");
      }

      const data = await response.json();
      const weight = String(data.weight);

      if (weight && !isNaN(parseFloat(weight))) {
        switch (type) {
          case 'gross':
            onCaptureGross(weight);
            break;
          case 'tare':
            onCaptureTare(weight);
            break;
          case 'gvm':
            onCaptureGVM?.(weight);
            break;
          case 'gtm':
            onCaptureGTM?.(weight);
            break;
          case 'trailer':
            onCaptureTrailer?.(weight);
            break;
        }

        toast({
          title: "Weight Captured",
          description: `${type.toUpperCase()}: ${weight} kg`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "No Weight Data",
          description: "Could not read weight from indicator. Check hardware connection.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Capture Error",
        description: error.message || "Failed to capture weight. Make sure the helper program is running.",
      });
    } finally {
      setIsCapturing(null);
    }
  };

  const isLocked = !vehicleNo || !entryId;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        {isLocked ? (
          <>
            <AlertCircle className="h-3 w-3 text-destructive" />
            <span className="text-destructive">Weight capture locked - No active vehicle</span>
          </>
        ) : (
          <>
            <Scale className="h-3 w-3 text-success" />
            <span className="text-success">Ready to capture for {vehicleNo}</span>
          </>
        )}
      </div>

      {/* DIGITAL WEIGHT MONITOR */}
      {!isLocked && (
        <div className="bg-slate-950 border-2 border-slate-800 rounded-lg p-4 my-2 text-center shadow-[0_0_20px_rgba(0,0,0,0.5)]">
          <div className="text-[10px] text-emerald-500/40 font-mono uppercase tracking-[0.3em] mb-3">
            Digital Scale Monitor
          </div>
          <div className="flex items-center justify-center gap-1.5">
            {liveWeight.padStart(6, '0').split('').map((digit, idx) => {
              const totalDigits = liveWeight.length;
              const paddingZerosCount = 6 - totalDigits;
              const isPadding = idx < paddingZerosCount;
              return (
                <div
                  key={idx}
                  className={`
                    w-10 h-14 rounded-sm flex items-center justify-center
                    border-2 border-slate-800 bg-slate-900/80
                    text-4xl font-mono font-bold
                    ${isPadding ? 'text-emerald-500/5' : 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]'}
                    transition-all duration-75
                  `}
                >
                  {digit}
                </div>
              );
            })}
            <div className="ml-2 text-2xl font-mono text-emerald-500/80 font-bold italic self-end mb-1">
              kg
            </div>
          </div>
          <div className="mt-3 flex justify-center items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${hardwareStatus === 'connected' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : hardwareStatus === 'error' ? 'bg-red-500' : 'bg-slate-800'}`} />
            <div className={`text-[10px] uppercase font-bold tracking-wider ${hardwareStatus === 'connected' ? 'text-emerald-500' : hardwareStatus === 'error' ? 'text-red-500' : 'text-slate-500'}`}>
              {hardwareStatus === 'connected' ? 'SCALE CONNECTED' : hardwareStatus === 'error' ? 'CONNECTION ERROR' : 'CONNECTING TO SCALE...'}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => captureWeight('gross')}
          disabled={disabled || isLocked || isCapturing !== null}
          className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
        >
          {isCapturing === 'gross' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Scale className="mr-2 h-4 w-4" />
          )}
          Capture Gross
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => captureWeight('tare')}
          disabled={disabled || isLocked || isCapturing !== null}
          className="border-secondary text-secondary-foreground hover:bg-secondary"
        >
          {isCapturing === 'tare' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Scale className="mr-2 h-4 w-4" />
          )}
          Capture Tare
        </Button>
      </div>

      {settings.hardwareIntegrationEnabled && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Hardware:</span>
          {hardwareStatus === 'connected' ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span className="text-green-600">Connected</span>
            </>
          ) : hardwareStatus === 'connecting' ? (
            <>
              <Wifi className="h-3 w-3 text-yellow-500" />
              <span className="text-yellow-600">Connecting...</span>
            </>
          ) : hardwareStatus === 'error' ? (
            <>
              <WifiOff className="h-3 w-3 text-red-500" />
              <span className="text-red-600">Error</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-gray-400" />
              <span className="text-gray-500">Disconnected</span>
            </>
          )}
        </div>
      )}

      {showGVMFields && (
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => captureWeight('gvm')}
            disabled={disabled || isLocked || isCapturing !== null}
          >
            {isCapturing === 'gvm' ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Scale className="mr-1 h-3 w-3" />
            )}
            GVM
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => captureWeight('gtm')}
            disabled={disabled || isLocked || isCapturing !== null}
          >
            {isCapturing === 'gtm' ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Scale className="mr-1 h-3 w-3" />
            )}
            GTM
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => captureWeight('trailer')}
            disabled={disabled || isLocked || isCapturing !== null}
          >
            {isCapturing === 'trailer' ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Scale className="mr-1 h-3 w-3" />
            )}
            Trailer
          </Button>
        </div>
      )}

      {settings.hardwareIntegrationEnabled && (
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? `Weights captured from hardware bridge at ${settings.hardwareBridgeUrl}`
            : "Weights captured automatically from weighbridge"
          }
        </p>
      )}
    </div>
  );
}
