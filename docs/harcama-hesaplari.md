# Kasa — harcama hesapları (gerçekleşen / planlanan)

Tüm ekranlar toplamları tek bir modülden alır: [`analytics.js`](../analytics.js).
Ana sayfa, Kartlar, Analiz ve İşlemler aynı fonksiyonları kullanır; grafiklerdeki çubukların
toplamı özet rakamlarla birebir aynıdır (testlerde `data-k` / `data-actual-k` ile doğrulanır).

## Sınıflandırma

`bugün` = cihazın **yerel takvim günü** (Türkiye'de Europe/Istanbul), UTC değil.

| Sınıf | Kural |
|---|---|
| Gerçekleşen | işlem tarihi ≤ bugün |
| Planlanan | işlem tarihi > bugün |
| Toplam kayıtlı | gerçekleşen + planlanan |

- "Gerçekleşen" yalnızca tarihe dayanır; bankada kesinleştiğinin kanıtı değildir.
- Veritabanında durum alanı yoktur; tarih geldiğinde işlem kendiliğinden gerçekleşene geçer.
  Uygulama açıkken gece yarısı geçilirse ekran 30 sn içinde (veya uygulamaya dönünce) yeniden hesaplanır.
  Firestore belgesine hiçbir yazma yapılmaz.
- Ay, tarih metninden alınır (`2026-11-01` → `2026-11`); saat dilimi ayı kaydırmaz.

## Para hassasiyeti

Tüm toplamlar **tam sayı kuruşla** yapılır: `kuruş = yuvarla(tutar × 100)`.
Örnek: 0,10 + 0,20 kayan noktada 0,30000000000000004 olur; Kasa'da 10 + 20 = 30 kuruş = ₺0,30.
Negatif tutar (iade) toplamdan düşer ve listede "+₺" ile gösterilir.
(Uygulama bugün yalnızca pozitif tutar kaydeder; negatif tutar ancak dışarıdan gelmiş bir kayıtta olabilir.)

## Formüller

`G` = bugünün ay içindeki günü, `AG(ay)` = ayın gün sayısı (artık yıl dahil: Şubat 2028 = 29).

| Ölçü | İçinde bulunulan ay | Geçmiş (tamamlanmış) ay | Gelecek ay |
|---|---|---|---|
| Ana rakam | gerçekleşen | gerçekleşen (= toplam) | planlanan (soluk tonda) |
| Günlük ortalama | gerçekleşen ÷ G | gerçekleşen ÷ AG(ay) | gösterilmez |
| Geçen ayla kıyas | ay başından bugüne: bu ayın 1..G ↔ önceki ayın 1..min(G, AG(önceki)) | tam ay ↔ tam ay | yok |
| Kıyas yüzdesi | (bu − önceki) ÷ önceki × 100; önceki = 0 ise yüzde yok | aynı | — |
| Kategoriler | gerçekleşen (Planlanan sekmesiyle ayrıca) | gerçekleşen | planlanan |
| Kart harcaması | gerçekleşen + ayrı "Planlanan ₺X · N işlem" satırı | gerçekleşen | planlanan |
| Tamamlanan ayların ortalaması | önceki 5 ayın, harcaması olan tam aylarının gerçekleşen ortalaması; "üstünde/altında" yorumu yapılmaz (yarım ay tam ayla kıyaslanmaz) | yorum yapılır | — |
| Günlük grafik | gerçekleşen günler koyu, planlanan günler pastel | koyu | pastel |
| Son 6 ay grafiği | her ay gerçekleşen koyu + planlanan pastel (üst üste) | | |

Kıyaslar yalnızca gerçekleşen harcamayla yapılır; planlanan hiçbir kıyasa girmez.

### Örnekler

Bugün **30 Mart 2026**. Kayıtlar: Şubat'ta 1.200 + 300; Mart'ta 450 (5 Mart), 1.500 (20 Mart),
−250 iade (21 Mart), 120,50 (31 Mart); Nisan'da 229,99 (1 Nisan) ve 649,90 (15 Nisan).

- Mart gerçekleşen = 450 + 1.500 − 250 = **₺1.700,00**; planlanan = **₺120,50**; toplam kayıtlı = **₺1.820,50**.
- Günlük ortalama = 1.700 ÷ 30 = 56,67 → **₺57**.
- Kıyas: Mart 1–30 ↔ Şubat 1–28 (Şubat 28 gün, ayın tamamı) = 1.700 − 1.500 = **₺200 daha fazla, +%13**.
- Ertesi gün (31 Mart) 120,50 gerçekleşene geçer: gerçekleşen ₺1.820,50, ortalama 1.820,50 ÷ 31 = **₺59**.
- 1 Nisan'da Mart tamamlanmış aydır: tam ay kıyas 1.820,50 − 1.500 = **₺320,50 daha fazla**.
- 1 Nisan'da Nisan: gerçekleşen ₺229,99 (Netflix), planlanan ₺649,90; kıyas 1 Nisan ↔ 1 Mart,
  1 Mart'ta harcama yok → **yüzde gösterilmez** ("karşılaştırma yapılamıyor").

Yıl geçişi: 1 Ocak 2028'in kıyası 1 Aralık 2027 ile yapılır.

## Kart limit yüzdesi (değiştirilmedi)

`limit yüzdesi = bu takvim ayında karta kaydedilen TÜM işlemler (planlanan dahil) ÷ kart limiti`

Bu, PR #5 öncesindeki hesapla birebir aynıdır. **Yanıltıcı olabilir**, çünkü:

- Ekstre dönemi takvim ayıyla aynı değildir (ör. ekstre 20'sinde kesiliyorsa dönem 21–20 arasıdır).
- Önceki dönemlerden kalan borç, yapılan ödemeler, taksitler ve faiz dahil değildir.
- Planlanan (henüz yapılmamış) işlemler dahildir.

Yani bu yüzde **ekstre borcu, ödenecek tutar veya kullanılabilir limit değildir**; Kartlar ekranında
bu not gösterilir. Ekstre tarihleri ve son ödeme hatırlatmaları değişmedi.

## Bilinen sınırlar

- "Bugün" cihaz saatine göredir; cihaz saati yanlışsa sınıflandırma da kayar.
- Kartlar ve Analiz'de gelecek ay sekmesi yalnızca o ayda planlanan işlem varsa görünür.
- İşlemler ekranının toplamı seçili dönem ve filtrelerin **toplam kayıtlı** tutarıdır; altında gerçekleşen
  ve planlanan ayrı yazar.
