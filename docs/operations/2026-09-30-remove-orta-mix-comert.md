# 29 Ekim — Cenk Cömert / Ayşe Cömert Orta Mix kaydının kaldırılması

## Uygulanan işlem

Kullanıcının talebiyle 30 Eylül 2026 saat 10:52:01 (Europe/Istanbul) tarihinde
production Supabase veritabanında uygulandı.
Betik: [2026-09-30-remove-orta-mix-comert.sql](2026-09-30-remove-orta-mix-comert.sql).

- Turnuva: 29 Ekim Etkinliği (`13350264-a44c-4c44-8213-4aef62e3fbb6`).
- Kategori: Orta Mix (`05258045-f117-4b65-aa5b-dd5db6845944`), Grup A.
- Kaldırılan takım: `1b0cd41a-c9eb-4aeb-bb71-8af743d13d8f`.
- Takımın dört maçı önce iptal edildi, ardından aktif maç tablosundan kaldırıldı.
- Takım kaydı ve iki oyuncu bağlantısı kaldırıldı; kategori kapasitesi 5'ten 4'e döndü.
- Cenk ve Ayşe'nin ortak oyuncu kayıtları silinmedi. Cenk'in Erkek İleri ve
  Double İleri Erkek katılımları ile bu kategorilerdeki maçları korundu.
- Normal rezervasyonlar, diğer maçlar, skorlar, şema ve yetkiler değiştirilmedi.

## Takvimden kaldırılan maçlar

Aşağıdaki tarihler silme anındaki canlı programdır. Tüm maçlar Kort A'daydı;
hiçbirine skor girilmemişti. Saatler Türkiye saatidir.

| Tarih | Saat | Rakip | Maç kaydı |
| --- | --- | --- | --- |
| 1 Ekim 2026 | 19:30–21:00 | Haluk Sağun / Gizem Topuz | `1e4bc9c3-f3d2-4ac8-89bf-809806cc95ff` |
| 5 Ekim 2026 | 19:30–21:00 | Ecem Güzelhisar / Özcan Günay | `06c644c3-98c2-424c-a59c-0860fa902fab` |
| 8 Ekim 2026 | 18:00–19:30 | Çağla Bozkurt / Bener Bozkurt | `3c6c09a1-597f-481b-a2b0-496e51ed5412` |
| 12 Ekim 2026 | 16:00–17:30 | Baru Harsa / Işın Reisoğlu | `6eb68c87-e884-4d6f-8749-b6fcb1351dba` |

Son maç, ilk ekleme programındaki 28 Eylül tarihinden daha önce 12 Ekim'e
taşınmıştı; kaldırma işleminde güncel kayıt esas alındı.

## Geçmiş ve geri alma

- Transaction: `56111`.
- Değişiklik geçmişi kayıtları: `826`–`837`, toplam 12 kayıt.
- 4 iptal güncellemesi, 4 maç silme, 1 takım silme, 2 oyuncu bağlantısı silme,
  1 kategori kapasitesi güncellemesi.
- Kaynak `database`, oturum kullanıcısı `postgres`; uygulama kullanıcısı taklit edilmedi.
- Maçların önceki tam verileri, takım ve oyuncu bağlantıları `change_audit_log`
  içindeki `old_data` alanlarında korunuyor. Gerektiğinde yetkili veritabanı
  işlemiyle geri yüklenebilir; uygulamada tek tıklamalı geri alma yoktur.
- Maç bağlantıları `ON DELETE RESTRICT` olduğundan, takım kaldırılmadan önce
  maçlar geçmişe kaydedilerek silindi. Trigger veya kısıt devre dışı bırakılmadı.

## Doğrulama

- İşlem kısa, süre sınırları olan tek transaction içinde tamamlandı.
- Hedef dışındaki bütün maçlar, takım kayıtları, oyuncu bağlantıları ve ortak
  oyuncu kayıtları işlem öncesi/sonrası karşılaştırıldı; hiçbir değişiklik yok.
- Bağımsız canlı sorgu: Orta Mix 4 çift, 6 iptal edilmemiş grup maçı, kapasite 4.
- Hedef çifte ait Orta Mix maç kaydı: 0. Takım ve iki bağlantısı: kaldırıldı.
- Cenk'in diğer iki kategori katılımı ve her iki ortak oyuncu kaydı: mevcut.
- Genel takvim ve turnuva takvimi verilerini `tournament_matches` üzerinden
  aldığından kaldırılan dört kayıt iki takvimde de yer almaz.

Bu betik tekrar çalıştırılmak için tasarlanmamıştır; beklenen başlangıç durumu
yoksa tüm işlemi hata vererek durdurur. Tarihli eski PDF/raporlar tarihsel belge
olarak korunmuştur; bu işlem onları yeniden üretmez.
