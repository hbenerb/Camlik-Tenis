"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    const lockPortrait = () => {
      const orientation =
        "orientation" in screen
          ? (screen.orientation as ScreenOrientation & {
              lock?: (orientation: "portrait-primary") => Promise<void>;
            })
          : null;

      void orientation?.lock?.("portrait-primary").catch(() => {
        // Browsers may only allow orientation lock after install/fullscreen.
      });
    };

    lockPortrait();

    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA support is optional; the app should keep working if registration fails.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
