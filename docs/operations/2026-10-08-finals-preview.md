# Turnuva Finaller sekmesi — admin ön izlemesi

## Kapsam

- Takvim ve Puan Durumu yanına Finaller eklendi.
- Sekme ve içeriği yalnız `admin` / `super_admin` profillerine gösterilir.
  Eğitmenlik veya rezervasyon yetkisi bu erişimi sağlamaz. Yetki kaldırıldığında
  açık içerik de gizlenir ve Takvim gösterilir.
- Puan Durumu ile aynı kategori seçimi korunur. Mobilde de iki sütunlu,
  finali üstte olan şema ve yukarı yönlü bağlantılar kullanılır.
- Oyuncu, takım, skor, tarih ve saat atanmaz. Kısa A1/B2/L1/İ1 kodları
  yalnız yerleşim açıklamalarıdır; mevcut puan tablosundan isim çekilmez.
- Yeni maç, rezervasyon, API, tablo veya migration oluşturulmadı.

## Şablonlar

Onaylanan PDF'deki 11 kategori / 31 maç / 20 bağlantı esas alınır.
Özel kurallar yalnız 29 Ekim turnuvası
`13350264-a44c-4c44-8213-4aef62e3fbb6` için geçerlidir. Diğer turnuva,
tanınmayan kategori veya değişmiş grup sayısı için şema uydurulmaz.

Erkek Master / İleri'de birinciler doğrudan yarı finale geçer. Erkek Orta'nın
iki aşamalı Playoff yolu ve en iyi birincinin bu yoldan gelenle eşleşmesi
korunur. İleri Mix'te tek gruptan 1–4 / 2–3 yarı final eşleşmesi vardır.

Son kullanıcı revizyonuyla uygulama ve PDF'de çeyrek final / eleme maçları
Playoff 1 / Playoff 2 olarak adlandırıldı. Genel harf/sayı açıklaması ve
Erkek Orta eşitlik dipnotu kaldırıldı; en iyi ikincinin ilk turu pas geçtiği
notu eklendi. PDF'de tarih/saat alanları da kaldırıldı. Bu metin değişiklikleri
mevcut grup puanlama veya eşitlik hesaplamasını değiştirmez.

## Doğrulama

- Şablon ve gerçek React bileşen testleri: kategori eşleşmeleri, boş alanlar,
  admin içerik/navigasyon koruması, yukarı oklar ve değiştirilmiş terimler.
- Tarayıcıda gerçek `TournamentDetailPanel`, geçici yerel test verisiyle:
  11 kategori seçimi, 320/390 px mobil ve 1280 px masaüstü, açık/koyu tema,
  kullanıcı/eğitmen erişimsizliği, admin/super-admin erişimi, sekme açıkken
  yetki kaybı ve Puan Durumu ile kategori seçiminin korunması doğrulandı.
- Geçici test sayfası yayına dahil edilmez; canlı verilerde test maçı yoktur.
- Güncellenen PDF'nin 11 sayfası görsel ve metin kontrollerinden geçirildi.
