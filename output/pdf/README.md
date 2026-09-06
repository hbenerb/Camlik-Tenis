# 29 Ekim turnuva bülteni

## 6 Eylül 2026 sayısı

- Dosya: `29-Ekim-Turnuva-Bulteni-2026-09-06.pdf`
- Veri kesim zamanı: **6 Eylül 2026, 21.36 Türkiye saati** (`2026-09-06T18:36:14.422855Z`).
- Kaynak: Çamlık Tenis uygulamasının canlı Supabase turnuva kayıtları; salt okunur, tek sorguluk anlık görüntü.
- İçerik: 11 kategori, 18 grup, 66 farklı oyuncu, 80 tekler/takım kaydı ve sonucu girilmiş 34 maç.
- İlk 5 sayfa: tüm kategorilerde puan durumu. Sonraki 6 sayfa: tarih sırasıyla maç sonuçları.
- Sonucu girilmemiş 109 maç ve iptal edilmiş 3 maç puan hesabına dahil edilmez.
- Toplam: 136 grup puanı, 78 tamamlanmış set. Bir terk sonucu vardır; yarım kalan set averaja eklenmez.

Puan ve set hesapları `apps/web/src/lib/tournament-scoring.ts` içindeki üretim fonksiyonlarıyla yapılır. Oyuncu adları maçtaki eski metinlerden değil, güncel oyuncu/takım referanslarından alınır. Sıralama puan, set farkı, kazanılan set ve mevcut kayıt sırasını izler.

## Yeniden üretim

`scripts/generate-tournament-bulletin.py` bir salt okunur JSON anlık görüntüsü kabul eder. Girdi alanları: `as_of`, `tournament`, `categories`, `groups`, `players`, `entries`, `entry_players`, `matches`. Adları aynı olan Supabase turnuva tablolarının kayıtları kullanılır; maçlara `court_name` eklenir. Profil bilgileri, iletişim bilgileri ve kimlik doğrulama verileri alınmaz. Ham anlık görüntü ve kontrol görselleri Git'e eklenmez.

```sh
python3 scripts/generate-tournament-bulletin.py snapshot.json output/pdf/29-Ekim-Turnuva-Bulteni-YYYY-MM-DD.pdf
```

Gereksinimler: ReportLab, Node.js 24+, Arial/Arial Bold/Georgia Bold TTF fontları. `BULLETIN_NODE` Node yolunu, `BULLETIN_FONT_DIR` font klasörünü değiştirebilir. Düzen mevcut 11 kategori için hazırlanmıştır; kategori yapısı değişirse betik sessizce kategori atlamaz, sayfalamanın gözden geçirilmesini ister.

Doğrulama: uygulamanın 10 skor testi geçti; her kayıtlı skor doğrulandı; 11 PDF sayfası PNG'ye çevrilerek incelendi. Metin çıkarımıyla bütün kategori ve oyuncu isimleri, 18 grup başlığı ve 34 benzersiz sonuç kontrol edildi; sayfa dışına çıkan karakter bulunmadı.

Bu PDF tarihli bir arşiv sayısıdır; canlı uygulama verileri değiştiğinde kendiliğinden yenilenmez. Uygulama davranışı veya veritabanı bu çalışma sırasında değiştirilmemiştir.
