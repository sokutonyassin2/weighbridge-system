import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="p-4 bg-red-50 rounded-2xl">
                <AlertTriangle className="h-12 w-12 text-red-500" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">System Interruption</h1>
                <p className="text-sm text-slate-500 font-medium">
                  We encountered an unexpected error while processing your request.
                </p>
              </div>

              {this.state.error && (
                <div className="w-full p-4 bg-slate-50 rounded-xl border border-slate-100 text-left overflow-auto max-h-32">
                  <p className="text-[10px] font-mono text-slate-400 uppercase font-bold mb-1">Error Details:</p>
                  <p className="text-xs font-mono text-red-600 break-words">{this.state.error.message}</p>
                </div>
              )}

              <div className="pt-4 w-full">
                <Button 
                  onClick={this.handleReset}
                  className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold gap-2 transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Application
                </Button>
                <p className="text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-widest">
                  Try refreshing to restore normal operation
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
