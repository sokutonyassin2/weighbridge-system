import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://vsgtvcvzijuehawpodhz.supabase.co'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA'),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-core': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
