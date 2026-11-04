"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
          console.error("SupplyDesk service worker registration failed:", error);
        });
      }, { once: true });
    }
  }, []);
  return null;
}
