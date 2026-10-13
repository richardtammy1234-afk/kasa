# iPhone'dan hızlı harcama ekleme

İki yol var. İkisi de **hiçbir zaman kendiliğinden kayıt yapmaz**: Kasa, alanları doldurulmuş
"İşlem ekle" ekranını açar; kaydetmek için her zaman **Devam → Onayla ve Kaydet** gerekir.

## Hızlı ekleme bağlantısı

| Bağlantı | Ne yapar |
|---|---|
| `https://richardtammy1234-afk.github.io/kasa/#ekle` | Boş "İşlem ekle" ekranını açar |
| `https://richardtammy1234-afk.github.io/kasa/#ekle=Migros%20450%20%C4%B0%C5%9F%20Gen%C3%A7` | Ekranı "Migros 450 İş Genç" ile doldurulmuş açar |

- Metin `#` işaretinden sonra durur. Bu kısım tarayıcıdan dışarı çıkmaz: GitHub'a, sunucu kayıtlarına
  veya başka sitelere gönderilmez. Kasa metni okur okumaz adres çubuğundan ve tarayıcı geçmişinden siler.
- Giriş yapılmamışsa giriş ekranında "Giriş yaptıktan sonra harcama ekleme ekranı açılacak" yazar.
  Google ile giriş yapınca ekran dolu açılır.
- En fazla 120 karakter okunur. Okunamayan bir bağlantıda ekran boş açılır ve uyarı verir.

## Yol 1 — "Kasa Ekle" kestirmesi (önerilen)

Bir kez kurulur (yaklaşık 2 dakika). Sonra: Ana Ekran'da **Kasa Ekle**'ye dokun → yaz veya söyle →
Kasa dolu açılır → **Devam** → **Onayla ve Kaydet**.

### Kurulum

1. **Kestirmeler** uygulamasını aç (iPhone'da yüklü gelir; silindiyse App Store'dan "Kestirmeler").
2. Sağ üstteki **+** düğmesine dokun. Yeni, boş bir kestirme açılır.
3. Üstteki adına dokun, **Yeniden Adlandır** de ve `Kasa Ekle` yaz.
4. **Eylem Ekle**'ye dokun, arama kutusuna `Girdi` yaz ve **Girdi İste** (Ask for Input) eylemini seç.
   - Eylemdeki **İstem** alanına dokun ve `Harcama (örn. Migros 450 İş Genç)` yaz.
   - Giriş türü **Metin** kalsın.
5. Alttaki arama kutusuna `URL` yaz ve **URL Kodla** (İngilizce: *URL Encode*) eylemini ekle.
   - Eylem "**Sağlanan Girdi**'yi kodla" gibi görünmeli. Görünmüyorsa mavi alana dokunup
     **Sağlanan Girdi**'yi seç. "Kodla / Kodu Çöz" seçeneği **Kodla** olmalı.
6. Arama kutusuna `Metin` yaz ve **Metin** (Text) eylemini ekle. Kutuya şunu yaz:

   `https://richardtammy1234-afk.github.io/kasa/#ekle=`

   Hemen arkasına, klavyenin üstündeki değişken çubuğundan **URL Kodlanmış Metin** değişkenini ekle
   (aradaki boşluk olmadan).
7. Arama kutusuna `URL'leri Aç` yaz ve **URL'leri Aç** (Open URLs) eylemini ekle. Girdisi **Metin** olmalı.
8. Sağ üstteki **Bitti**'ye dokun.

Not: Eylem ve değişken adları iOS sürümüne göre biraz farklı yazılabilir (ör. "URL Kodlanmış Metin" yerine "Kodlanmış Metin"). Arama kutusunda İngilizce adla da (*Ask for Input*, *URL Encode*, *Text*, *Open URLs*) bulabilirsin.

### Ana Ekran'a ekleme

1. Kestirmeler'de **Kasa Ekle** kartını basılı tut → **Paylaş** → **Ana Ekrana Ekle**.
2. İstersen simgeyi ve rengini değiştir, sonra **Ekle**'ye dokun.

### İlk kullanım

1. Ana Ekran'da **Kasa Ekle**'ye dokun.
2. Harcamayı yaz ya da klavyedeki mikrofonla söyle: `Kahve 120 Enpara`.
3. **Bitti**'ye dokun. Safari'de Kasa, alanları doldurulmuş "İşlem ekle" ekranıyla açılır.
4. Alanları kontrol et → **Devam** → **Onayla ve Kaydet**.

Kestirme bağlantıyı **Safari**'de açar. Safari'de Kasa'ya bir kez Google ile giriş yapmış olman yeterli.
İlk seferde "Kestirme, Safari'yi açmak istiyor" sorusu çıkarsa **İzin Ver** de.

### Sadece sesle (isteğe bağlı)

4. adımdaki **Girdi İste** yerine **Metni Dikte Et** (Dictate Text) eylemini kullanabilirsin.
5. adımda kodlanacak girdi **Dikte Edilen Metin** olur. Böylece kestirme açılır açılmaz dinlemeye başlar.
Siri ile de çalışır: "Hey Siri, Kasa Ekle".

## Yol 2 — Kasa'yı Ana Ekran'a uygulama gibi eklemek

1. Safari'de `https://richardtammy1234-afk.github.io/kasa/` adresini aç.
2. Alttaki **Paylaş** düğmesi → **Ana Ekrana Ekle** → **Ekle**.

Kasa artık kendi simgesiyle, adres çubuğu olmadan tam ekran açılır.
Ana Ekran uygulaması Safari'den ayrı depolama kullanır; ilk açılışta bir kez Google ile giriş yap.
Bu simge normal açılır; hızlı ekleme için **Kasa Ekle** kestirmesini kullan.

## Neden hazır bir kestirme dosyası yok?

iOS yalnızca Apple tarafından **imzalanmış** kestirme dosyalarını içe aktarır. İmzalama bir Mac'te veya
iCloud paylaşım bağlantısıyla yapılır. Bu ortamda kestirme dosyası imzalanamaz ve iPhone'da denenemez.
Bu yüzden çalıştığı doğrulanmamış bir dosya verilmedi. Kestirmeyi bir kez kurduktan sonra
**Paylaş → iCloud Bağlantısını Kopyala** ile kendi doğrulanmış bağlantını oluşturabilirsin.
