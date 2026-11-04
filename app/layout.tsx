import type { Metadata, Viewport } from "next";
import PwaRegister from "./pwa-register";
import PwaInstall from "./pwa-install";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupplyDesk | Grocery Distribution",
  description: "Dealer ordering and distributor inventory management portal",
  applicationName: "SupplyDesk",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SupplyDesk" },
  icons: { icon: "/supplydesk-icon.svg", apple: "/supplydesk-icon.svg" }
};

export const viewport: Viewport = {
  themeColor: "#286748",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PwaRegister /><PwaInstall />{children}</body></html>;
}
