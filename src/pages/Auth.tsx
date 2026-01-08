import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Scale } from 'lucide-react';

const Auth = () => {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await signIn(username, password);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-end relative p-4 overflow-hidden">
      {/* Background image with gradient overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: "url('/images/login-bg.jpg')"
        }}
      >
        {/* Gradient: clear on left (truck head), faded on right (form area) */}
        <div className="absolute inset-0 bg-gradient-to-l from-background/95 via-background/80 to-transparent" />
      </div>

      {/* Floating decorative elements */}
      <div className="absolute top-20 left-20 w-20 h-20 rounded-full bg-primary/10 animate-float blur-xl" />
      <div className="absolute bottom-32 left-40 w-32 h-32 rounded-full bg-accent/10 animate-float blur-xl" style={{ animationDelay: '1s' }} />
      <div className="absolute top-40 right-1/3 w-16 h-16 rounded-full bg-success/10 animate-float blur-xl" style={{ animationDelay: '2s' }} />
      
      <Card className="mr-8 lg:mr-16 xl:mr-24 w-full max-w-md relative z-10 shadow-2xl backdrop-blur-sm border-2 animate-fade-up hover:shadow-primary/10 transition-shadow duration-500">
        <CardHeader className="text-center">
          {/* Company Logos - Horizontal */}
          <div className="flex items-center justify-center gap-4 mb-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <img 
              src="/images/sudsud-logo.png" 
              alt="SudSud Group" 
              className="h-12 object-contain hover:scale-105 transition-transform duration-300"
            />
            <div className="h-10 w-px bg-border" />
            <img 
              src="/images/energy-feeds-logo.jpg" 
              alt="Energy Feeds" 
              className="h-12 object-contain hover:scale-105 transition-transform duration-300"
            />
          </div>
          <CardTitle className="text-2xl text-primary animate-fade-in" style={{ animationDelay: '0.3s' }}>
            Weighbridge Management System
          </CardTitle>
          <CardDescription className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
            Sign in with your credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.5s' }}>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="transition-all duration-200 focus:scale-[1.02] focus:shadow-md"
              />
            </div>
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.6s' }}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="transition-all duration-200 focus:scale-[1.02] focus:shadow-md"
              />
            </div>
            <div className="animate-fade-in" style={{ animationDelay: '0.7s' }}>
              <Button 
                type="submit" 
                className="w-full group" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4 animate-fade-in" style={{ animationDelay: '0.8s' }}>
              Need an account? Contact your administrator.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
