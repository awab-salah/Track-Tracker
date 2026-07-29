import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tracktracker.app',
  appName: 'TrackTracker',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      presentationFrame: 'popover',
    },
    Filesystem: {},
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#104C64',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
  },
  android: {
    backgroundColor: '#104C64',
  },
};

export default config;
