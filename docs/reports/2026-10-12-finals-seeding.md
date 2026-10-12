# 29 Ekim final aşaması - 12 Ekim 2026

## Onaylanan sıralama

- Önce grup puanı. Eşit puanlı iki/üç (veya daha fazla) katılımcı için yalnızca o eşitlik kümesinin kendi aralarındaki maçları kullanılır.
- Bu mini tabloda alınan-verilen set farkı, ardından alınan-verilen oyun farkı karşılaştırılır. Aynı puandaki küme oyun karşılaştırması sırasında daraltılmaz.
- Tamamlanan maç tie-breaki bir set sayılır; oyun averajına hiç katılmaz. Normal set tie-breakinin sayıları ayrıca eklenmez, setin 7-6 oyun skoru kullanılır.
- Ret: yalnızca tamamlanan setler set averajına, oynanmış normal set oyunları oyun averajına girer. Hükmen sonuç için oynanmamış set/oyun uydurulmaz. Mevcut 3/1 ve hükmen 3/0 puan sistemi korunur.
- Erkek Orta gruplar arası birinci/ikinci sıralaması: puan, genel set farkı, genel oyun farkı. Çözülemeyen eşitlikte isim veya kayıt sırasıyla eleme yapılmaz.

## Canlı veri kontrolü

Supabase projesi `mwqqkojfboogusqczlxm`, turnuva `13350264-a44c-4c44-8213-4aef62e3fbb6`.
Güncel 148 kayıt: 6 iptal, 140 puanlanmış grup maçı, 2 sonucu girilmemiş grup maçı. İlk görüntüye göre yalnızca İleri Mix'teki İnan Özbakır / Zeynep Kürşat - Evrim Özcan / Gençay Üstünel maçının sonucu değişti; oyuncu adları ve diğer sonuçlar aynı kaldı.

Bekleyenler:

- Orta Mix: Haluk Sağun / Gizem Topuz - Ecem Güzelhisar / Özcan Günay.
- Erkek Orta: Cengiz Gültekin - Utku Ataman.

Sonuçlara bağlı yerler "Sonuç bekleniyor" olarak gösterilir. Kesinleşmiş yerler doldurulur; turu kesin olup tam sırası değişebilecek katılımcılar ayrı listelenir. Örneğin Erkek Orta'da İlker Doğaç, grup B ikincisi ve gruplar arası üçüncü ikinci olarak Playoff 1'de yer alır. Double İleri Erkek finali Mete Albeyoğlu / Ersin Başaran - Cenk Cömert / Haluk Sağun'dur.

### İleri Mix sonuç güncellemesi

Evrim Özcan / Gençay Üstünel, İnan Özbakır / Zeynep Kürşat'ı 6-1, 6-4 yendi. Grup sırası: Evrim/Gençay 15, Elif/Serkan 13, İnan/Zeynep 9, Ahmet/Naz 9, Esen/Kemal 9, Zeliha/Aydoğan 5 puan. Üçlü eşitlikte her çiftin kendi aralarında setleri 2-2; oyunlar İnan/Zeynep 20-19 (+1), Ahmet/Naz 18-18 (0), Esen/Kemal 19-20 (-1).

- Yarı final 1 (1-4): Evrim Özcan / Gençay Üstünel - Ahmet Ok / Naz Lale.
- Yarı final 2 (2-3): Elif Bora / Serkan İrden - İnan Özbakır / Zeynep Kürşat.
- Finaldeki iki yer, yarı final sonuçları henüz olmadığı için boş kaldı.
- Uygulama canlı sonuçlardan zaten hesaplıyor; sıralama kodunda veya veritabanında değişiklik gerekmiyor. Rapor/PDF güncellendi; mevcut React bileşeninin bu yeni veriyle her iki yarı finali doldurduğu test edildi.

## Uygulama ve PDF

- Puan Durumu ve Finaller aynı sıralama modülünü kullanır. İsimler kayıtlı oyuncu kimliklerinden çözülür; yeniden adlandırma ve sonuç değişiklikleri yansır.
- Finaller admin/super-admin görünürlüğünü korur. Şema rezervasyon oluşturmaz; playoff/yarı final kazananı henüz belirlenmeyen sonraki tur alanları boştur.
- Eksik/silinmiş/çift kaydedilmiş fikstür tam grup sayılmaz. Bekleyen maçlarda normal sonuç ve hükmen sonuç olasılıkları dikkate alınır; belirsiz yere isim atanmaz.
- PDF: 11 dikey sayfa, kategori başına bir sayfa, final yukarıda, 33 maç, 22 yukarı ok. Tarih/saat alanı, sağ üst tarih veya Şampiyon kutusu eklenmedi. 37 başlangıç yeri dolu, 7'si sonuç bekliyor.
- `apps/web/tests/fixtures/finals-2026-10-12.json` yalnızca hesap için gereken turnuva/oyuncu/grup/skor alanlarını içerir; kimlik doğrulama verisi içermez.
- İlk görüntü korunur. İleri Mix'teki tek maç güncellemesi `apps/web/tests/fixtures/finals-ileri-mix-result-2026-10-12.json` ile ayrıca uygulanır.
- PDF verisi `apps/web/scripts/export-tournament-finals.mjs` ile uygulamanın modüllerinden üretilir; Python tarafında ayrı sıralama hesabı yapılmaz.

Yeniden üretim (Node 24+, ReportLab):

```sh
node apps/web/scripts/export-tournament-finals.mjs apps/web/tests/fixtures/finals-2026-10-12.json docs/reports/2026-10-12-finals-seeding.json apps/web/tests/fixtures/finals-ileri-mix-result-2026-10-12.json
python3 scripts/generate-tournament-knockout-brackets.py --seeding docs/reports/2026-10-12-finals-seeding.json --output output/pdf/29-Ekim-Final-Tablolari-2026-10-12.pdf
```

## Doğrulama

- Testler: 117 geçti, 0 başarısız; ayrı gerçek PostgreSQL eşzamanlılık testi ortam gerektirdiğinden atlandı. Bu değişiklik veritabanına yazmıyor.
- Lint ve production build başarılı.
- PDF'nin 11 sayfası PNG olarak gözle incelendi; bütün atanmış isimlerin ilgili sayfalarda bulunması, dikey boyutlar ve kaldırılmış etiketlerin yokluğu ayrıca doğrulandı.
- İleri Mix güncellemesinde 11 sayfa yeniden çizdirildi: yalnızca 10. sayfanın görüntüsü değişti; diğer 10 sayfa önceki onaylı görüntülerle birebir aynı. Yeni 10. sayfa gözle ve sekiz oyuncu adının varlığıyla kontrol edildi.
- Gerçek React bileşeni production CSS ile yerel tarayıcıda açık/koyu tema ve masaüstü/mobil genişliklerde incelendi. Canlı admin oturumu kullanılmadı.
- Supabase şeması, skorlar ve rezervasyonlar değiştirilmedi.
