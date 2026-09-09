# Rezervasyon ve turnuva değişiklik geçmişi

Bu özellik migration uygulandıktan sonraki **başarılı ve kalıcı** işlemleri `public.change_audit_log` tablosuna otomatik kaydeder. Önceki `updated_at` değerlerinden geçmiş olaylar üretilmez. Mevcut bir kayıt ilk kez değiştirildiğinde değişiklik öncesindeki tam hali de saklanır.

## Kapsam

- Tüm rezervasyon türleri: tekler, çiftler, ders ve özel notlu rezervasyonlar.
- Turnuvaların genel bilgileri ve kullanılan kortlar.
- Kategoriler, gruplar, ortak oyuncu listesi ve oyuncuların grup/takım yerleşimleri; eski katılımcı tablosu da kapsamdadır.
- Turnuva maçları: tarih, saat, kort, oyuncular, skorlar, Walk Over, terk, durum, oluşturma ve silme.
- Oyuncu adı/grup değişikliğinin başka kayıtlara otomatik yansıması ve ilişkili kayıt silmeleri.

Takip edilen tablolar: `reservations`, `tournaments`, `tournament_courts`, `tournament_categories`, `tournament_groups`, `tournament_participants`, `tournament_players`, `tournament_entries`, `tournament_entry_players`, `tournament_matches`.

## Kayıt içeriği

- `occurred_at`: veritabanının gerçek işlem zamanı (`timestamptz`); arayüz/sorgularda `Europe/Istanbul` ile gösterilir.
- `actor_user_id`, `actor_name`, `actor_app_role`, `actor_is_trainer`: işlemi yapan oturumun kullanıcı kimliği ve o andaki profil bilgileri. Rezervasyon sahibi veya istemciden gönderilen bir isim, işlemi yapan kişi sayılmaz. Sonradan isim değiştirilse veya hesap silinse bu kopya korunur.
- `actor_source`: kullanıcı işlemi `user`; kullanıcı kimliği olmayan servis işlemi `service_role`; doğrudan SQL/bakım işlemi `database`. Kimliği bulunmayan SQL işlemlerinde bir kişinin adı tahmin edilmez. `database_session_user` ve `request_role` ayrıca tutulur.
- `entity_table`, `record_key`: değişen tablo ve anahtarları. Birleşik anahtarlı kort/takım ilişkileri de tekil olarak tanımlanır.
- `operation`: `INSERT`, `UPDATE` veya `DELETE`. İptal, `status` alanının eski/yeni değeriyle görünür.
- `changed_fields`, `changes`: değişen alanlar ve her birinin `old`/`new` değerleri.
- `old_data`, `new_data`: satırın tam eski/yeni hali. Rezervasyon notundaki JSON metni değiştirilmeden saklanır; gerektiğinde alt alanlarına ayrıştırılabilir.
- `transaction_id`, `trigger_depth`: aynı veritabanı işleminde otomatik yayılan değişiklikleri ilişkilendirmek için. Tek bir ekrandan yapılan ayrı HTTP istekleri ayrı işlemlerdir; bunları aynı transaction sanmayın.

Sadece `updated_at` değişen, asıl verisi aynı kalan kaydetmeler olay üretmez. Yetkisi reddedilen, hata alan veya geri alınan işlemler kalıcı değişiklik geçmişine eklenmez. Bu tablo bir giriş denemesi/güvenlik erişim günlüğü değildir.

## Erişim ve koruma

Admin ve super adminler geçmişi okuyabilir; üyeler, eğitmenler ve misafirler okuyamaz. Uygulama rolleri (admin dahil) kayıt ekleyemez, değiştiremez veya silemez. Yazma yalnızca API'ye açılmayan `private.capture_change_audit` tetikleyicisi üzerinden gerçekleşir. Kısıtlı `SECURITY DEFINER` işlevi log yazımı içindir; kaynak tablo yetkilerini değiştirmez. JWT, erişim anahtarı, IP adresi veya ham istek başlıkları saklanmaz.

Kaynak kayıtlar veya kullanıcılar silindiğinde geçmiş silinmez; bu yüzden audit tablosunda kaynak tablolara foreign key yoktur. Geçmiş otomatik yaşlandırılıp silinmez. Gelecekte bir saklama politikası gerekirse açık bir ürün kararı ve ayrı migration yapılmalıdır.

`UPDATE`, `DELETE` ve `TRUNCATE` ile geçmişi değiştirme girişimleri ayrıca tetikleyiciyle engellenir. Takip edilen kaynak tablolarda `TRUNCATE` engellenmiştir; satır geçmişinin korunması için `DELETE` ve mevcut ilişki kuralları kullanılmalıdır. Veritabanı sahibi yine tetikleyiciyi kaldırabilecek ayrıcalığa sahiptir; bu dışarıdan imzalanmış/değiştirilemez bir arşiv değildir. Tetikleyicileri kapatan bakım çalışmaları kayıt zincirini bozar.

Bu sürüm veri toplama ve admin yetkili okuma altyapısını ekler; uygulamada ayrı bir geçmiş sekmesi eklemez.

## Bir maçın/rezervasyonun geçmişini inceleme

Parametreli sorguda `$1` kayıt UUID'sidir. Rezervasyon için tablo filtresini `reservations` yapın.

```sql
select id, occurred_at at time zone 'Europe/Istanbul' as tarih_saat,
       actor_name, actor_user_id, actor_source, operation,
       changed_fields, changes, old_data, new_data, transaction_id
from public.change_audit_log
where entity_table = 'tournament_matches'
  and record_key = jsonb_build_object('id', $1::uuid)
order by occurred_at, id;
```

Yalnızca gerçekten maç saatinin değiştiği olaylar için `operation = 'UPDATE' and changes ? 'starts_at'` koşulu eklenir. Böylece daha sonra girilen bir skoru saat değişikliği sanmayız. Bir işlemdeki bağlı olaylar `transaction_id` ile birlikte incelenir.

## Kontrol

`apps/web` altında `npm test`, `npm run lint`, `npm run build`. Audit testleri gerçek turnuva tablo tanımlarını ve ad/grup yayılım tetikleyicilerini yerel PostgreSQL ortamında kullanır. Canlı doğrulamada gerçek maçlarda deneme düzenlemesi yapılmaz; migration/tetikleyici/yetki kontrolleri ve `supabase/tests/change_history_smoke.sql` içindeki geri alınan izole test işlemleri kullanılır. Smoke test güvenilir veritabanı bağlantısında mevcut bir admin kimliğiyle yetkili uygulama isteğini taklit eder; gerçek kullanıcı hesabını değiştirmez ve tüm test verilerini geri alır. Sequence numaraları geri alınmadığından audit ID aralıklarında boşluklar normaldir.

Yeni bir turnuva/rezervasyon tablosu eklenirse audit kapsamına aynı migration içinde eklenmeli ve testteki tablo listesi güncellenmelidir.
