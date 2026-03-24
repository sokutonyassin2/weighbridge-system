import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Scale, Settings, Wifi, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WeightSettings {
  automaticMode: boolean;
  hardwareBridgeUrl: string;
  cameraEnabled: boolean;
  cameraUrl: string;
  requireImageCapture: boolean;
  emergencyModeActive: boolean;
}

const defaultSettings: WeightSettings = {
  automaticMode: false,
  hardwareBridgeUrl: `http://${window.location.hostname}:5000`,
  cameraEnabled: false,
  cameraUrl: `http://${window.location.hostname}:5000`,
  requireImageCapture: false,
  emergencyModeActive: false,
};

export default function AdminWeightSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WeightSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      // @ts-ignore
      const { data, error } = await supabase
        .from('weighbridge_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Ignore row not found, fallback to defaults
          console.error('Error fetching settings:', error);
        }
      } else if (data) {
        setSettings({
          automaticMode: data.automatic_mode ?? defaultSettings.automaticMode,
          hardwareBridgeUrl: data.hardware_bridge_url ?? defaultSettings.hardwareBridgeUrl,
          cameraEnabled: data.camera_enabled ?? defaultSettings.cameraEnabled,
          cameraUrl: data.camera_url ?? defaultSettings.cameraUrl,
          requireImageCapture: data.require_image_capture ?? defaultSettings.requireImageCapture,
          emergencyModeActive: data.emergency_mode_active ?? defaultSettings.emergencyModeActive,
        });
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      // Ensure single row with id 1 exists
      // @ts-ignore
      const { error } = await supabase
        .from('weighbridge_settings')
        .upsert([{
          id: 1, // Always update the first row
          automatic_mode: settings.automaticMode,
          hardware_bridge_url: settings.hardwareBridgeUrl,
          camera_enabled: settings.cameraEnabled,
          camera_url: settings.cameraUrl,
          require_image_capture: settings.requireImageCapture,
          emergency_mode_active: settings.emergencyModeActive,
          updated_at: new Date().toISOString()
        }], { onConflict: 'id' });

      if (error) {
        console.error('Error ensuring settings row:', error);
      }
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        id: 1, // Always update the master row
        automatic_mode: settings.automaticMode,
        hardware_bridge_url: settings.hardwareBridgeUrl,
        camera_enabled: settings.cameraEnabled,
        camera_url: settings.cameraUrl,
        require_image_capture: settings.requireImageCapture,
        emergency_mode_active: settings.emergencyModeActive,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('weighbridge_settings')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Centralized weight capture settings have been updated.",
      });

      // Also update localStorage for backward compatibility or immediate local read if needed
      localStorage.setItem("weightCaptureSettings", JSON.stringify(settings));
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to save",
        description: err.message || "An error occurred while saving settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await fetch(`${settings.hardwareBridgeUrl}/weight`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Connection Successful",
          description: `Hardware bridge responded. Weight: ${data.weight || "N/A"} kg`,
        });
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Could not connect to hardware bridge. Make sure the local program is running.",
      });
    }
  };

  const testCamera = async () => {
    try {
      const response = await fetch(`${settings.cameraUrl}/capture-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        toast({
          title: "Camera Connection Successful",
          description: "Camera is accessible through the hardware bridge.",
        });
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Camera Connection Failed",
        description: "Could not connect to camera via hardware bridge.",
      });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Scale className="h-8 w-8" />
          Weight Capture Settings
        </h1>
        <p className="text-muted-foreground">
          Configure how weight data is captured from the weighbridge
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Capture Mode
          </CardTitle>
          <CardDescription>
            Choose between automatic (hardware bridge) or manual weight entry
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="automatic-mode" className="text-base font-medium">
                Automatic Weight Capture
              </Label>
              <p className="text-sm text-muted-foreground">
                {settings.automaticMode
                  ? "Weight inputs are read-only. Operators must use Capture buttons to get weights from the local hardware bridge."
                  : "Operators can manually type weights directly into input fields."
                }
              </p>
            </div>
            <Switch
              id="automatic-mode"
              checked={settings.automaticMode}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, automaticMode: checked })
              }
            />
          </div>

          <div className={`p-4 rounded-lg ${settings.automaticMode ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" : "bg-muted"} border`}>
            <p className="text-sm font-medium">
              Current Mode: {settings.automaticMode ? "🔒 Automatic (Capture Only)" : "✏️ Manual Entry Allowed"}
            </p>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="space-y-1 relative z-10">
              <Label htmlFor="emergency-mode" className="text-base font-bold text-red-700 dark:text-red-400">
                Mkombozi (Plan B) - Emergency Mode
              </Label>
              <p className="text-sm text-red-600/80 dark:text-red-300/80 max-w-lg">
                Activate this to force all weighbridge operations to route hardware traffic through the local MacBook (`localhost:5000`). Use this when the local server access point is down.
              </p>
            </div>
            <Switch
              id="emergency-mode"
              checked={settings.emergencyModeActive}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, emergencyModeActive: checked })
              }
              className="relative z-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Hardware Bridge Connection
          </CardTitle>
          <CardDescription>
            Configure the local hardware bridge program that reads weight from COM port
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bridge-url">Hardware Bridge URL</Label>
            <Input
              id="bridge-url"
              placeholder={`http://${window.location.hostname}:5000`}
              value={settings.hardwareBridgeUrl}
              onChange={(e) =>
                setSettings({ ...settings, hardwareBridgeUrl: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              The URL where your local hardware bridge program is running (e.g., http://{window.location.hostname}:5000)
            </p>
          </div>

          <Button type="button" variant="outline" onClick={testConnection}>
            <Wifi className="mr-2 h-4 w-4" />
            Test Connection
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera Settings
          </CardTitle>
          <CardDescription>
            Configure vehicle photo capture via the hardware bridge
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="camera-enabled" className="text-base font-medium">
                Enable Camera Capture
              </Label>
              <p className="text-sm text-muted-foreground">
                Capture vehicle photos through the local hardware bridge
              </p>
            </div>
            <Switch
              id="camera-enabled"
              checked={settings.cameraEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, cameraEnabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="require-image" className="text-base font-medium">
                Require Image Before Save
              </Label>
              <p className="text-sm text-muted-foreground">
                {settings.requireImageCapture
                  ? "Operators MUST capture a photo before saving the weigh record. Save button is disabled until image is captured."
                  : "Image capture is optional. Operators can save without capturing a photo."
                }
              </p>
            </div>
            <Switch
              id="require-image"
              checked={settings.requireImageCapture}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireImageCapture: checked })
              }
            />
          </div>

          {settings.requireImageCapture && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                ⚠️ Image capture is REQUIRED. Operators cannot save weigh records without capturing a vehicle photo first.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="camera-url">Camera Bridge URL</Label>
            <Input
              id="camera-url"
              placeholder={`http://${window.location.hostname}:5000`}
              value={settings.cameraUrl}
              onChange={(e) =>
                setSettings({ ...settings, cameraUrl: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Usually the same as the hardware bridge URL. The bridge connects to the IP camera (192.168.1.160).
            </p>
          </div>

          <Button type="button" variant="outline" onClick={testCamera} disabled={!settings.cameraEnabled}>
            <Camera className="mr-2 h-4 w-4" />
            Test Camera
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} size="lg" disabled={isLoading || isSaving} className="min-w-[150px]">
          {isSaving ? "Saving..." : "Save Central Settings"}
        </Button>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Hardware Bridge Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The local hardware bridge is a separate program that runs on your computer and:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Listens to the COM port connected to your weighbridge indicator</li>
            <li>Connects to the IP camera on your local network (192.168.1.160)</li>
            <li>Provides weight data and camera capture via HTTP endpoints</li>
          </ul>
          <p className="font-medium text-foreground mt-4">
            Required Endpoints:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 font-mono text-xs">
            <li>GET /weight - Returns {"{ weight: number }"}</li>
            <li>POST /capture-photo - Returns {"{ imageData: base64, filePath: string }"}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
