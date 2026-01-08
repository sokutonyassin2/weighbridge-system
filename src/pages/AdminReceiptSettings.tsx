
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';
import { Separator } from '@/components/ui/separator';
import {
  LayoutTemplate,
  FileText,
  QrCode,
  Image,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
  Trash2,
  Save,
  RotateCcw,
  Printer,
  Check
} from 'lucide-react';

interface ReceiptSettings {
  template: 'classic' | 'modern' | 'minimal';
  header: {
    companyName: string;
    subtitle: string;
    address: string;
    showLogo: boolean;
    logoPosition: 'left' | 'center' | 'right';
    customLogo?: string;
    useCustomLogo: boolean;
  };
  qrCode: {
    enabled: boolean;
    size: 'small' | 'medium' | 'large';
    position: 'top-right' | 'bottom-right' | 'bottom-left';
    includeData: string[];
  };
  footer: {
    text: string;
    showGeneratedTime: boolean;
  };
}

const defaultSettings: ReceiptSettings = {
  template: 'classic',
  header: {
    companyName: 'ENERGY FEEDS LIMITED',
    subtitle: 'Under SudSud Group',
    address: 'P.O BOX 106254 - DAR ES SALAAM, TANZANIA',
    showLogo: true,
    logoPosition: 'center',
    useCustomLogo: false,
  },
  qrCode: {
    enabled: true,
    size: 'medium',
    position: 'bottom-right',
    includeData: ['entryId', 'vehicleNo', 'weighTime', 'netWeight'],
  },
  footer: {
    text: 'Thank you for your business!',
    showGeneratedTime: true,
  },
};

const AdminReceiptSettings = () => {
  const [settings, setSettings] = useState<ReceiptSettings>(defaultSettings);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('receiptSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSettings(parsed);
      if (parsed.header.customLogo) {
        setLogoPreview(parsed.header.customLogo);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('receiptSettings', JSON.stringify(settings));
    toast.success('Receipt settings saved successfully');
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setLogoPreview(null);
    localStorage.setItem('receiptSettings', JSON.stringify(defaultSettings));
    toast.success('Receipt settings reset to defaults');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 500KB)
    if (file.size > 500000) {
      toast.error('Logo file size must be less than 500KB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLogoPreview(base64);
      setSettings({
        ...settings,
        header: {
          ...settings.header,
          customLogo: base64,
          useCustomLogo: true
        },
      });
      toast.success('Logo uploaded successfully');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setSettings({
      ...settings,
      header: {
        ...settings.header,
        customLogo: undefined,
        useCustomLogo: false
      },
    });
    toast.success('Custom logo removed');
  };

  const qrSizeMap = {
    small: 80,
    medium: 100,
    large: 120,
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Receipt Design</h1>
          <p className="text-muted-foreground mt-1">Configure your weighbridge receipt template and branding.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleReset} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset Defaults
          </Button>
          <Button onClick={handleSave} className="gap-2 shadow-sm">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Settings */}
        <div className="xl:col-span-7 space-y-8">

          {/* Template Selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Choose Template</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['classic', 'modern', 'minimal'] as const).map((template) => (
                <div
                  key={template}
                  onClick={() => setSettings({ ...settings, template })}
                  className={`
                    cursor-pointer relative overflow-hidden rounded-xl border-2 p-4 transition-all duration-200
                    hover:border-primary/50 hover:shadow-md group
                    ${settings.template === template
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card'}
                  `}
                >
                  <div className="flex flex-col items-center text-center gap-3 py-2">
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center transition-colors
                      ${settings.template === template ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}
                    `}>
                      {template === 'classic' && <FileText className="h-6 w-6" />}
                      {template === 'modern' && <LayoutTemplate className="h-6 w-6" />}
                      {template === 'minimal' && <Type className="h-6 w-6" />}
                    </div>
                    <div>
                      <h3 className="font-semibold capitalize">{template}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {template === 'classic' && 'Traditional & Formal'}
                        {template === 'modern' && 'Clean & Contemporary'}
                        {template === 'minimal' && 'Simple & Text-Only'}
                      </p>
                    </div>
                  </div>
                  {settings.template === template && (
                    <div className="absolute top-3 right-3 text-primary">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Detailed Configuration Tabs */}
          <Tabs defaultValue="header" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-12 p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="header" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Image className="h-4 w-4 mr-2" /> Header & Branding
              </TabsTrigger>
              <TabsTrigger value="qrcode" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <QrCode className="h-4 w-4 mr-2" /> QR Code
              </TabsTrigger>
              <TabsTrigger value="footer" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Type className="h-4 w-4 mr-2" /> Footer
              </TabsTrigger>
            </TabsList>

            {/* HEADER SETTINGS */}
            <TabsContent value="header" className="space-y-6 mt-6">
              <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Business Information</CardTitle>
                  <CardDescription>Customize your receipt header details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-5">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        value={settings.header.companyName}
                        onChange={(e) => setSettings({ ...settings, header: { ...settings.header, companyName: e.target.value } })}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subtitle / Group Name</Label>
                      <Input
                        value={settings.header.subtitle}
                        onChange={(e) => setSettings({ ...settings, header: { ...settings.header, subtitle: e.target.value } })}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Address & Contacts</Label>
                      <Textarea
                        value={settings.header.address}
                        onChange={(e) => setSettings({ ...settings, header: { ...settings.header, address: e.target.value } })}
                        rows={3}
                        className="bg-white resize-none"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Logo Settings</CardTitle>
                  <CardDescription>Manage print logo appearance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Feature Card Switch for Show Logo */}
                  <div
                    className={`
                      flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer
                      ${settings.header.showLogo
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-white hover:border-primary/30'}
                    `}
                    onClick={() => setSettings({ ...settings, header: { ...settings.header, showLogo: !settings.header.showLogo } })}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${settings.header.showLogo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <Image className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium">Show Logo on Receipt</h4>
                        <p className="text-sm text-muted-foreground">Print logo at the top of the receipt</p>
                      </div>
                    </div>
                    <Switch checked={settings.header.showLogo} />
                  </div>

                  {settings.header.showLogo && (
                    <div className="grid gap-6 pl-4 border-l-2 border-primary/10 ml-4 animate-in slide-in-from-left-2 duration-300">
                      <div className="space-y-3">
                        <Label>Logo Position</Label>
                        <div className="flex gap-4">
                          {[
                            { val: 'left', icon: AlignLeft, label: 'Left' },
                            { val: 'center', icon: AlignCenter, label: 'Center' },
                            { val: 'right', icon: AlignRight, label: 'Right' }
                          ].map((pos) => (
                            <button
                              key={pos.val}
                              onClick={() => setSettings({ ...settings, header: { ...settings.header, logoPosition: pos.val as any } })}
                              className={`
                                flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-all
                                ${settings.header.logoPosition === pos.val
                                  ? 'border-primary bg-primary/5 text-primary'
                                  : 'border-border bg-white hover:bg-gray-50'}
                              `}
                            >
                              <pos.icon className="h-5 w-5" />
                              <span className="text-xs font-medium">{pos.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label>Custom Logo</Label>
                        <div className="flex gap-4 items-start">
                          {logoPreview ? (
                            <div className="relative group border rounded-lg p-2 bg-white w-24 h-24 flex items-center justify-center">
                              <img src={logoPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
                                className="absolute -top-2 -right-2 bg-destructive text-white p-1 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-24 h-24 rounded-lg bg-muted/50 border-2 border-dashed border-muted flex items-center justify-center text-muted-foreground">
                              <Image className="h-8 w-8 opacity-50" />
                            </div>
                          )}

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" className="relative overflow-hidden">
                                <Upload className="h-4 w-4 mr-2" />
                                Upload New Logo
                                <input
                                  type="file"
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                  onChange={handleLogoUpload}
                                  accept="image/png, image/jpeg, image/jpg"
                                />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Recommended: PNG with transparent background (Max 500KB)</p>

                            {settings.header.customLogo && (
                              <div className="flex items-center gap-2 mt-2">
                                <Switch
                                  checked={settings.header.useCustomLogo}
                                  onCheckedChange={(c) => setSettings({ ...settings, header: { ...settings.header, useCustomLogo: c } })}
                                />
                                <Label className="text-sm font-normal">Use this custom logo</Label>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* QR CODE SETTINGS */}
            <TabsContent value="qrcode" className="space-y-6 mt-6">
              <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Verification Code</CardTitle>
                  <CardDescription>Configure the QR code for receipt validity.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Feature Card Switch for Enable QR */}
                  <div
                    className={`
                      flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer
                      ${settings.qrCode.enabled
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-white hover:border-primary/30'}
                    `}
                    onClick={() => setSettings({ ...settings, qrCode: { ...settings.qrCode, enabled: !settings.qrCode.enabled } })}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${settings.qrCode.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <QrCode className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium">Enable Validation QR Code</h4>
                        <p className="text-sm text-muted-foreground">Encodes vehicle data for fraud prevention</p>
                      </div>
                    </div>
                    <Switch checked={settings.qrCode.enabled} />
                  </div>

                  {settings.qrCode.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4 border-l-2 border-primary/10 ml-4 animate-in slide-in-from-left-2 duration-300">
                      <div className="space-y-2">
                        <Label>Size</Label>
                        <Select
                          value={settings.qrCode.size}
                          onValueChange={(value: 'small' | 'medium' | 'large') =>
                            setSettings({ ...settings, qrCode: { ...settings.qrCode, size: value } })
                          }
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Small (80px)</SelectItem>
                            <SelectItem value="medium">Medium (100px)</SelectItem>
                            <SelectItem value="large">Large (120px)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Position</Label>
                        <Select
                          value={settings.qrCode.position}
                          onValueChange={(value: 'top-right' | 'bottom-right' | 'bottom-left') =>
                            setSettings({ ...settings, qrCode: { ...settings.qrCode, position: value } })
                          }
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="top-right">Top Right (Header)</SelectItem>
                            <SelectItem value="bottom-right">Bottom Right (Footer)</SelectItem>
                            <SelectItem value="bottom-left">Bottom Left (Footer)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* FOOTER SETTINGS */}
            <TabsContent value="footer" className="space-y-6 mt-6">
              <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Footer Content</CardTitle>
                  <CardDescription>Custom messages and timestamps.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Footer Message</Label>
                    <Textarea
                      value={settings.footer.text}
                      onChange={(e) => setSettings({ ...settings, footer: { ...settings.footer, text: e.target.value } })}
                      rows={3}
                      className="bg-white resize-none"
                      placeholder="e.g. Thank you, Goods received in good condition..."
                    />
                  </div>

                  {/* Feature Card Switch for Timestamp */}
                  <div
                    className={`
                      flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer
                      ${settings.footer.showGeneratedTime
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-white hover:border-primary/30'}
                    `}
                    onClick={() => setSettings({ ...settings, footer: { ...settings.footer, showGeneratedTime: !settings.footer.showGeneratedTime } })}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${settings.footer.showGeneratedTime ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <TimerIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium">Show Printed Timestamp</h4>
                        <p className="text-sm text-muted-foreground">Add "Generated at: [Time]" to the footer</p>
                      </div>
                    </div>
                    <Switch checked={settings.footer.showGeneratedTime} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Live Preview */}
        <div className="xl:col-span-5">
          <div className="sticky top-6">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <Printer className="h-5 w-5" />
              <h2 className="font-semibold">Live Preview</h2>
            </div>

            <Card className="overflow-hidden bg-white shadow-lg border-muted/40">
              <CardContent className="p-0">
                <div className="bg-gray-100 p-8 min-h-[500px] flex items-center justify-center">
                  {/* The Receipt Paper */}
                  <div
                    className={`
                        w-full bg-white text-black p-6 shadow-xl transition-all duration-300 relative
                        ${settings.template === 'classic' ? 'border-4 border-gray-900 rounded-sm' : ''}
                        ${settings.template === 'modern' ? 'border border-gray-200 rounded-2xl shadow-2xl' : ''}
                        ${settings.template === 'minimal' ? 'border-none shadow-sm' : ''}
                      `}
                    style={{
                      fontFamily: settings.template === 'minimal' ? 'monospace' : 'inherit',
                      maxWidth: '380px' // Mobile-ish width for preview
                    }}
                  >
                    {/* PREVIEW CONTENT */}
                    <div className={`text-${settings.header.logoPosition} mb-6 relative`}>
                      {settings.header.showLogo && (
                        <img
                          src={settings.header.useCustomLogo && settings.header.customLogo
                            ? settings.header.customLogo
                            : "/images/energy-feeds-logo.jpg"
                          }
                          alt="Logo"
                          className={`h-16 object-contain mb-3 ${settings.header.logoPosition === 'center' ? 'mx-auto' : settings.header.logoPosition === 'right' ? 'ml-auto' : ''}`}
                        />
                      )}
                      <h1 className={`${settings.template === 'minimal' ? 'text-lg' : 'text-xl'} font-bold leading-tight`}>
                        {settings.header.companyName}
                      </h1>
                      <p className={`text-xs opacity-80 mt-1`}>
                        {settings.header.subtitle}
                      </p>
                      <p className="text-[10px] opacity-60 mt-1 whitespace-pre-line">
                        {settings.header.address}
                      </p>

                      {/* Top Right QR */}
                      {settings.qrCode.enabled && settings.qrCode.position === 'top-right' && (
                        <div className={`absolute top-0 right-0 ${settings.header.logoPosition === 'right' ? 'hidden' : 'block'}`}>
                          <div className="bg-white p-1">
                            <QRCode value="PREVIEW" size={48} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    {settings.template === 'classic' && <div className="border-b-2 border-dashed border-gray-300 my-4" />}
                    {settings.template === 'modern' && <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-6" />}
                    {settings.template === 'minimal' && <div className="border-b border-dotted border-gray-400 my-4" />}

                    {/* Content Mockup */}
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="opacity-60 text-xs uppercase tracking-wider">Ticket No</span>
                        <span className="font-bold font-mono">WB-2024-89</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="opacity-60 text-xs uppercase tracking-wider">Vehicle</span>
                        <span className="font-semibold">T 123 DFE</span>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg my-2 border border-gray-100">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-medium">Net Weight</span>
                          <span className="text-xl font-bold">24,500 <span className="text-sm font-normal text-muted-foreground">kg</span></span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="opacity-60">Time In</span>
                        <span>10:30 AM</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="opacity-60">Time Out</span>
                        <span>11:45 AM</span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="my-6 opacity-20 border-b border-black" />

                    {/* Footer */}
                    <div className="relative">
                      <p className="text-center text-xs opacity-70 italic px-4">
                        {settings.footer.text || 'Thank you for your business!'}
                      </p>

                      {settings.footer.showGeneratedTime && (
                        <p className="text-center text-[10px] opacity-40 mt-3 font-mono">
                          {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                        </p>
                      )}

                      {/* Bottom QR Codes */}
                      {settings.qrCode.enabled && (settings.qrCode.position === 'bottom-right' || settings.qrCode.position === 'bottom-left') && (
                        <div className={`mt-4 flex ${settings.qrCode.position === 'bottom-right' ? 'justify-end' : 'justify-start'}`}>
                          <QRCode value="PREVIEW" size={qrSizeMap[settings.qrCode.size] * 0.6} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <p className="text-center text-xs text-muted-foreground mt-4">
              * Preview contains dummy data. Actual layout maps to A4/Thermal paper.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple Timer Icon helper since it wasn't in the initial import set and I don't want to risky separate imports
const TimerIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="10" x2="14" y1="2" y2="2" />
    <line x1="12" x2="15" y1="14" y2="11" />
    <circle cx="12" cy="14" r="8" />
  </svg>
);

export default AdminReceiptSettings;
