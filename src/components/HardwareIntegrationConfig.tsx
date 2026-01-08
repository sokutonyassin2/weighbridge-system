import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface HardwareIntegrationConfigProps {
  onSave: (settings: any) => void;
  onCancel: () => void;
  initialSettings?: any;
}

export function HardwareIntegrationConfig({
  onSave,
  onCancel,
  initialSettings
}: HardwareIntegrationConfigProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    hardwareIntegrationEnabled: initialSettings?.hardwareIntegrationEnabled ?? false,
    automaticMode: initialSettings?.automaticMode ?? false,
    requireImageCapture: initialSettings?.requireImageCapture ?? false,
    hardwareBridgeUrl: initialSettings?.hardwareBridgeUrl ?? `http://${window.location.hostname}:5000`,
  });

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem('weightCaptureSettings', JSON.stringify(settings));

    // Show success message
    toast({
      title: 'Settings Saved',
      description: 'Hardware integration settings have been updated successfully.',
    });

    // Call parent save handler
    onSave(settings);
  };

  const handleTestConnection = async () => {
    try {
      const response = await fetch(`${settings.hardwareBridgeUrl}/api/hardware/status`);
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Connection Successful',
          description: 'Successfully connected to the helper program.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Connection Failed',
          description: data.error || 'Could not connect to the helper program.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: 'Failed to connect to the helper program. Please check the URL and ensure the helper program is running.',
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Hardware Integration Settings</CardTitle>
        <CardDescription>
          Configure how the system connects to your helper program
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hardwareIntegrationEnabled">Enable Hardware Integration</Label>
              <p className="text-xs text-muted-foreground">
                Connect to external weighbridge hardware for automatic weight capture
              </p>
            </div>
            <Switch
              id="hardwareIntegrationEnabled"
              checked={settings.hardwareIntegrationEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, hardwareIntegrationEnabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="automaticMode">Automatic Mode</Label>
              <p className="text-xs text-muted-foreground">
                Automatically capture weights without manual intervention
              </p>
            </div>
            <Switch
              id="automaticMode"
              checked={settings.automaticMode}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, automaticMode: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="requireImageCapture">Require Image Capture</Label>
              <p className="text-xs text-muted-foreground">
                Require vehicle photos for each weigh entry
              </p>
            </div>
            <Switch
              id="requireImageCapture"
              checked={settings.requireImageCapture}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireImageCapture: checked })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hardwareBridgeUrl">Hardware Bridge URL</Label>
          <div className="flex gap-2">
            <Input
              id="hardwareBridgeUrl"
              value={settings.hardwareBridgeUrl}
              onChange={(e) =>
                setSettings({ ...settings, hardwareBridgeUrl: e.target.value })
              }
              placeholder={`http://${window.location.hostname}:5000`}
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={handleTestConnection}>
              Test Connection
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The URL where your hardware bridge server is running
          </p>
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}