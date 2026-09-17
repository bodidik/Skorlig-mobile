/**
 * OYUN MERKEZİ nöbetçisi.
 *
 * ⚠️ KULLANICI BİLDİRİMLERİ, SIRAYLA:
 *   2026-08-09  "mod kartları yazı okumadan seçilebilsin"
 *   2026-08-31  "görsel çekici değil, yarım kalmış havası var, renkler ve
 *               yazılar sönük ve oturmamış"
 *   2026-09-16  "kullanıcı o menüsel sayfada hemen işin içine katılabilmeli;
 *               görseller yetersiz"
 *   2026-09-17  v35 cihaz görüntüsüyle: "keşmekeş bir yerde insanlar yolunu
 *               bulabilir mi? Yazılar okunmuyor, çerçeveler basmakalıp,
 *               süperpozisyonlar"
 *
 * ⚠️ BU DOSYANIN ÖNCEKİ SÜRÜMÜ YANLIŞ ŞEYİ ÖLÇÜYORDU. Kontrastı saydam renkli
 * gradyan zemin üstünde hesaplıyordu (`renk + "2a"`). react-native-svg'nin
 * yerel yolu o saydamlığı ATIYOR (extractGradient: `(color & 0x00ffffff) |
 * (stopOpacity << 24)`) — telefonda zemin düz mod rengiydi. Test "en kötü
 * 4.80" diyordu; cihazdaki gerçek değerler (opak zeminde yeniden ölçüldü):
 *     açıklama  kupon 1.70 · tek 1.20 · mini 1.54 · 1987GS 1.08
 *     başlık    kupon 1.22 · tek 1.74 · mini 1.35 · 1987GS 2.24
 * Test yeşildi, ekran okunmuyordu. Web önizlemesi saydamlığı uyguladığı için
 * kusur orada da görünmedi.
 *
 * Bu yüzden artık iki katman:
 *   1. KONTRAST yalnız DÜZ renkler arasında ölçülüyor — her platformda aynı
 *      çizilen tek şey.
 *   2. YAPI NÖBETÇİSİ: metin taşıyan merkez bileşenlerinde saydam renk,
 *      gradyan zemin, kenarlık ve metnin üstüne binen mutlak konum YOK.
 *      Kontrast ölçümü ancak bu yapı korunursa doğru.
 * Ayrıca GradyanZemin'in saydamlığı `stopOpacity`ye ayırdığı sınanıyor
 * (başka ekranlar hâlâ kullanıyor).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contrast, Colors } from "../constants/colors.ts";
import {
  DUGME_YAZISI, IC_YUZEY, ILERLEME_BOS, KART_ZEMINI, METIN_ANA, METIN_IKINCIL, METIN_SOLUK,
  MOD_RENGI, MOD_SIRASI, digerModlar, durakRengi, ikonKutusu, karistir, kuponIlerlemesi,
} from "../lib/oyunMerkezi.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
/** Yorumları atar — kural anlatan notlar yasaklı kalıpları ANARKEN testi düşürmesin. */
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MERKEZ = oku("components/OyunMerkezi.tsx");
const KUPON = oku("components/KuponKarti.tsx");
const PARCA = oku("components/OyunKartParcalari.tsx");
const GUNUN = oku("components/DailyMatchCard.tsx");
const SANAT = oku("components/OyunSanati.tsx");
const GRADYAN = oku("components/GradyanZemin.tsx");
const EKRAN = oku("app/(tabs)/live.tsx");

/** WCAG AA — 18px altı normal metin. */
const ESIK = 4.5;
const HEX6 = /^#[0-9a-f]{6}$/i;

describe("kurulum", () => {
  test("altı mod, her biri sırada bir kez, rengi düz altı haneli", () => {
    assert.equal(MOD_SIRASI.length, 6);
    assert.equal(new Set(MOD_SIRASI).size, 6, "sirada tekrar eden mod var");
    for (const k of MOD_SIRASI) assert.match(MOD_RENGI[k], HEX6, `${k} rengi duz degil`);
  });

  test("tema renklerinin HEPSİ düz altı haneli (saydamlık yok)", () => {
    for (const [ad, r] of Object.entries({ KART_ZEMINI, IC_YUZEY, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, DUGME_YAZISI, ILERLEME_BOS })) {
      assert.match(r, HEX6, `${ad} = ${r} — saydam/gecersiz renk yerelde farkli cizilir`);
    }
  });

  test("karistir düz renk üretiyor ve uçlarda doğru", () => {
    assert.equal(karistir("#ffffff", "#000000", 0.5), "#808080");
    assert.equal(karistir("#a3e635", KART_ZEMINI, 0), KART_ZEMINI);
    assert.equal(karistir("#a3e635", KART_ZEMINI, 1), "#a3e635");
    for (const k of MOD_SIRASI) assert.match(ikonKutusu(k), HEX6);
  });
});

describe("KONTRAST — düz zeminlerde", () => {
  test("metin tonları kart yüzeyinde ve iç yüzeyde eşiği geçiyor", () => {
    for (const zemin of [KART_ZEMINI, IC_YUZEY]) {
      for (const [ad, yazi] of Object.entries({ METIN_ANA, METIN_IKINCIL, METIN_SOLUK })) {
        const k = contrast(yazi, zemin);
        assert.ok(k >= ESIK, `${ad} ${zemin} uzerinde ${k.toFixed(2)}`);
      }
    }
  });

  test("mod vurgu rengi kart yüzeyinde okunuyor (alt satır, bedel, bağlantı)", () => {
    for (const k of MOD_SIRASI) {
      const c = contrast(MOD_RENGI[k], KART_ZEMINI);
      assert.ok(c >= ESIK, `${k} vurgusu kartta ${c.toFixed(2)}`);
    }
  });

  test("dolu düğmeler: koyu yazı kupon, tamamla ve tek maç renginde okunuyor", () => {
    for (const dolgu of [MOD_RENGI.kupon, Colors.accent, MOD_RENGI.tek]) {
      assert.ok(contrast(DUGME_YAZISI, dolgu) >= ESIK, `${dolgu} ${contrast(DUGME_YAZISI, dolgu).toFixed(2)}`);
    }
  });

  test("gömülü 1-X-2: seçili düğmede koyu yazı, beyaz DEĞİL", () => {
    /* Beyaz yazı mavi (#3b82f6) üstünde 3.68 — eşiğin altı. */
    for (const renk of ["#3b82f6", "#f59e0b", "#ef4444"]) {
      assert.ok(contrast(DUGME_YAZISI, renk) >= ESIK, `${renk} ${contrast(DUGME_YAZISI, renk).toFixed(2)}`);
    }
    assert.ok(contrast("#ffffff", "#3b82f6") < ESIK, "beyaz mavi uzerinde artik esigi geciyor — gerekce eskimis");
    /* İki metin ayrı ayrı: etiket VE oran. Tek eşleşme aramak, biri beyaza
     * dönünce ötekinde eşleşip yeşil kalıyordu (negatif kontrolde ölçüldü). */
    assert.match(GUNUN, /st\.btnText, isSelected && \{ color: gomulu \? DUGME_YAZISI : "#fff" \}/, "secili etiket beyaz");
    assert.match(GUNUN, /st\.oranText, isSelected && \{ color: gomulu \? DUGME_YAZISI : "#fff" \}/, "secili oran beyaz");
  });

  test("kupon kartında boş maç uyarısı (accent) kartta okunuyor", () => {
    assert.ok(contrast(Colors.accent, KART_ZEMINI) >= ESIK);
  });
});

describe("YAPI — okunurluk ölçümünün dayanağı (v35 cihaz dersi)", () => {
  const METIN_TASIYANLAR = [["OyunMerkezi", MERKEZ], ["KuponKarti", KUPON], ["OyunKartParcalari", PARCA]] as const;

  test("merkez bileşenlerinde gradyan zemin YOK", () => {
    for (const [ad, src] of METIN_TASIYANLAR) {
      assert.doesNotMatch(kod(src), /GradyanZemin/, `${ad} gradyan zemin kullaniyor — yerelde duz blok cizilebilir`);
    }
  });

  test("saydam renk üretimi YOK (alfa eki, 8 haneli renk, rgba)", () => {
    for (const [ad, src] of METIN_TASIYANLAR) {
      const k = kod(src);
      assert.doesNotMatch(k, /["'`]#[0-9a-fA-F]{8}["'`]/, `${ad} sekiz haneli renk`);
      assert.doesNotMatch(k, /\+\s*alfa\(|\+\s*["'`][0-9a-fA-F]{2}["'`]/, `${ad} renge alfa eki`);
      assert.doesNotMatch(k, /rgba\(/, `${ad} rgba`);
    }
  });

  test("gömülü renk yok — renkler lib/oyunMerkezi'den", () => {
    for (const [ad, src] of METIN_TASIYANLAR) {
      assert.doesNotMatch(kod(src), /["'`]#[0-9a-fA-F]{3,8}["'`]/, `${ad} icinde olculmemis gomulu renk`);
    }
  });

  test("kenarlık YOK (liste ayracı hariç)", () => {
    for (const [ad, src] of METIN_TASIYANLAR) {
      const kenar = [...kod(src).matchAll(/border(?:Top|Bottom|Left|Right)?Width:\s*[^,}\n]+/g)].map((m) => m[0]);
      const izinsiz = kenar.filter((k) => !/borderTopWidth:\s*StyleSheet\.hairlineWidth/.test(k));
      assert.deepEqual(izinsiz, [], `${ad} kenarlik ciziyor: ${izinsiz.join(" | ")}`);
    }
  });

  test("metnin üstüne binen mutlak konum YOK", () => {
    for (const [ad, src] of METIN_TASIYANLAR) {
      assert.doesNotMatch(kod(src), /position:\s*["']absolute["']/, `${ad} mutlak konumlu oge — ust uste binme`);
    }
  });

  test("çizimlerde hale ve pırıltı YOK (kutunun dışına taşan süs)", () => {
    assert.doesNotMatch(SANAT, /function Hale|function Pirilti|<Hale|<Pirilti/);
  });

  test("gömülü günün maçı: çerçevesiz düğme, kendi zemini yok", () => {
    assert.match(GUNUN, /const kap = gomulu \? s\.gomuluKap : s\.card;/);
    assert.match(GUNUN, /\{!gomulu && <GradyanZemin/);
    assert.match(GUNUN, /gomulu \? g\.btn : s\.btn,\s*!gomulu && \{ borderColor: o\.color \}/, "gomulu dugme cerceve aliyor");
    const gBlok = GUNUN.slice(GUNUN.indexOf("const g = StyleSheet.create({"), GUNUN.indexOf("const s = StyleSheet.create({"));
    assert.ok(gBlok.length > 100, "gomulu stil blogu bulunamadi");
    assert.doesNotMatch(gBlok, /borderWidth/, "gomulu stillerde kenarlik var");
  });
});

describe("GradyanZemin — diğer ekranlar için doğru saydamlık ve boyut", () => {
  test("durakRengi sekiz haneli rengi stopColor + stopOpacity'ye ayırıyor", () => {
    assert.deepEqual(durakRengi("#a3e635ff"), { renk: "#a3e635", opaklik: 1 });
    const r = durakRengi("#a3e6352a");
    assert.equal(r.renk, "#a3e635");
    assert.ok(Math.abs(r.opaklik - 0x2a / 255) < 1e-9);
    assert.deepEqual(durakRengi("#1e3a8a"), { renk: "#1e3a8a", opaklik: 1 });
  });

  test("bileşen stopOpacity veriyor ve boyutu ölçüp sayıyla çiziyor", () => {
    assert.match(GRADYAN, /stopColor=\{bas\.renk\} stopOpacity=\{bas\.opaklik\}/, "saydamlik stopOpacity ile verilmiyor");
    assert.match(GRADYAN, /stopColor=\{son\.renk\} stopOpacity=\{son\.opaklik\}/);
    assert.match(GRADYAN, /onLayout=/, "boyut olculmuyor — Android'de yarim gradyan");
    assert.match(GRADYAN, /<Svg width=\{olcu\.g\} height=\{olcu\.y\}>/);
    assert.doesNotMatch(kod(GRADYAN), /width="100%"/, "yuzde boyut geri gelmis");
  });
});

describe("OTURUM — kupon kartı oturum hazır olmadan istek atmıyor", () => {
  test("yükleme oturum yüklemesi bitince ve kullanıcı değişince", () => {
    assert.match(KUPON, /const \{ user, loading: oturumYukleniyor \} = useAuth\(\);/);
    assert.match(KUPON, /if \(oturumYukleniyor\) return;\s*yukle\(\);\s*\}, \[oturumYukleniyor, uid, yukle\]\);/,
      "kupon oturumdan once isteniyor — misafir/geç oturumda AUTH_REQUIRED ile bos kalir");
  });
});

describe("HEMEN OYNA — kupon ve günün maçı merkezin İÇİNDE", () => {
  test("live.tsx kupon ve günün maçını AYRICA çizmiyor", () => {
    assert.doesNotMatch(EKRAN, /<KuponKarti\b/);
    assert.doesNotMatch(EKRAN, /<DailyMatchCard\b/);
    assert.match(MERKEZ, /<KuponKarti\b/);
    assert.match(MERKEZ, /<DailyMatchCard\s+gomulu\b/);
  });

  test("tam mod maç listesine bağlı; kompakt satır önce dönüyor", () => {
    const erken = MERKEZ.indexOf("if (!tam) {");
    assert.ok(erken > 0, "kompakt erken donus yok");
    assert.ok(MERKEZ.indexOf("<KuponKarti") > erken);
    assert.ok(MERKEZ.indexOf("<DailyMatchCard") > erken);
    assert.match(EKRAN, /tam=\{mode === "schedule" \|\| mode === "open"\}/);
  });

  test("günün maçı yoksa Tek Maç kartı boş kalmıyor", () => {
    assert.match(GUNUN, /if \(!fixture\) return bosken \? <>\{bosken\}<\/> : null;/);
    assert.match(MERKEZ, /bosken=\{\s*<Basinc onPress=\{tahmineGit\}/);
  });

  test("kupon yokken 'hazırlanıyor' yalnız sunucu cevap verdiyse", () => {
    assert.match(KUPON, /setNeden\(j\?\.ok \? "yok" : "bilinmiyor"\)/);
    assert.match(KUPON, /if \(!kupon\) return bosken \? <>\{bosken\(neden\)\}<\/> : null;/);
    assert.match(MERKEZ, /alt=\{neden === "yok" \? t\("kuponSoon"\) : null\}/);
  });

  test("liste satırında bedel sağ sütunda DEĞİL (kesiliyordu)", () => {
    const satir = MERKEZ.slice(MERKEZ.indexOf("function ModSatiri"), MERKEZ.indexOf("function KompaktDugme"));
    const aciklama = satir.indexOf("s.satirAciklama");
    const bedel = satir.indexOf("s.satirBedel");
    const kapanis = satir.indexOf("</View>", aciklama);
    assert.ok(aciklama > 0 && bedel > aciklama && bedel < kapanis, "bedel aciklamanin altinda, ayni sutunda degil");
    assert.doesNotMatch(satir, /satirSag/);
  });
});

describe("SIRA", () => {
  test("marka bandı < oyun merkezi < skor merkezi", () => {
    const marka = EKRAN.indexOf("MARKA BANDI");
    const merkez = EKRAN.indexOf("<OyunMerkezi");
    const skor = EKRAN.indexOf("<SkorMerkezi");
    assert.ok(marka > 0 && merkez > marka && skor > merkez);
  });

  test("beceri modları önde, düello ve havuz EN SONDA", () => {
    assert.deepEqual(MOD_SIRASI.slice(-2), ["duello", "havuz"]);
    assert.deepEqual(MOD_SIRASI.slice(0, 2), ["kupon", "tek"]);
  });

  test("digerModlar kupon ve tek maçı çıkarıyor, sırayı koruyor", () => {
    const hepsi = MOD_SIRASI.map((key) => ({ key }));
    assert.deepEqual(digerModlar(hepsi).map((m) => m.key), ["mini", "gs1987", "duello", "havuz"]);
    const gizli = hepsi.filter((m) => m.key !== "duello" && m.key !== "havuz");
    assert.deepEqual(digerModlar(gizli).map((m) => m.key), ["mini", "gs1987"]);
  });
});

describe("kuponIlerlemesi", () => {
  const maclar = ["a", "b", "c", "d"].map((fixtureId) => ({ fixtureId }));

  test("katılmadı → katil", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: false, tahminlerim: null });
    assert.equal(r.asama, "katil");
    assert.deepEqual(r.dolular, [false, false, false, false]);
  });

  test("katıldı, eksik → parçalar MAÇ SIRASIYLA", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: true, tahminlerim: { b: "H", d: "A" } });
    assert.equal(r.asama, "eksik");
    assert.deepEqual(r.dolular, [false, true, false, true]);
  });

  test("kupondan düşmüş maçın tahmini SAYILMIYOR", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: true, tahminlerim: { a: "H", b: "D", c: "A", eski: "H" } });
    assert.equal(r.girilen, 3);
    assert.equal(r.asama, "eksik");
  });

  test("hepsi dolu → tamam; veri yok → güvenli", () => {
    assert.equal(kuponIlerlemesi({ maclar, katildiMi: true, tahminlerim: { a: "H", b: "D", c: "A", d: "H" } }).asama, "tamam");
    assert.deepEqual(kuponIlerlemesi(null), { macSayisi: 0, girilen: 0, eksik: 0, asama: "katil", dolular: [] });
  });

  test("kart ilerlemeyi bu fonksiyondan çiziyor; boş maç sayısı ilerleme satırında", () => {
    assert.match(KUPON, /const ilerleme = kuponIlerlemesi\(kupon\);/);
    assert.match(KUPON, /\? t\("kuponMissingShort", \{ n: ilerleme\.eksik \}\)/);
    assert.match(KUPON, /ilerleme\.asama === "eksik" \? \{ yazi: t\("kuponFill"\), zemin: Colors\.accent \}/);
  });
});

describe("çizimler", () => {
  test("gradyan kimlikleri örnek başına; web'de geçersiz rotation/origin yok", () => {
    assert.doesNotMatch(SANAT, /\bid="/);
    assert.doesNotMatch(SANAT, /\b(rotation|origin)=\{?/);
  });

  test("her modun çizimi merkezde bağlı", () => {
    for (const ad of ["KuponSanati", "TekMacSanati", "MiniSanati", "GsSanati", "DuelloSanati", "HavuzSanati"]) {
      assert.match(SANAT, new RegExp(`export function ${ad}\\(`));
      assert.match(MERKEZ + KUPON, new RegExp(`\\b${ad}\\b`));
    }
  });
});
