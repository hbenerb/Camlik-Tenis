"use client";

import {
  CheckCircle2,
  Download,
  Menu,
  MonitorDown,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type DevicePlatform = "android" | "ios" | "macos" | "other" | "windows";
type BrowserFamily = "chromium" | "firefox" | "safari" | "other";

function detectDevicePlatform(): DevicePlatform {
  const userAgent = navigator.userAgent;
  const isIPad =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  if (/iPad|iPhone|iPod/i.test(userAgent) || isIPad) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return "macos";
  }

  if (/Windows/i.test(userAgent)) {
    return "windows";
  }

  return "other";
}

function detectBrowserFamily(): BrowserFamily {
  const userAgent = navigator.userAgent;

  if (/Firefox|FxiOS/i.test(userAgent)) {
    return "firefox";
  }

  if (/Chrome|CriOS|Edg|OPR|SamsungBrowser/i.test(userAgent)) {
    return "chromium";
  }

  if (/Safari/i.test(userAgent)) {
    return "safari";
  }

  return "other";
}

function isStandaloneMode() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    iosNavigator.standalone === true
  );
}

export function PwaDownloadPanel() {
  const [browser, setBrowser] = useState<BrowserFamily>("other");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>("other");
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");

    const updateEnvironment = () => {
      setBrowser(detectBrowserFamily());
      setIsInstalled(isStandaloneMode());
      setPlatform(detectDevicePlatform());
      setIsReady(true);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setShowInstructions(false);
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

    setShowInstructions(true);
  }

  if (!isReady) {
    return (
      <button
        className="h-12 w-full rounded-md bg-[#237000] px-4 text-sm font-semibold text-white opacity-70"
        disabled
        type="button"
      >
        Cihaz kontrol ediliyor
      </button>
    );
  }

  if (isInstalled) {
    return (
      <div className="rounded-md border border-[#9ec596] bg-[#f0f8ef] p-4 text-center text-[#237000]">
        <CheckCircle2 className="mx-auto" size={28} />
        <p className="mt-2 font-semibold">Uygulama zaten ana ekrandan açık</p>
        <Link
          className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[#237000] px-5 text-sm font-semibold text-white hover:bg-[#1f6500]"
          href="/"
        >
          Rezervasyona git
        </Link>
      </div>
    );
  }

  const nativeInstallAvailable = Boolean(deferredPrompt);

  return (
    <div>
      <button
        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-md bg-[#237000] px-4 text-base font-semibold text-white hover:bg-[#1f6500]"
        onClick={() => void installApp()}
        type="button"
      >
        <Download size={20} />
        Uygulamayı indir
      </button>

      <p className="mt-3 text-center text-sm leading-6 text-[#546257]">
        {nativeInstallAvailable
          ? "Cihazınızın güvenli uygulama kurulum penceresi açılacak."
          : "Düğmeye bastığınızda cihazınıza uygun kurulum adımları gösterilecek."}
      </p>

      {showInstructions ? (
        <div
          aria-live="polite"
          className="mt-5 rounded-md border border-[#cfc8b8] bg-[#f6f1e7] p-4 text-sm leading-6 text-[#34443a]"
        >
          <InstallInstructions browser={browser} platform={platform} />
        </div>
      ) : null}
    </div>
  );
}

function InstallInstructions({
  browser,
  platform,
}: {
  browser: BrowserFamily;
  platform: DevicePlatform;
}) {
  if (platform === "ios") {
    return (
      <ol className="grid gap-4">
        <li className="flex gap-3">
          <InstructionIcon>
            <Share2 size={18} />
          </InstructionIcon>
          <span>
            Tarayıcınızın <strong>Paylaş</strong> simgesine dokunun.
          </span>
        </li>
        <li className="flex gap-3">
          <InstructionIcon>
            <Download size={18} />
          </InstructionIcon>
          <span>
            Menüden <strong>Ana Ekrana Ekle</strong> seçeneğini seçin ve
            onaylayın.
          </span>
        </li>
      </ol>
    );
  }

  if (platform === "android") {
    return (
      <div className="flex gap-3">
        <InstructionIcon>
          <Menu size={18} />
        </InstructionIcon>
        <p>
          Tarayıcı menüsünü açıp <strong>Uygulamayı yükle</strong> veya{" "}
          <strong>Ana ekrana ekle</strong> seçeneğini seçin ve onaylayın.
        </p>
      </div>
    );
  }

  if (platform === "macos" && browser === "safari") {
    return (
      <div className="flex gap-3">
        <InstructionIcon>
          <MonitorDown size={18} />
        </InstructionIcon>
        <p>
          Safari menüsünden <strong>Dosya → Dock&apos;a Ekle</strong> seçeneğini
          kullanın ve onaylayın.
        </p>
      </div>
    );
  }

  if (browser === "firefox") {
    return (
      <div className="flex gap-3">
        <InstructionIcon>
          <MonitorDown size={18} />
        </InstructionIcon>
        <p>
          Masaüstü Firefox doğrudan uygulama kurulumunu desteklemiyor. Bu
          sayfayı Chrome, Edge veya macOS Safari ile açın.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <InstructionIcon>
        <MonitorDown size={18} />
      </InstructionIcon>
      <p>
        Tarayıcı menüsünden <strong>Uygulamayı yükle</strong> seçeneğini veya
        adres çubuğundaki kurulum simgesini kullanın ve onaylayın.
      </p>
    </div>
  );
}

function InstructionIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#f0f8ef] text-[#237000]">
      {children}
    </span>
  );
}
