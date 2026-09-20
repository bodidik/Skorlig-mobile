/**
 * "BENİMKİLER" — bayat liste ve görünmeyen skor tahminleri.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-20): "Galatasaray–Kasımpaşa maçına 2-0
 * tahmin gönderdim, kaydedildi yazıyor. Benim maçlar kısmında görünmüyor."
 *
 * ÖLÇÜLDÜ — İKİ AYRI SEBEP, ikisi de gerçek:
 *
 * 1. LİSTE BAYAT KALIYORDU. `useFocusEffect` yalnız `mode === "open"`u
 *    yeniliyordu; yorumu "predict'ten dönüş dahil" diyordu ama tek modu
 *    kapsıyordu. Benimkiler'deyken maça dokun → `/(tabs)/predict` AYRI bir
 *    sekme, `live.tsx` monte kalıyor → tahmin gönder → geri dön → `mode`
 *    değişmediği için mod efekti de çalışmıyor → eski liste.
 *    Sunucuda kusur YOK: `/api/pred/my` tarih süzgeci uygulamıyor
 *    (`fixtureIdsFilter: null`) ve gelecek maçlar `current`a giriyor.
 *    ⚠️ AYNI SINIFIN ÜÇÜNCÜ ÖRNEĞİ — 18 Eylül'de kupon kartı ve Tek Maç
 *    kartı tam bu sebeple odağa bağlanmıştı; bu liste atlanmıştı.
 *
 * 2. İKİ AYRI DEFTER. Skor tahminleri `skor_tahminleri` koleksiyonunda,
 *    "Benimkiler" `predictions`ı okuyor — skor tahmini hiçbir "tahminlerim"
 *    yüzeyinde GÖRÜNEMEZDİ. Skor Tahmini kartı 20 Eylül'de ana ekranda öne
 *    alındığı için bu boşluk daha çok kişiyi etkiler hâle gelmişti.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const EKRAN = kod(oku("app/(tabs)/live.tsx"));

describe("odak tazelemesi AÇIK OLAN modu yeniliyor", () => {
  test("üç mod da odakta yenileniyor", () => {
    const bas = EKRAN.indexOf("useFocusEffect(");
    assert.ok(bas > 0, "useFocusEffect bulunamadi");
    const blok = EKRAN.slice(bas, EKRAN.indexOf(");", EKRAN.indexOf("}, [", bas)));
    assert.match(blok, /mode === "open".*loadOpen\(\)/s, "open yenilenmiyor");
    assert.match(blok, /mode === "mine".*loadMyPreds\(\)/s, "Benimkiler odakta YENILENMIYOR — bildirilen kusur");
    assert.match(blok, /mode === "tournaments".*loadMyTournaments\(\)/s, "turnuvalar odakta yenilenmiyor");
  });

  test("bağımlılıklar tam — yoksa eski işlev kapanıp bayat veri yazar", () => {
    const bas = EKRAN.indexOf("useFocusEffect(");
    const dep = EKRAN.slice(EKRAN.indexOf("}, [", bas), EKRAN.indexOf("]", EKRAN.indexOf("}, [", bas)));
    for (const ad of ["loadOpen", "loadMyPreds", "loadMyTournaments"]) {
      assert.ok(dep.includes(ad), `${ad} bagimlilik listesinde yok`);
    }
  });

  test("NÖBETÇİ: ölçüt kör değil — blok gerçekten okunuyor", () => {
    /* Boş bir dilimi sınamak her iddiayı geçirirdi. */
    const bas = EKRAN.indexOf("useFocusEffect(");
    const blok = EKRAN.slice(bas, EKRAN.indexOf(");", EKRAN.indexOf("}, [", bas)));
    assert.ok(blok.length > 80, `useFocusEffect blogu supheli kisa: ${blok.length}`);
  });
});

describe("skor tahminleri Benimkiler'de görünüyor", () => {
  test("sunucudan gelen `skor` alanı duruma yazılıyor", () => {
    assert.match(EKRAN, /setMySkor\(j\?\.ok && Array\.isArray\(j\.skor\) \? j\.skor : \[\]\)/,
      "skor alani okunmuyor");
  });

  test("OKUNAMADI ile BOŞ ayrı tutuluyor", () => {
    /* Sessiz boş liste "hiç skor tahminin yok" diye okunurdu — deponun
     * kayitli "sessiz bosluk" sinifi. */
    assert.match(EKRAN, /setSkorOkunamadi\(!!j\?\.skorOkunamadi\)/, "sunucunun okunamadi bayragi yok sayiliyor");
    assert.match(EKRAN, /skorOkunamadi \?/, "okunamadi hali ekranda ayirt edilmiyor");
    assert.match(EKRAN, /accessibilityRole="alert"/, "okunamadi uyarisi canli bolge degil");
  });

  test("ağ hatasında da 'yok' DENMİYOR", () => {
    const c = EKRAN.indexOf("setMyPreds({ current: [], old: [] });");
    assert.ok(c > 0, "catch dali bulunamadi");
    const blok = EKRAN.slice(c, c + 200);
    assert.match(blok, /setSkorOkunamadi\(true\)/, "ag hatasinda bos liste 'yok' diye gosterilir");
  });

  test("bölüm 1-X-2 listesine KARIŞTIRILMAMIŞ", () => {
    /* İki oyunun şekli ve puanlaması farklı; aynı diziye koymak "bu satır
     * hangi oyun" sorusunu kullanıcıya bırakırdı. */
    assert.doesNotMatch(EKRAN, /\.\.\.myPreds\.current,\s*\.\.\.mySkor/, "skor 1-X-2 listesine karistirilmis");
    assert.match(EKRAN, /t\("mySkorPreds"/, "ayri bolum basligi yok");
  });

  test("takım adı ile SKOR karıştırılmıyor", () => {
    /* Sunucudaki kayitta `home`/`away` SKOR demek; takim adi yalniz
     * fikstürden geliyor. Ilk yazimda karistirilmisti. */
    assert.match(EKRAN, /sp\.tahmin\.home\}–\{sp\.tahmin\.away/, "skor `tahmin` alanindan okunmuyor");
    assert.match(EKRAN, /sp\.home && sp\.away \? `\$\{sp\.home\} – \$\{sp\.away\}`/, "takim adi ayri okunmuyor");
  });

  test("renk ve puan biçimi TEK KAYNAKTAN", () => {
    /* Ikinci bir renk/bicim kopyasi, kart ile listenin ayrismasi demekti. */
    assert.match(EKRAN, /import \{ MOD_RENGI \} from "\.\.\/\.\.\/lib\/oyunMerkezi"/);
    assert.match(EKRAN, /import \{ puanIsaretli \} from "\.\.\/\.\.\/lib\/skorTahmini"/);
    assert.match(EKRAN, /color: MOD_RENGI\.skor/, "skor rengi elle yazilmis olabilir");
  });
});
