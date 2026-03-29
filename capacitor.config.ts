import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.get4you',
  appName: 'get4you',
  webDir: 'dist',
  server: {
    url: 'https://81048fae-b380-4fe2-857e-21b0bb28eff3.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
