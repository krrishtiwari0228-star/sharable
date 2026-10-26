import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupplyDesk | Grocery Distribution",
  description: "Dealer ordering and distributor inventory management portal"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
