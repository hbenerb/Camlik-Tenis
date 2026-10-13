# 29 Ekim finaller güncellemesi — 13 Ekim 2026

## Güncel kaynak ve PDF

- Canlı turnuva: `13350264-a44c-4c44-8213-4aef62e3fbb6`.
- 149 maç kaydı: 6 iptal, 141 sonuç girilmiş grup maçı, 1 bekleyen grup maçı ve 1 planlanmış eleme maçı.
- Bekleyen tek grup maçı Orta Mix'te Haluk Sağun / Gizem Topuz – Ecem Güzelhisar / Özcan Günay. Bu sonuca bağlı final yerleri beklemede bırakıldı.
- Erkek Orta güncellendi: grup birincileri Mehmet Yiğit, Utku Ataman, Hüseyin Kahraman; ikinciler Özcan Günay, Cengiz Gültekin, İlker Doğaç. En iyi ikinci Özcan Günay ilk playoff turunu pas geçiyor.
- Kaynak görüntüsü: `apps/web/tests/fixtures/finals-2026-10-13.json`; uygulamanın ortak hesaplamasından üretilen tablo: `docs/reports/2026-10-13-finals-seeding.json`.
- PDF: `output/pdf/29-Ekim-Final-Tablolari-2026-10-13.pdf` — 11 dikey sayfa, 33 maç, 22 yukarı yönlü bağlantı. Önceki belgeyle görsel karşılaştırmada sadece Erkek Orta sayfası değişti. 54 isim görünümü metin çıkarımıyla doğrulandı.

## Grup / Tur ve otomatik ilerleme

- Yeni rezervasyon ve turnuva maçı düzenleme ekranlarında Grup / Tur alanına Playoff, Çeyrek Final, Yarı Final ve Final eklendi.
- İkinci seçim, kaydı kategorinin belirli tablo maçına bağlar (ör. Yarı final 1). Kesinleşen oyuncular buradan alınır; farklı oyuncularla kayıt reddedilir. Henüz kesinleşmeyen üst tur için sonuç uydurulmaz.
- Playoff ve Çeyrek Final, Erkek Master/İleri şemalarında aynı onaylı ilk tur yuvalarını kullanır; ilave bir tur oluşturulmaz. Erkek Orta'nın Playoff 1 → Playoff 2 → yarı final akışı korunur.
- Bağlı, tamamlanmış ve geçerli normal/hükmen/terk sonucu kazananı bir üst yuvaya taşır. Grup puan durumu eleme maçlarını içermez.
- Sonuç düzeltme, silme veya iptalde tablo kaynak sonuçlardan yeniden hesaplanır. Artık yanlış oyunculara ait kalan alt/üst tur kayıtları ilerletilmez; admin uyarılır. Mevcut rezervasyonların günü, saati, kortu veya skoru otomatik değiştirilmez.
- Eski genel `final` türüyle kaydedilmiş Zeliha Aysan – Evrim Özcan maçı, admin düzenleyicisi açıldığında Kadın İleri Yarı final 1 olarak önerilir; yalnızca admin kaydederse bağlantı kalıcı olur. Otomatik veri düzeltmesi yapılmadı.
- Finaller görünümü adminlerle sınırlı kalır. Diğer turnuva/kategorilerde onaylı şema yoksa bu açıkça belirtilir; eşleşme sistemi tahmin edilmez.

## Veritabanı ve kontroller

- Canlıya uygulanan migration: `20261013084427_tournament_knockout_round_links.sql`.
- Yeni nullable `bracket_match_id`; tur/yuvanın tutarlılığı, aynı kategoriden iki farklı katılımcı ve iptal edilmemiş kayıtlar arasında tek yuva/maç kuralı veritabanında korunur.
- Mevcut RLS politikaları ve admin yazma yetkileri korundu. Grup değişikliği tetikleyicisinin eleme maçına grup ataması engellendi.
- Migration sonrası 149 maç ve 0 otomatik bağlantı doğrulandı; mevcut maçlar değiştirilmedi.
- Otomatik testler: 128 test, 127 geçti, 1 mevcut koşullu test atlandı. Normal galibiyet, hükmen, ilk sette terk, iki aşamalı playoff, sonuç düzeltme/iptal, ters oyuncu sırası, yanlış bağlantı ve RLS kontrolleri dahil.
- Üretim derlemesi ve lint başarılı. Canlı veriye yazmayan yerel harness'te gerçek bileşenlerle 11 kategori × 4 genişlik (320/375/640/1280) × açık/koyu tema = 88 görünüm kontrol edildi; 80 görünümde üç setli skor gösterildi. Taşma veya isim/skor çakışması yok. Eksik Orta Mix sonucu ilerletilmedi. Çeyrek final → yarı final → final geçişi etkileşimli olarak da doğrulandı.
- Supabase güvenlik danışmanı önce/sonra aynı eski uyarıları verdi; bu değişiklik yeni uyarı eklemedi. Kapsam dışı mevcut uyarılar: mutable search path, public extension, eski security-definer RPC izinleri ve leaked-password protection.

İlgili eski uyarıların giderme belgeleri: [search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [extension](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [anon RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
