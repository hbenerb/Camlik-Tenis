import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PwaDownloadPanel } from "@/components/pwa-download-panel";

export const metadata: Metadata = {
  title: "Uygulamayı İndir | Ayvalık Çamlık Tenis",
  description:
    "Ayvalık Çamlık Tenis Kulübü rezervasyon uygulamasını cihazınıza yükleyin.",
};

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-6 text-[#17211c] sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link
          className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-semibold text-[#546257] hover:bg-[#eee9dd]"
          href="/"
        >
          <ChevronLeft size={18} />
          Ana sayfa
        </Link>

        <header className="mt-5 text-center">
          <Image
            alt="Ayvalık Çamlık Tenis Kulübü"
            className="mx-auto size-36 object-contain sm:size-40"
            height={160}
            priority
            src="/tenis-logo.png"
            width={160}
          />
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-[#237000]">
            Çamlık Tenis
          </h1>
          <p className="mt-2 text-lg font-medium text-[#546257]">
            Rezervasyon uygulaması
          </p>
        </header>

        <section className="mt-7 rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-5 shadow-sm sm:p-6">
          <h2 className="text-center text-xl font-semibold">
            Cihazınıza yükleyin
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-[#546257]">
            Kurulum tamamlandığında uygulama simgesi ana ekranınızda görünür
            ve doğrudan rezervasyon sayfasını açar.
          </p>

          <div className="mt-5">
            <PwaDownloadPanel />
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-[#68756b]">
          Kurulum, kullandığınız cihazın ve tarayıcının güvenli onay ekranı
          üzerinden tamamlanır.
        </p>
      </div>
    </main>
  );
}
