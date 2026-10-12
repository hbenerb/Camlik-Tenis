# 29 Ekim final aşaması - 12 Ekim 2026

## Onaylanan sıralama

- Önce grup puanı. Eşit puanlı iki/üç (veya daha fazla) katılımcı için yalnızca o eşitlik kümesinin kendi aralarındaki maçları kullanılır.
- Bu mini tabloda alınan-verilen set farkı, ardından alınan-verilen oyun farkı karşılaştırılır. Aynı puandaki küme oyun karşılaştırması sırasında daraltılmaz.
- Tamamlanan maç tie-breaki bir set sayılır; oyun averajına hiç katılmaz. Normal set tie-breakinin sayıları ayrıca eklenmez, setin 7-6 oyun skoru kullanılır.
- Ret: yalnızca tamamlanan setler set averajına, oynanmış normal set oyunları oyun averajına girer. Hükmen sonuç için oynanmamış set/oyun uydurulmaz. Mevcut 3/1 ve hükmen 3/0 puan sistemi korunur.
- Erkek Orta gruplar arası birinci/ikinci sıralaması: puan, genel set farkı, genel oyun farkı. Çözülemeyen eşitlikte isim veya kayıt sırasıyla eleme yapılmaz.

## Canlı veri kontrolü

Supabase projesi `mwqqkojfboogusqczlxm`, turnuva `13350264-a44c-4c44-8213-4aef62e3fbb6`.
148 kayıt: 6 iptal, 139 puanlanmış grup maçı, 3 sonucu girilmemiş grup maçı. İş sonunda skorlar, kazananlar, katılımcı referansları ve oyuncu adları yeniden okunup ilk görüntüyle karşılaştırıldı; değişiklik yoktu.

Bekleyenler:

- Orta Mix: Haluk Sağun / Gizem Topuz - Ecem Güzelhisar / Özcan Günay.
- İleri Mix: İnan Özbakır / Zeynep Kürşat - Evrim Özcan / Gençay Üstünel.
- Erkek Orta: Cengiz Gültekin - Utku Ataman.

Sonuçlara bağlı yerler "Sonuç bekleniyor" olarak gösterilir. Kesinleşmiş yerler doldurulur; turu kesin olup tam sırası değişebilecek katılımcılar ayrı listelenir. Örneğin Erkek Orta'da İlker Doğaç, grup B ikincisi ve gruplar arası üçüncü ikinci olarak Playoff 1'de yer alır. Double İleri Erkek finali Mete Albeyoğlu / Ersin Başaran - Cenk Cömert / Haluk Sağun'dur.

## Uygulama ve PDF

- Puan Durumu ve Finaller aynı sıralama modülünü kullanır. İsimler kayıtlı oyuncu kimliklerinden çözülür; yeniden adlandırma ve sonuç değişiklikleri yansır.
- Finaller admin/super-admin görünürlüğünü korur. Şema rezervasyon oluşturmaz; playoff/yarı final kazananı henüz belirlenmeyen sonraki tur alanları boştur.
- Eksik/silinmiş/çift kaydedilmiş fikstür tam grup sayılmaz. Bekleyen maçlarda normal sonuç ve hükmen sonuç olasılıkları dikkate alınır; belirsiz yere isim atanmaz.
- PDF: 11 dikey sayfa, kategori başına bir sayfa, final yukarıda, 33 maç, 22 yukarı ok. Tarih/saat alanı, sağ üst tarih veya Şampiyon kutusu eklenmedi. 33 başlangıç yeri dolu, 11'i sonuç bekliyor.
- `apps/web/tests/fixtures/finals-2026-10-12.json` yalnızca hesap için gereken turnuva/oyuncu/grup/skor alanlarını içerir; kimlik doğrulama verisi içermez.
- PDF verisi `apps/web/scripts/export-tournament-finals.mjs` ile uygulamanın modüllerinden üretilir; Python tarafında ayrı sıralama hesabı yapılmaz.

Yeniden üretim (Node 24+, ReportLab):

```sh
node apps/web/scripts/export-tournament-finals.mjs apps/web/tests/fixtures/finals-2026-10-12.json docs/reports/2026-10-12-finals-seeding.json
python3 scripts/generate-tournament-knockout-brackets.py --seeding docs/reports/2026-10-12-finals-seeding.json --output output/pdf/29-Ekim-Final-Tablolari-2026-10-12.pdf
```

## Doğrulama

- Testler: 116 geçti, 0 başarısız; ayrı gerçek PostgreSQL eşzamanlılık testi ortam gerektirdiğinden atlandı. Bu değişiklik veritabanına yazmıyor.
- Lint ve production build başarılı.
- PDF'nin 11 sayfası PNG olarak gözle incelendi; bütün atanmış isimlerin ilgili sayfalarda bulunması, dikey boyutlar ve kaldırılmış etiketlerin yokluğu ayrıca doğrulandı.
- Gerçek React bileşeni production CSS ile yerel tarayıcıda açık/koyu tema ve masaüstü/mobil genişliklerde incelendi. Canlı admin oturumu kullanılmadı.
- Supabase şeması, skorlar ve rezervasyonlar değiştirilmedi.
