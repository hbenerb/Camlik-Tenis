# 29 Ekim - İsimsiz eleme tabloları

8 Ekim 2026 tarihli kullanıcı talebine ve aynı konuşmadaki eşleşme onayına göre
hazırlanmıştır. Uygulamada maç oluşturulmadı; turnuva verisi veya kuralları
değiştirilmedi. Supabase'den yalnız kategori/grup yapısı okundu.

## Teslim

- PDF: `output/pdf/29-Ekim-Eleme-Tablolari-2026-10-08.pdf`
- Kaynak: `scripts/generate-tournament-knockout-brackets.py`
- 11 kategori, 11 yatay A4 sayfa; her kategori ayrı sayfada.
- Oyuncu adı yok. Grup/sıra etiketleri, maçlar arasındaki bağlantılar ve
  elle doldurulabilecek tarih, saat ve skor alanları var.

## Eşleşme kuralları

- Erkek Master ve Erkek İleri: ÇF1 B2-A3, ÇF2 A2-B3. A1 doğrudan YF1'de
  ÇF1 galibini, B1 doğrudan YF2'de ÇF2 galibini bekler (BYE).
- Kadın İleri, Yeni Başlayan Kadın, Double Master Erkek: A1-B2 ve B1-A2.
- Erkek Orta: üç grup birincisi doğrudan yarı finalde. Üç ikinci kendi aralarında
  puana göre sıralanır; 2. ve 3. sıradaki ikinciler E1'i oynar. E1 galibi en
  yüksek puanlı ikinciyle E2'yi oynar. Grup birincileri de kendi aralarında
  puana göre sıralanır: en yüksek puanlı birinci E2 galibiyle; diğer iki birinci
  birbiriyle yarı final oynar. Bu yerleşim kullanıcı tarafından ayrıca onaylandı.
- İleri Mix tek grupludur; kullanıcının onayıyla 1-4 ve 2-3 yarı final oynar.
- Kadın Orta, Double İleri Erkek, Orta Mix, Double Kadın: grup 1.'si - 2.'si finali.
- Puan eşitliğinde önceki kullanıcı kuralı olan set averajı esas alınır;
  bu da eşitse kesin sıralama ayrıca kararlaştırılmalıdır.

## Maç sayıları

| Kategori | Çeyrek final | Özel eleme | Yarı final | Final | Toplam |
| --- | ---: | ---: | ---: | ---: | ---: |
| Erkek Master | 2 | 0 | 2 | 1 | 5 |
| Erkek İleri | 2 | 0 | 2 | 1 | 5 |
| Kadın İleri | 0 | 0 | 2 | 1 | 3 |
| Kadın Orta | 0 | 0 | 0 | 1 | 1 |
| Erkek Orta | 0 | 2 | 2 | 1 | 5 |
| Yeni Başlayan Kadın | 0 | 0 | 2 | 1 | 3 |
| Double Master Erkek | 0 | 0 | 2 | 1 | 3 |
| Double İleri Erkek | 0 | 0 | 0 | 1 | 1 |
| Orta Mix | 0 | 0 | 0 | 1 | 1 |
| İleri Mix | 0 | 0 | 2 | 1 | 3 |
| Double Kadın | 0 | 0 | 0 | 1 | 1 |
| **Toplam** | **4** | **2** | **14** | **11** | **31** |

Grup aşaması ve üçüncülük maçları dahil değildir. BYE bir maç olarak sayılmaz.

## Doğrulama

- 8 Ekim'de canlı kategoriler ve gruplar doğrulandı: 11 kategori, 18 grup.
- PDF'nin 11 sayfası PNG'ye çevrilip tek tek görsel olarak incelendi.
- Her sayfanın kategori başlığı, sayfa numarası, maç sayısı ve maç kutusu sayısı
  metin çıkarımıyla doğrulandı; toplam 31 maç kutusu var.
- Önceki oyuncu listesi yalnız kişisel isim bulunmadığını denetlemek için
  kullanıldı; PDF'de eşleşen oyuncu adı yok. Güncel sıralamalar hesaplanmadı.
- Türkçe karakterler, taşma ve satır kırımları kontrol edildi.

## Yeniden üretim

ReportLab yüklü Python ve macOS Arial fontlarıyla:

```sh
python3 scripts/generate-tournament-knockout-brackets.py --orta-seeding points --mapping cross
```

Önceki tarihli raporlar/PDF'ler tarihsel belge olarak korundu.
