# 29 Ekim — Orta Mix yeni çift ve maç programı

## Uygulanan işlem

Kullanıcının talebiyle 24 Eylül 2026, 10:53:43 (Europe/Istanbul) tarihinde
production veritabanında uygulandı. Uygulama kodu, şema veya yetki değişikliği yoktur.
İşlem betiği: [2026-09-24-orta-mix-comert.sql](2026-09-24-orta-mix-comert.sql).

- Turnuva: 29 Ekim Etkinliği (`13350264-a44c-4c44-8213-4aef62e3fbb6`).
- Kategori: Orta Mix (`05258045-f117-4b65-aa5b-dd5db6845944`).
- Grup: A (`95b0f665-7185-4fea-8736-9b16a80d0f77`).
- Yeni çift: Cenk Cömert / Ayşe Cömert, grup sırası 5.
- Yeni takım kaydı: `1b0cd41a-c9eb-4aeb-bb71-8af743d13d8f`.
- Cenk'in mevcut oyuncu kaydı kullanıldı: `6a8225bc-606b-45ba-8ae1-f1fb7b2e694b` (takım pozisyonu 1).
- Ayşe'nin mevcut oyuncu kaydı kullanıldı: `15c9943e-bef1-47e9-a91f-19f5870c5a48` (takım pozisyonu 2).
- Yeni oyuncu kopyası oluşturulmadı. Diğer kategorilerdeki oyuncu referansları korundu.
- Kategorinin `group_size` değeri 4'ten 5'e çıkarıldı; grup sayısı 1 kaldı.

## Eklenen maçlar

Aşağıdaki tüm maçlarda yeni çift Cenk Cömert / Ayşe Cömert'tir.
Saatler Türkiye saatidir (UTC+03:00). Maç süresi 90 dakikadır.

| Tarih | Saat | Kort | Rakip | Maç kaydı |
| --- | --- | --- | --- | --- |
| 28 Eylül 2026 Pazartesi | 18:00–19:30 | B | Baru Harsa / Işın Reisoğlu | `6eb68c87-e884-4d6f-8749-b6fcb1351dba` |
| 1 Ekim 2026 Perşembe | 19:30–21:00 | A | Haluk Sağun / Gizem Topuz | `1e4bc9c3-f3d2-4ac8-89bf-809806cc95ff` |
| 5 Ekim 2026 Pazartesi | 19:30–21:00 | A | Ecem Güzelhisar / Özcan Günay | `06c644c3-98c2-424c-a59c-0860fa902fab` |
| 8 Ekim 2026 Perşembe | 18:00–19:30 | A | Çağla Bozkurt / Bener Bozkurt | `3c6c09a1-597f-481b-a2b0-496e51ed5412` |

28 Eylül–4 Ekim haftasına iki, 5–11 Ekim haftasına iki maç yerleştirildi.
Kort A önceliğiyle iki maç 19:30'a alındı; ilk haftada Kort A'nın 18:00
dilimleri dolu olduğundan bir maç Kort B'ye kondu. Mevcut maçlar taşınmadı.
Turnuvanın mevcut kort izinleri ve 90 dakikalık süre ayarı değiştirilmedi.
Yeni maçların durumu `scheduled`; skor girilmedi.

## Doğrulama

- İşlem öncesinde ve işlem içinde kort, oyuncu ve mevcut rezervasyon çakışmaları kontrol edildi.
- Kısa, süre sınırları olan tek transaction kullanıldı; hata halinde tüm işlem geri alınacak şekilde uygulandı.
- Mevcut turnuva maçlarının tüm alanları işlem öncesi/sonrası karşılaştırıldı ve değişmediği doğrulandı.
- Grup artık 5 çift ve 10 iptal edilmemiş grup maçı içeriyor; her çift eşleşmesi tam bir kez mevcut.
- Önceden iptal edilmiş maç kaydı silinmedi veya yeniden etkinleştirilmedi.
- Kayıttan sonra bağımsız bağlantıyla dört maçın isimleri, tarihleri, süreleri, kortları ve oyuncu referansları okundu.
- Yeni maçlar için kort çakışması 0, onaylı rezervasyon çakışması 0, oyuncu maç çakışması 0.
- Bu kontrol yalnızca yeni maçların çakışmalarını doğrular; tüm turnuva programının yeniden düzenlenmesi değildir.

## Değişiklik geçmişi

Supabase SQL Editor üzerinden, kullanıcının açtığı oturumda uygulandı.
Veritabanı audit kaydı işlem kaynağını doğru şekilde `database`, oturum kullanıcısını
`postgres` olarak tutar; bir uygulama kullanıcısı taklit edilmedi.

- Transaction: `50770`.
- Audit kayıtları: `607`–`614` (toplam 8).
- 1 takım ekleme, 2 oyuncu bağlantısı ekleme, 1 kategori kapasitesi güncelleme, 4 maç ekleme.
- Kategori güncellemesindeki tek değişen alan: `group_size`.

Betik tekrar uygulanmak üzere tasarlanmamıştır: mevcut dört takımlı başlangıç
durumu artık sağlanmadığı için tekrar çalıştırma güvenli biçimde hata verir.
