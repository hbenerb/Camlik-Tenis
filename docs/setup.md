# Kurulum Notlari

## Yerel Calistirma

```bash
cd apps/web
npm install
npm run dev
```

Yerel adres: `http://localhost:3000`

## Supabase'de Ilk Yapilacaklar

1. Supabase projesini ac.
2. SQL Editor bolumune gir.
3. `supabase/migrations/20260515120000_initial_schema.sql` dosyasindaki SQL'i calistir.
4. Daha once Google ile giris yapildiysa veya profil hazir degil hatasi gorulurse `supabase/migrations/20260515165000_profile_repair.sql` dosyasindaki SQL'i de calistir.
5. Admin panelde RLS yetki hatasi gorulurse `supabase/migrations/20260515173500_admin_policy_repair.sql` dosyasindaki SQL'i calistir.
6. Takvimde aktif kort yok gorulurse `supabase/migrations/20260515172000_seed_default_courts.sql` dosyasindaki SQL'i calistir.
7. Project Settings > API bolumunden su iki bilgiyi al:
   - Project URL
   - anon public key
8. `apps/web/.env.local` dosyasini olustur ve su sekilde doldur:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Supabase Auth Ayarlari

Authentication > Providers bolumunden:

- Google provider aktif edilecek.
- Apple provider aktif edilecek.

Authentication > URL Configuration bolumunde:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

Canliya cikarken bu adreslerin Vercel domainiyle ikinci kez eklenmesi gerekecek.

## Ilk Admin

Ilk bas admin e-postasi:

```text
hbenerb@gmail.com
```

Bu e-posta ile ilk giris yapildiginda profil otomatik `Baş admin` olur.
