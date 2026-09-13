# 13 Eylül 21.00 maçının geri açılması

Kullanıcının yanlışlıkla iptal ettiği 29 Ekim Etkinliği maçı, aynı kayıt üzerinde
14 Eylül 2026 00.35.12 (Europe/Istanbul) tarihinde geri açıldı.

- Maç: Verda Akpınarlı – Ekin Akgün.
- Kimlik: `a5866241-c02a-4cb8-bf05-f5c94dc61ed7`.
- Program: 13 Eylül 2026, 21.00–22.30, Kort A; Kadın İleri, Grup A.
- Önceki durum: `canceled`, sonuç girilmemiş.
- Yeni durum: `completed`, `score_entered = true`, `is_retired = true`,
  `is_walkover = false`.
- Kazanan: Ekin Akgün, ilk sette 4–2 iken rakibin terk etmesiyle.
- Kayıttaki oyuncu sırası Verda–Ekin olduğu için tek set skoru `2–4 (Ret)`.
  Oynanmamış ikinci set eklenmedi.
- Bu maçın sıralama puanları: Ekin 3, Verda 1. Yarım set, kazanılmış tam set
  olarak sayılmaz.

## Güvenli uygulama ve doğrulama

Güncelleme Supabase SQL Editor'de yapıldı. Koşullar özgün maç ve turnuva
kimliklerini, iki katılımcı bağlantısını, kortu, başlangıç/bitişi, iptal durumunu,
sonuç girilmemiş olmasını ve önceki `updated_at` değerini birlikte kontrol etti.
Sorgu tam bir satır döndürdü. Yeni maç oluşturulmadı; saatler, kort, kategori,
grup, oyuncu bağlantıları ve kaynak kimliği değiştirilmedi.

`change_audit_log` kaydı `168` önceki iptali, `169` geri açma ve sonucu gösteriyor.
Geri açma kaydının değişen alanları yalnızca `is_retired`, `score_entered`,
`score_sets`, `status`, `winner_entry_id`. SQL Editor işlemi, uygulama kullanıcısı
taklit edilmeden, `actor_source = database`, `database_session_user = postgres`
olarak kaydedildi. Canlı kayıt ve audit sonucu doğrulandı.

İlk sette terk formu düzeltmesi önceki `7b4b22f` commit'iyle yayınlandı:
62 test, lint, production build ve izole tarayıcıda tek set/boş ek set kaydetme
akışı başarılı. Bu işlem şema veya yetki değişikliği gerektirmedi.
