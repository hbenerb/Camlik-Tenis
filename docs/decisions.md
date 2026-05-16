# Ayvalik Camlik Tenis Rezervasyon Uygulamasi

## Ilk Urun Kapsami

- Baslangic platformu: Next.js web app.
- Sonraki platform: Expo mobil app, ayni Supabase backend uzerinden.
- Giriş yontemi: Supabase Auth ile Google ve Apple OAuth.
- Ilk bas admin e-postasi: `hbenerb@gmail.com`.
- Uygulama uyeligi ile kulup uyeligi ayridir.
- Kullanici kendi kendine app uyesi olabilir.
- Admin, app uyelerini kulup uyesi olarak isaretleyebilir.
- Admin, kulup uyeleri icin farkli rezervasyon onceligi tanimlayabilir.
- Varsayilan rezervasyon suresi: 60 dakika.

## Admin Panelden Degisecek Ayarlar

- Kort sayisi ve kort adlari.
- Gunluk acilis saati.
- Gunluk kapanis saati.
- Rezervasyon suresi.
- Normal app uyesi icin kac gun onceden rezervasyon yapilabilecegi.
- Kulup uyesi icin kac gun onceden rezervasyon yapilabilecegi.
- Bir uyenin ayni anda kac aktif rezervasyonu olabilecegi.
- Rezervasyon iptali icin son sure.

## Guvenlik Kararlari

- Ayni kortta ayni zaman araligina iki aktif rezervasyon veritabani seviyesinde engellenir.
- RLS aktif olur; kullanici kendi rezervasyonlarini gorur, admin tum sistemi gorur.
- Bas admin diger adminleri belirleyebilir.
- Standart adminler bas admin hesaplarini degistiremez.

