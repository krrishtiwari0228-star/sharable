# SupplyDesk Android app

Native Android client built with Expo React Native, using the same Supabase project as the web portal.

## Build an installable APK (free internal testing)
1. Install Node.js LTS and Android Studio (for local development), or use EAS cloud build.
2. From this folder run `npm install`.
3. Copy `.env.example` to `.env` and add the same Supabase project URL and anon/publishable key as the web app. Never use the service-role key.
4. Install EAS CLI: `npm install -g eas-cli`; sign in: `eas login`.
5. Configure: `eas build:configure`.
6. Build APK: `eas build --platform android --profile preview`.
7. Open the build URL from Expo and download/install the APK on your Android phone.

The app currently includes authenticated sign-in and a live catalogue read. Business order transactions must be wired to trusted server-side APIs/RPCs before production use.
