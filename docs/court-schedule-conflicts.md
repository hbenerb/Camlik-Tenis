# Kort / saat çakışma koruması

8 Ekim 2026 düzeltmesi: aynı kortta kesişen zaman aralıkları kayıt sırasında
veritabanında engellenir. Sadece yeni maç formuna bağlı değildir.

- Yeni kayıt, tarih/saat/kort değişikliği, iptali geri alma, turnuva değişikliği,
  toplu güncelleme ve turnuvanın maç süresini değiştirme kontrol edilir.
- İptal edilmeyen turnuva maçları birbirleriyle çakışamaz. Tamamlanan maçlar da
  kendi zaman aralıklarını korur; geçmiş kayıt düzenlemeleri de kontrol edilir.
- Aktif turnuva maçları ile onaylı normal rezervasyonlar/dersler birbirini engeller.
  Önceki davranış korunur: pasif turnuva, normal rezervasyonlara karşı taslaktır;
  aktif yapılırken tüm program tekrar kontrol edilir.
- Bitiş ve başlangıç aynıysa çakışma yoktur: 14:00–15:30 ve 15:30–17:00 uygundur.
- Oyuncu adı/skor gibi kortun doluluk aralığını değiştirmeyen güncellemeler,
  önceden var olan çakışmalar yüzünden engellenmez. Eski çakışmalar otomatik taşınmaz.
- Bu koruma kort doluluğu içindir; farklı kortlardaki aynı oyuncunun müsaitliği
  ayrı bir kuraldır.

## Eşzamanlı işlemler ve yetkiler

`private.court_schedule_write_guard` üzerindeki tek satır, rezervasyon, turnuva maçı
ve turnuva yazma işlemlerini işlem başında sıraya alır. Bu küçük kulüpte kısa
işlemler için bilinçli olarak ortak kilit kullanılır; farklı kayıtları aynı anda
değiştiren yöneticiler ve farklı tablolara yazan işlemler birbirini atlayamaz.
Gerçek satır güncellemesi, REPEATABLE READ / SERIALIZABLE altında eski veri görünümünü
kullanan yazma işlemini de iptal eder. READ COMMITTED denetimleri VOLATILE tetikleyici
ile yeni görünüm alır. AFTER kontrolleri son süreyi ve toplu işlemin son halini görür.

Yardımcı tablo ve fonksiyonlar özel şemada, API rollerine kapalıdır. Yetkiler ve
değişiklik geçmişi korunur. SECURITY DEFINER yalnızca RLS'nin gizlediği dolulukları
da kontrol etmek için kullanılır; hata mesajları oyuncu/üye bilgisi açıklamaz.

## Testler

`npm test`: gerçek gömülü PostgreSQL (PGlite) ile tüm yazma yolları, RLS ve mevcut
çakışmaların korunması; ayrıca tarayıcı ön kontrolü testleri.

İki bağımsız PostgreSQL bağlantısı testi, yalnızca yeni/geçici bir Docker PostgreSQL
17 konteynerinde çalıştırılır (üretime bağlanmaz):

```sh
COURT_SCHEDULE_TEST_CONTAINER=<gecici-konteyner> \
COURT_SCHEDULE_DOCKER=<docker-yolu> \
node --test tests/court-schedule-concurrency.test.mjs
```

## Canlı veri taraması

8 Ekim 2026: tüm tarihlerdeki 142 iptal edilmemiş turnuva maçı ve 664 onaylı
rezervasyon karşılaştırıldı. Yalnızca iki çakışan çift bulundu: 10 Ekim Kort A,
14:00–15:30 ve 18:00–19:30. Geçmişte veya diğer günlerde ek çakışma bulunmadı.
Bu düzeltme hiçbir maçın tarihini, saatini, kortunu veya sonucunu değiştirmez.

İnceleme devam ederken 13:26'da Bener Bozkurt hesabı 14:00'teki
Evrim–Gençay / Esen–Kemal maçını 12:00'ye taşıdı (denetim kaydı 1149).
Bu kullanıcı değişikliği korundu; sonraki taramada yalnızca 18:00 çakışması kaldı.
13:29'da aynı hesap İnan–Zeynep / Evrim–Gençay maçını 18:00'den 10:00'a taşıdı
(denetim kaydı 1164). Son taramada 142 maç ve 664 rezervasyon arasında **0 çakışma** var.

Canlı veritabanında yedi geri alınan deneme doğrulandı: tam/kısmi kesişen saate
taşıma, iptali geri alma, çakışan maç ekleme, rezervasyon taşıma, turnuva süresini
uzatma ve turnuvayı yeniden aktifleştirme reddedildi. Denemelerin maç verileri ve
denetim geçmişinde kalıcı değişiklik bırakmadığı kontrol edildi.
