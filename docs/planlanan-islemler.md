# İleri tarihli (planlanan) işlemler — mevcut hesaplama davranışı

Bu belge, bugünden sonraki bir tarihe sahip işlemlerin (ör. 23 Ekim tarihli abonelikler) Kasa'daki
toplamları, ortalamaları ve karşılaştırmaları **bugün nasıl etkilediğini** anlatır. PR #4 bu
hesaplamaların hiçbirini değiştirmez; yalnızca görünüme "Planlanan" etiketi ekler.

## Tanım

- "Planlanan" = `date` alanı bugünün yerel tarihinden (Europe/Istanbul, cihaz saati) büyük olan işlem
  (`isPlanned`, `index.html`). Yeni bir alan, durum veya Firestore şeması yoktur; etiket her açılışta
  tarihten hesaplanır. Tarih geldiğinde etiket kendiliğinden kalkar.
- İşlemlerin `date`, `amount`, `description`, `category`, `cardId`, `id` alanlarına hiçbir kod dokunmaz.

## Nerede toplamlara giriyor

Tüm ay hesapları `monthStats()` içindeki `mt = mTxs(ay)` listesinden türetilir. `mTxs` işlemi
yalnızca **ay anahtarına** (YYYY-AA) göre seçer; gün bugünden sonra olsa da o ayın listesine girer.

| Ekran / değer | Fonksiyon | Planlanan dahil mi? | Etkisi |
|---|---|---|---|
| Ana sayfa "Bu ay harcadın" | `renderHome` → `st.total` | **Evet** | Ayın toplamı, henüz gerçekleşmemiş tutarları da içerir. |
| Ana sayfa "İşlem" sayısı | `st.mt.length` | **Evet** | |
| Ana sayfa / Analiz "Günlük ortalama" | `st.total / st.days` | **Pay evet, payda hayır** | `days` = bugünün gün numarası. Planlanan tutar bugüne kadarki günlere bölünür → ortalama olduğundan **yüksek** görünür. |
| "Geçen ayın aynı dönemine göre" (ana sayfa, Analiz yüzdesi) | `cmpText`, `diff` | **Bu ay evet, geçen ay hayır** | Geçen ay yalnızca bugünün gün numarasına kadar (`pSame`) sayılır; bu ay tamamı sayılır → fark "daha fazla" yönünde **şişer**. |
| Ana sayfa "En çok harcanan" ve kategori payları | `st.catE` | **Evet** | Planlanan abonelikler kategori payını büyütebilir. |
| Kart harcaması ve limit doluluğu (%) | `renderHome`, `renderCards`, `renderTrend` (`ct`) | **Evet** | Kartın aylık harcaması ve limit yüzdesi planlananı içerir. |
| Kartlar ekranı "Kartlarla harcanan" | `renderCards` → `st.total` | **Evet** | |
| Analiz "günlük birikimli" çubuklar | `renderTrend` → `barsSVG(cum,…,{futureFrom:st.days})` | **Görselde hayır** | Bugünden sonraki günler soluk ve sabit yükseklikte çizilir; planlanan tutar çubuklarda görünmez ama üstteki toplamda vardır. |
| Analiz günlük mini çizgi | `st.daily.slice(0, st.days)` | **Hayır** | Yalnızca bugüne kadarki günler. |
| Analiz "İşlem sayısı" | `st.mt.length` | **Evet** | |
| Analiz "5 ay ortalaması" ve 6 aylık çubuklar | `months[]`, `avg5` | **Evet** (her ay kendi planlananlarıyla) | Geçmiş aylarda planlanan kalmaz; yalnızca içinde bulunulan ay etkilenir. |
| İşlemler ekranı toplamı | `renderTxs` → `sumOf(f)` | **Evet** (seçili dönem/filtreye göre) | Özette "N planlanan dahil (₺…)" satırı bu etkiyi açıkça gösterir. |
| Ana sayfa "Son işlemler" | `renderHome` → `recent` | **Evet** | Tarihe göre azalan sıralandığı için planlananlar en üstte, "Planlanan" etiketiyle görünür. |
| Son ödeme uyarıları | `renderAlerts` | **Hayır** | Yalnızca kartın ödeme gününe bakar, işlemlere bakmaz. |
| Yedek indir / geri yükle | `exportBackup`, `restoreBackup` | **Evet, olduğu gibi** | Tarih dahil tüm alanlar birebir yedeklenir/geri yüklenir. |

Ek not: Kartlar ve Analiz ekranlarındaki ay sekmeleri en fazla içinde bulunulan aya kadar gider.
Gelecek bir aya (ör. Kasım) tarihli işlem bu ekranlarda ayrı bir ay olarak açılamaz; İşlemler
ekranında "Planlanan" veya "Tümü" dönemiyle görülebilir ve aranabilir.

## Önerilen ayrı PR: gerçekleşen ve planlanan harcamayı ayırmak

Bu PR'da yapılmadı; finansal hesap değişikliği olduğu için ayrı ve onaylı bir PR olmalı.

1. `monthStats()` içinde `actual` (tarih ≤ bugün) ve `planned` (tarih > bugün) toplamlarını ayrı hesapla.
2. Ana sayfa büyük rakamı: "Bu ay harcadın" = `actual`; altında "+ ₺X planlanan" ince satırı.
3. Günlük ortalama ve geçen ayla karşılaştırma yalnızca `actual` ile (paydalar ve dönemler eşleşir).
4. Kart limit doluluğu: gerçekleşen + planlanan ayrı tonda (ör. açık gri uzatma) gösterilsin.
5. Analiz birikimli grafiği: gelecek günlerde planlanan tutar soluk çubuk olarak görünsün.
6. Testler: aynı veriyle eski ve yeni hesapların farkını gösteren birim testleri; veri/şema değişmez.
