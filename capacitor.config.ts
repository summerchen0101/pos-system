import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.nuts.possystem',
  appName: 'POS System',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
