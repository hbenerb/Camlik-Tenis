"use client";

import { Download, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type MobilePlatform = "android" | "ios" | null;

function detectMobilePlatform(): MobilePlatform {
  const userAgent = navigator.userAgent;
  const isIPad =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  if (/iPad|iPhone|iPod/i.test(userAgent) || isIPad) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  return null;
}

function isStandaloneMode() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    iosNavigator.standalone === true
  );
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [platform, setPlatform] = useState<MobilePlatform>(null);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");

    const updateEnvironment = () => {
      setPlatform(detectMobilePlatform());
      setIsInstalled(isStandaloneMode());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstructionsOpen(false);
      setIsInstalled(true);
    };

    updateEnvironment();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    displayMode.addEventListener("change", updateEnvironment);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      displayMode.removeEventListener("change", updateEnvironment);
    };
  }, []);

  async function installApp() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      return;
    }

    setIsInstructionsOpen(true);
  }

  if (
    !platform ||
    isInstalled ||
    (platform === "android" && !deferredPrompt)
  ) {
    return null;
  }

  const isIos = platform === "ios";

  return (
    <>
      <button
        className="inline-flex h-12 items-center justify-center gap-3 rounded-md border border-[#cfc8b8] bg-white px-4 text-sm font-semibold hover:bg-[#f1ede2]"
        onClick={() => void installApp()}
        type="button"
      >
        <Download size={19} />
        Ana ekrana indir
      </button>

      {isInstructionsOpen ? (
        <div className="reservation-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4">
          <button
            aria-label="Ana ekrana indirme açıklamasını kapat"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsInstructionsOpen(false)}
            type="button"
          />
          <section
            aria-labelledby="install-app-title"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-md border border-[#cfc8b8] bg-[#fffdf8] p-5 shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className="text-lg font-semibold text-[#17211c]"
                  id="install-app-title"
                >
                  Ana ekrana indir
                </p>
                <p className="mt-1 text-sm leading-6 text-[#546257]">
                  Uygulamayı telefonunuzda diğer uygulamalar gibi açabilirsiniz.
                </p>
              </div>
              <button
                aria-label="Kapat"
                className="grid size-9 shrink-0 place-items-center rounded-md border border-[#cfc8b8] bg-white hover:bg-[#f1ede2]"
                onClick={() => setIsInstructionsOpen(false)}
                type="button"
              >
                <X size={17} />
              </button>
            </div>

            {isIos ? (
              <ol className="mt-5 grid gap-4 text-sm leading-6 text-[#34443a]">
                <li className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#f0f8ef] text-[#237000]">
                    <Share2 size={18} />
                  </span>
                  <span>
                    Safari&apos;de <strong>Paylaş</strong> simgesine dokunun.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#f0f8ef] text-[#237000]">
                    <Download size={18} />
                  </span>
                  <span>
                    Menüden <strong>Ana Ekrana Ekle</strong> seçeneğini seçin.
                  </span>
                </li>
              </ol>
            ) : null}

            <button
              className="mt-5 h-11 w-full rounded-md bg-[#237000] px-4 text-sm font-semibold text-white hover:bg-[#1f6500]"
              onClick={() => setIsInstructionsOpen(false)}
              type="button"
            >
              Tamam
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
