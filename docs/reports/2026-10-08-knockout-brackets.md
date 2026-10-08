# 29 Ekim - İsimsiz eleme tabloları

8 Ekim 2026 tarihli kullanıcı talebine ve aynı konuşmadaki eşleşme onayına göre
hazırlanmıştır. Uygulamada maç oluşturulmadı; turnuva verisi veya kuralları
değiştirilmedi. Supabase'den yalnız kategori/grup yapısı okundu.

## Teslim

- PDF: `output/pdf/29-Ekim-Eleme-Tablolari-2026-10-08.pdf`
- Kaynak: `scripts/generate-tournament-knockout-brackets.py`
- 11 kategori, 11 dikey A4 sayfa; her kategori ayrı sayfada.
- Oyuncu adı yok. Grup/sıra etiketleri, maçlar arasındaki bağlantılar ve
  elle doldurulabilecek skor alanları var. Tarih/saat alanları kaldırıldı.

### Dikey düzen revizyonu

- Eşleşmeler aynı boyutlu, iki tarafı yan yana gösteren sade tablolara yerleştirildi.
- Final tüm sayfalarda en üsttedir. Turlar aşağıdan yukarı ilerler; dik açılı
  oklar boş katılımcı hücrelerinin alt kenarına bağlanır.
- Şampiyon kutuları ve "YF1 galibi" gibi tekrar eden kazanan etiketleri kaldırıldı.
- Tablolarda A1/B2 gibi kısa etiketler kullanılır; açıklamalar sayfa altındadır.
- Erkek Orta için L1-L3 birincileri, İ1-İ3 ikincileri ifade eder. Her küme kendi
  içinde puana göre sıralıdır; 1 en yüksek puanı gösterir.
- Son revizyonda Kadın Orta, İleri Mix gibi 1-4 / 2-3 yarı finalleri ve finale
  geçirildi. Toplam 33 maç oldu; her kategoriye bir sayfa kuralı korundu.
- Çeyrek final ve özel eleme turları artık Playoff 1 / Playoff 2 olarak görünür.
- Harf/sayı açıklamaları ve Erkek Orta eşitlik dipnotu kaldırıldı.
  Erkek Orta'ya “En iyi ikinci ilk turu pas geçer” dipnotu eklendi.

## Eşleşme kuralları

- Erkek Master ve Erkek İleri: ÇF1 B2-A3, ÇF2 A2-B3. A1 doğrudan YF1'de
  ÇF1 galibini, B1 doğrudan YF2'de ÇF2 galibini bekler (BYE).
- Kadın İleri, Yeni Başlayan Kadın, Double Master Erkek: A1-B2 ve B1-A2.
- Erkek Orta: üç grup birincisi doğrudan yarı finalde. Üç ikinci kendi aralarında
  puana göre sıralanır; 2. ve 3. sıradaki ikinciler E1'i oynar. E1 galibi en
  yüksek puanlı ikinciyle E2'yi oynar. Grup birincileri de kendi aralarında
  puana göre sıralanır: en yüksek puanlı birinci E2 galibiyle; diğer iki birinci
  birbiriyle yarı final oynar. Bu yerleşim kullanıcı tarafından ayrıca onaylandı.
- İleri Mix ve Kadın Orta tek grupludur; kullanıcının onayıyla 1-4 ve 2-3 yarı
  final oynar. Kazananlar finalde karşılaşır.
- Double İleri Erkek, Orta Mix, Double Kadın: grup 1.'si - 2.'si finali.
- Puan eşitliğinde önceki kullanıcı kuralı olan set averajı esas alınır;
  bu da eşitse kesin sıralama ayrıca kararlaştırılmalıdır.

## Maç sayıları

| Kategori | Çeyrek final | Özel eleme | Yarı final | Final | Toplam |
| --- | ---: | ---: | ---: | ---: | ---: |
| Erkek Master | 2 | 0 | 2 | 1 | 5 |
| Erkek İleri | 2 | 0 | 2 | 1 | 5 |
| Kadın İleri | 0 | 0 | 2 | 1 | 3 |
| Kadın Orta | 0 | 0 | 2 | 1 | 3 |
| Erkek Orta | 0 | 2 | 2 | 1 | 5 |
| Yeni Başlayan Kadın | 0 | 0 | 2 | 1 | 3 |
| Double Master Erkek | 0 | 0 | 2 | 1 | 3 |
| Double İleri Erkek | 0 | 0 | 0 | 1 | 1 |
| Orta Mix | 0 | 0 | 0 | 1 | 1 |
| İleri Mix | 0 | 0 | 2 | 1 | 3 |
| Double Kadın | 0 | 0 | 0 | 1 | 1 |
| **Toplam** | **4** | **2** | **16** | **11** | **33** |

Grup aşaması ve üçüncülük maçları dahil değildir. BYE bir maç olarak sayılmaz.

## Doğrulama

- 8 Ekim'de canlı kategoriler ve gruplar doğrulandı: 11 kategori, 18 grup.
- PDF'nin 11 sayfası PNG'ye çevrilip tek tek görsel olarak incelendi.
- Her sayfanın kategori başlığı, sayfa numarası, maç sayısı ve maç kutusu sayısı
  metin çıkarımıyla doğrulandı; toplam 33 maç kutusu var.
- Önceki oyuncu listesi yalnız kişisel isim bulunmadığını denetlemek için
  kullanıldı; PDF'de eşleşen oyuncu adı yok. Güncel sıralamalar hesaplanmadı.
- Türkçe karakterler, taşma ve satır kırımları kontrol edildi.
- Dikey revizyonda 11 sayfanın tamamı yeniden görsel olarak kontrol edildi.
  33 maç tablosu, 22 ilerleme oku, boş kazanan hücreleri ve kaldırılan etiketler
  kaynak assertions/metin çıkarımıyla ayrıca doğrulandı.
- Son yön revizyonunda her finalin sayfanın en üst maç tablosu olduğu ve
  22 okun tamamının yukarı ilerlediği kaynak kontrolleriyle doğrulanır.
- Kadın Orta revizyonunda 4. sayfa yeniden görsel kontrol edildi; diğer
  10 sayfanın çizim içeriklerinin önceki sürümle aynı olduğu doğrulandı.

## Yeniden üretim

ReportLab yüklü Python ve macOS Arial fontlarıyla:

```sh
python3 scripts/generate-tournament-knockout-brackets.py --orta-seeding points --mapping cross
```

Önceki tarihli raporlar/PDF'ler tarihsel belge olarak korundu.
