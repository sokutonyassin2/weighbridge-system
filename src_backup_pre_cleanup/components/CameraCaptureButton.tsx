import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface CameraCaptureButtonProps {
  entryId: string;
  vehicleNo: string;
  vehicleType?: string;
  weighNumber: number;
  onPhotoCapture?: (photoUrl: string) => void;
  disabled?: boolean;
}

interface CameraSettings {
  cameraEnabled: boolean;
  cameraUrl: string;
}

export function CameraCaptureButton({
  entryId,
  vehicleNo,
  vehicleType,
  weighNumber,
  onPhotoCapture,
  disabled = false,
}: CameraCaptureButtonProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPath, setCapturedPath] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [settings, setSettings] = useState<CameraSettings>({
    cameraEnabled: false,
    cameraUrl: "http://localhost:5000",
  });

  useEffect(() => {
    fetchSettings();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('schema-db-changes-camera')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weighbridge_settings',
          filter: 'id=eq.1',
        },
        (payload) => {
          console.log('Central settings updated (Camera):', payload.new);
          if (payload.new) {
            setSettings({
              cameraEnabled: payload.new.camera_enabled ?? false,
              cameraUrl: payload.new.camera_url ?? "http://localhost:5000",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSettings = async () => {
    try {
      // @ts-ignore
      const { data, error } = await supabase
        .from('weighbridge_settings')
        .select('camera_enabled, camera_url')
        .eq('id', 1)
        .single();

      if (!error && data) {
        setSettings({
          cameraEnabled: data.camera_enabled,
          cameraUrl: data.camera_url,
        });
      } else {
        // Fallback to local storage if DB fails
        const saved = localStorage.getItem("weightCaptureSettings");
        if (saved) {
          const parsed = JSON.parse(saved);
          setSettings({
            cameraEnabled: parsed.cameraEnabled ?? false,
            cameraUrl: parsed.cameraUrl ?? "http://localhost:5000",
          });
        }
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const handleCapture = async () => {
    if (!settings.cameraEnabled) {
      toast({
        variant: "destructive",
        title: "Camera Not Enabled",
        description: "Enable camera capture in Admin > Weight Settings first.",
      });
      return;
    }

    setIsCapturing(true);
    setError(null);

    try {
      const cameraBaseUrl = settings.cameraUrl;
      const response = await fetch(`${cameraBaseUrl}/api/hardware/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId,
          vehicleNo,
          vehicleType: vehicleType || "Unknown",
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to capture photo from helper program");
      }

      const data = await response.json();

      if (data.photoPath) {
        setCapturedPath(data.photoPath);
        // Build a full URL so the browser can actually load the image
        const fullUrl = data.photoUrl || `${settings.cameraUrl}${data.photoPath}`;
        setCapturedImage(fullUrl);
        onPhotoCapture?.(fullUrl);
        toast({
          title: "Photo Captured Successfully",
          description: `Vehicle ${vehicleNo} photo captured and saved. You can now proceed with weighing.`,
        });
      } else {
        throw new Error("Invalid response from helper program");
      }
    } catch (err: any) {
      const errorMsg = err.message || "Failed to capture photo";
      setError(errorMsg);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: `${errorMsg}. Make sure the helper program is running and camera is connected.`,
      });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={capturedPath ? "secondary" : "outline"}
          onClick={handleCapture}
          disabled={disabled || isCapturing || !settings.cameraEnabled}
          className="flex-1"
        >
          {isCapturing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Capturing...
            </>
          ) : capturedPath ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4 text-success" />
              Photo Saved - Ready to Weigh
            </>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" />
              Capture Vehicle Photo
            </>
          )}
        </Button>
      </div>

      {!settings.cameraEnabled && isAdmin && (
        <p className="text-xs text-muted-foreground">
          ⚠️ Camera capture disabled. Enable in Admin → Weight Settings
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      {capturedPath && (
        <p className="text-xs text-success">
          ✅ Photo captured successfully for {vehicleNo}
        </p>
      )}

      {capturedImage && (
        <div className="mt-2 p-2 border rounded bg-muted">
          <p className="text-xs mb-1 text-center">Captured Image Preview:</p>
          <img
            src={capturedImage}
            alt="Captured vehicle"
            className="max-w-full h-auto rounded border max-h-32 object-contain"
          />
        </div>
      )}
    </div>
  );
}
