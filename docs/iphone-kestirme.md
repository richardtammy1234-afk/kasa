# iPhone'dan hızlı harcama ekleme

Üç yol var:

- **Yol 1 ve 2** (elle ekleme) **hiçbir zaman kendiliğinden kayıt yapmaz**: Kasa, alanları doldurulmuş
  "İşlem ekle" ekranını açar; kaydetmek için her zaman **Devam → Onayla ve Kaydet** gerekir.
- **Yol 3** (banka SMS'i) **otomatiktir**: bankadan harcama SMS'i gelince kayıt onay beklemeden yapılır.
  Kurulumu en altta.

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

## Yol 3 — Banka SMS'inden otomatik kayıt

Bankadan "…kartınızla … TL harcama yapılmıştır" gibi bir SMS gelince iPhone'daki bir **otomasyon** SMS'i Kasa'ya
gönderir. Kasa (herhangi bir cihazda açıldığında) SMS'ten tutarı, iş yerini, kartı ve kategoriyi çıkarır ve
harcamayı **onay beklemeden** kaydeder. Ana sayfada "Kaydedildi: Migros ₺450,00 · İş Genç" bildirimi çıkar.

### Neler kaydedilir, neler kaydedilmez?

| SMS | Ne olur |
|---|---|
| Kartla harcama / alışveriş | **Kaydedilir.** Taksitliyse taksitlere bölünüp sonraki aylara yazılır ("Teknosa 1/3. Taksit"). |
| Doğrulama kodu (3D Secure / OTP), reklam, kampanya, kart borcu ödemesi, maaş, gelen para, reddedilen işlem | **Atlanır**, hiçbir yere yazılmaz. |
| İade, ATM / nakit çekim, EFT / FAST / havale, yalnızca dövizli tutar | **Kaydedilmez**, Ayarlar'da onayına sunulur: "Harcama olarak ekle" veya "Yoksay". |

- **Kart:** SMS'teki son 4 haneden ("1234 ile biten", "**1234") bulunur. İlk kez görülen bir son 4 hane için
  Kasa banka adından (yoksa son kullandığın karttan) tahmin yapar ve ana sayfada "•••• 1234 ile biten kart İş Genç
  sayıldı. Doğru mu?" diye sorar. Ayarlar'da değiştirirsen o karttan gelen önceki SMS kayıtları da taşınır.
- **İş yeri ve kategori:** "MIGROS TICARET A.S." → geçmişte "Migros" yazdıysan **Migros** ve o zamanki kategorisi.
  Geçmişte yoksa anahtar kelimelerden (Migros → Market, Shell → Ulaşım…), o da yoksa **Diğer**.
- **Çift kayıt olmaz:** İşlem kimliği SMS metninden türetilir; aynı SMS iki kez gelse ya da iki cihaz aynı anda
  açık olsa da tek kayıt oluşur.
- **Tarih:** SMS'teki tarih; SMS'te tarih yoksa telefona geldiği gün.

### Bir kerelik hazırlık (bilgisayardan, yaklaşık 1 dakika)

Kestirme, giriş yapmadan yalnızca senin gelen kutuna **yeni kayıt ekleyebilsin** diye Firestore kuralları
güncellenmelidir. Bu yapılmadan kestirme "403 PERMISSION_DENIED" alır.

1. <https://console.firebase.google.com/project/kasa-18dce/firestore/rules> adresini aç.
2. Mevcut kuralların yedeğini al (metni bir yere kopyala).
3. Depodaki [`firestore.rules`](../firestore.rules) dosyasının tamamını yapıştır → **Yayınla**.

Kural, kestirmeye yalnızca **oluşturma** izni verir (okuma, değiştirme, silme yok) ve kaydın Kasa'da oluşturulan
gizli anahtarı taşımasını şart koşar.

### Kasa'da açma

**Ayarlar → Otomatik kayıt · banka SMS'i → Otomatik kaydı aç.** Kasa sana özel bir gizli anahtar oluşturur ve
kestirmeye yapıştıracağın **adresi** ile **gövdeyi** gösterir (Kopyala düğmeleriyle).

### iPhone'da otomasyonu kurma (bir kez, yaklaşık 3 dakika)

1. **Kestirmeler** → alttan **Otomasyon** → **+** (veya **Yeni Otomasyon**) → **Mesaj**.
2. **Mesaj Şunu İçeriyor**: `TL` yaz. **Hemen Çalıştır**'ı seç, **Çalıştığında Bildir**'i kapat → **İleri** →
   **Yeni Boş Otomasyon**.
3. **Metin** eylemi ekle. İçine önce **Geçerli Tarih** değişkenini koy; ona dokun → **Tarih Biçimi: ISO 8601**,
   **Saati Dahil Et** açık. Sonra **yeni satıra** geç, **Kestirme Girdisi** değişkenini koy; ona dokun → **İçerik**.
4. **Base64 Kodla** eylemi ekle (girdisi: Metin). **Daha Fazla Göster** → **Satır Sonları: Hiçbiri**.
5. Bir **Metin** eylemi daha ekle, Kasa'daki **gövdeyi** yapıştır. İçindeki `BASE64` yazısını sil ve yerine
   **Base64 Kodlanmış Metin** değişkenini koy.
6. **URL'nin İçeriğini Al** eylemi ekle. URL olarak Kasa'daki **adresi** yapıştır. **Daha Fazla Göster**:
   - Yöntem: **POST**
   - Başlıklar: `Content-Type` = `application/json`
   - İstek Gövdesi: **Dosya** → bir önceki **Metin**
7. **Bitti**.

İngilizce adlar: *Automation → Message → Message Contains → Run Immediately*, *Text*, *Current Date (ISO 8601)*,
*Shortcut Input → Content*, *Base64 Encode (Line Breaks: None)*, *Get Contents of URL (POST, Headers, Request Body: File)*.

Neden `TL`? Mesaj otomasyonu tek bir sözcüğe göre tetiklenir ve bankaların gönderen adları kişi olarak
seçilemez. `TL` içeren her SMS (ör. reklamlar) Kasa'ya gider; Kasa harcama olmayanları okur okumaz siler.

### Deneme

- **Ayarlar → Bir SMS'i dene**: bankandan gelmiş eski bir SMS'i yapıştır; Kasa nasıl okuyacağını gösterir,
  hiçbir şey kaydetmez. Okunuşu yanlışsa o SMS'in biçimini (kart numarasını silerek) paylaş, ayrıştırıcı güncellensin.
- Gerçek deneme: bir sonraki kartlı alışverişinden sonra Kasa'yı aç; işlem listede ve ana sayfada bildirim görünür.

### Bilinen sınırlar

- Kayıt, Kasa **açıldığında** yapılır. SMS gelir gelmez buluttaki gelen kutusuna yazılır (kaybolmaz), ama işleme
  dönüştürmek için Kasa'nın bir cihazda açılması gerekir. Tamamen arka planda çalışması için Firebase'in ücretli
  (Blaze) planındaki Cloud Functions gerekir.
- Bankalar SMS biçimini değiştirirse bazı alanlar (özellikle iş yeri adı) eksik okunabilir: iş yeri bulunamazsa
  işlem "Kart harcaması" adıyla kaydedilir; tutar okunamazsa hiç kaydedilmez.
- Anahtarı biri ele geçirirse yalnızca gelen kutuna sahte SMS ekleyebilir; verilerini okuyamaz ve silemez.
  Böyle bir şüphede **Ayarlar → Anahtarı yenile** ve kestirmedeki gövdeyi güncelle.
