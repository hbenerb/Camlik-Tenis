# Admin lig taslağı

2026–2027 sezonu Kasım 2026–Ekim 2027 arasındaki 12 ayı kapsar. Mavi **Lig** butonu ve bütün lig verileri yalnızca `admin` ve `super_admin` hesaplarına açıktır.

| Kategori | Katılımcı/çift | İlk grup büyüklükleri | Yıllık maç |
| --- | ---: | --- | ---: |
| Erkek | 32 | 8, 8, 8, 8 | 192 |
| Kadın | 22 | 8, 8, 6 | 132 |
| Double Kadın | 4 | 4 | 24 |
| Double Erkek | 12 | 6, 6 | 72 |
| Double Mix | 10 | 10 | 60 |

İlk kopya 16 Ekim 2026 tarihinde 29 Ekim Etkinliği'nden alındı. Sıralama önce seviyeyi, sonra turnuvadaki grup sırasını, puanı, set ve oyun averajını kullanır. Çiftler mevcut oyuncu referanslarıyla korunur. Sonraki turnuva değişiklikleri kayıtlı lig taslağını güncellemez.

Sıralama ardışık gruplara bölünür. Grup 1 toplam grup sayısı kadar puanla başlar; her alt grupta bir puan azalır. Adminler sırayı ve 4/6/8/10 kişilik grup kapasitelerini değiştirebilir. Kapasiteler katılımcı toplamına eşit olmalıdır. Her katılımcı/çift ayda bir maç yapar; grup içindeki bütün rakipler bitince rövanş döngüsü başlar. Taslakta skor, kort veya saat ataması bulunmaz.

## Veri erişimi ve kayıt

- `league_drafts` sezonu, kaynak kopyalama tarihini ve revizyonu saklar; `league_draft_categories` beş kategori kopyasını saklar. Her iki tabloda admin RLS politikaları vardır; misafire tablo veya RPC izni verilmez.
- `read_league_draft(p_id)` tek bir veritabanı anlık görüntüsünden başlık ve kategorileri birlikte okur.
- `save_league_draft(p_id, p_expected_revision, p_categories)` kaynak katılımcıları/partnerleri korur, grupları doğrular, 12 aylık fikstürü yeniden üretir ve bütün kategorileri tek işlemde kaydeder. Eski revizyon `40001` hatasıyla reddedilir.
- Kaydetme/yükleme hataları yerel düzenlemeleri korur. Hesap değişikliği veya çıkışta özel lig durumu temizlenir.

## İlk kopyayı hazırlama

Şema `20261016160834_admin_league_draft.sql` migration'ındadır. Aşağıdaki komut yalnızca kaynak turnuvayı okur, SQL ve inceleme kopyası üretir:

```sh
cd apps/web
node --env-file=.env.local scripts/prepare-league-seed.mjs /tmp/league-seed.sql /tmp/league-snapshot.json
```

Çıktı yeni dosya yolları gerektirir. SQL mevcut sezon kaydı varsa hata verir; admin düzenlemelerini değiştirmez. İlk kurulumda SQL, migration sonrasında yönetici tarafından transaction içinde uygulanır.

## Doğrulama

`npm test`, `npm run lint` ve `npm run build` kullanılır. Lig testleri sıralama/partner korumasını, aylık eşleşme kurallarını, SQL/TypeScript fikstür eşitliğini, RLS erişimini, atomik kaydı ve revizyon çatışmalarını kapsar. Tarayıcı kontrollerinde tam uygulama üzerinden admin/süper admin, üye/misafir, kayıt/yükleme hataları, ay/grup filtreleri ve 320/390/1280 pikselde açık/koyu tema doğrulandı; tarayıcı etkileşim testlerinde Supabase yanıtları taklit edildi. Canlı misafir veri ve RPC isteklerinin reddedildiği ayrıca doğrulandı.
