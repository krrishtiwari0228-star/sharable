"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaInstall() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installEvent) {
      setHelpOpen(value => !value);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  return (
    <div style={{ position: "fixed", zIndex: 1000, right: 16, bottom: 16, maxWidth: 300 }}>
      <button type="button" onClick={install} style={{ border: 0, borderRadius: 999, padding: "12px 18px", background: "#286748", color: "white", fontWeight: 700, boxShadow: "0 4px 16px #0002", cursor: "pointer" }}>
        {installEvent ? "Install SupplyDesk app" : "How to install SupplyDesk"}
      </button>
      {helpOpen && <div role="status" style={{ marginTop: 8, background: "white", color: "#20352b", padding: 14, borderRadius: 12, boxShadow: "0 4px 20px #0002", fontSize: 13, lineHeight: 1.5 }}>
        <strong>Install SupplyDesk</strong>
        <p style={{ margin: "8px 0" }}>Android (Chrome): tap ⋮ in the browser, then “Install app” or “Add to Home screen”.</p>
        <p style={{ margin: "8px 0" }}>iPhone (Safari): tap Share, then “Add to Home Screen”.</p>
        <button type="button" onClick={() => setHelpOpen(false)} style={{ border: "1px solid #d5e1d9", borderRadius: 8, padding: "6px 10px", background: "white", cursor: "pointer" }}>Close</button>
      </div>}
    </div>
  );
}
