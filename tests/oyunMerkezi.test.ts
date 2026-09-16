/**
 * OYUN MERKEZİ nöbetçisi — eski `oyunModlariKontrast.test.ts`in yerini alıyor.
 *
 * ⚠️ KULLANICI BİLDİRİMLERİ, SIRAYLA:
 *   2026-08-09  "mod kartları yazı okumadan seçilebilsin"
 *   2026-08-31  "görsel çekici değil, yarım kalmış havası var, renkler ve
 *               yazılar sönük ve oturmamış"
 *   2026-09-16  "kullanıcı o menüsel sayfada hemen işin içine katılabilmeli;
 *               görseller yetersiz; basit görünüm devasa uygulamayı temsil
 *               edemiyor"
 * Üçüncüsüyle yatay şerit kaldırıldı; yerine kupon ve günün maçını İÇİNDE
 * taşıyan merkez geldi. Önceki iki bildirimin ölçülmüş dersleri (kontrast,
 * veriye bağlı olmayan yükseklik, bayrakla süzme) burada yeni biçimle
 * korunuyor.
 *
 * ⚠️ RENKLER İÇE AKTARILIYOR, KAYNAKTAN SÖKÜLMÜYOR. Eski test mod renklerini
 * bileşenin metninden düzenli ifadeyle okuyordu; biçim değişince körleşirdi.
 * Değerler artık saf `lib/oyunMerkezi.ts`te — bileşen de test de aynısını
 * kullanıyor, kaynak taraması yalnızca bileşenin O DEĞERLERİ kullandığını
 * doğruluyor.
 *
 * ⚠️ BU TEST İLK KOŞUMDA GERÇEK KUSUR YAKALADI (2026-09-16): yeni renklerle
 * eski alfa (0x30) kupon kartında açıklamayı 4.48'e düşürüyordu; rozet yazısı
 * 1987GS'te 3.99, havuzda 3.86 idi. Değerler taranıp yeniden seçildi.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contrast, Colors } from "../constants/colors.ts";
import {
  ACIKLAMA_RENGI, MOD_RENGI, MOD_SIRASI, ROZET_ALFA, ROZET_YAZI_ACMA, ZEMIN_UST_ALFA,
  acikTon, alfa, izgaraModlari, kuponIlerlemesi,
} from "../lib/oyunMerkezi.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const MERKEZ = oku("components/OyunMerkezi.tsx");
const KUPON = oku("components/KuponKarti.tsx");
const GUNUN = oku("components/DailyMatchCard.tsx");
const SANAT = oku("components/OyunSanati.tsx");
const EKRAN = oku("app/(tabs)/live.tsx");

/** WCAG AA — 18px altı normal metin. */
const ESIK = 4.5;

/** Üst rengi alfayla (0–1) alta bindirir. */
function bindir(ust: string, a: number, alt: string): string {
  const u = ust.replace("#", "");
  const b = alt.replace("#", "");
  let o = "#";
  for (let i = 0; i < 3; i++) {
    const cu = parseInt(u.substr(i * 2, 2), 16);
    const ca = parseInt(b.substr(i * 2, 2), 16);
    o += Math.round(cu * a + ca * (1 - a)).toString(16).padStart(2, "0");
  }
  return o;
}

/** Kart zemini: gradyanın EN RENKLİ ucu (üst) — açık yazı için en kötü durum. */
const zemin = (renk: string, ust = ZEMIN_UST_ALFA) => bindir(renk, ust / 255, Colors.card);

describe("kurulum", () => {
  test("altı mod, her biri sırada bir kez, rengi tanımlı", () => {
    assert.equal(MOD_SIRASI.length, 6);
    assert.equal(new Set(MOD_SIRASI).size, 6, "sirada tekrar eden mod var");
    for (const k of MOD_SIRASI) assert.match(MOD_RENGI[k], /^#[0-9a-f]{6}$/i, `${k} rengi gecersiz`);
  });

  test("kart zemini düz Colors.card DEĞİL — ölçüm gerçekten kaymış zeminde", () => {
    for (const k of MOD_SIRASI) assert.notEqual(zemin(MOD_RENGI[k]), Colors.card.toLowerCase());
  });

  test("alfa() ve acikTon() doğru hex üretiyor", () => {
    assert.equal(alfa(0x2a), "2a");
    assert.equal(alfa(5), "05");
    assert.equal(acikTon("#000000", 0.5), "#808080");
    assert.equal(acikTon("#a3e635", 0), "#a3e635");
  });
});

describe("KONTRAST — her mod zemininde eşik geçiliyor", () => {
  for (const k of MOD_SIRASI) {
    const renk = MOD_RENGI[k];
    const z = zemin(renk);
    test(`${k}: ad, açıklama, eylem, rozet`, () => {
      assert.ok(contrast(Colors.text, z) >= ESIK, `ad ${contrast(Colors.text, z).toFixed(2)}`);
      assert.ok(contrast(ACIKLAMA_RENGI, z) >= ESIK, `aciklama ${contrast(ACIKLAMA_RENGI, z).toFixed(2)}`);
      assert.ok(contrast(renk, z) >= ESIK, `eylem yazisi ${contrast(renk, z).toFixed(2)}`);
      const rozetZemin = bindir(renk, ROZET_ALFA / 255, z);
      const rozetYazi = acikTon(renk, ROZET_YAZI_ACMA);
      assert.ok(contrast(rozetYazi, rozetZemin) >= ESIK, `rozet ${contrast(rozetYazi, rozetZemin).toFixed(2)}`);
    });
  }

  test("dolu düğmeler: koyu yazı kupon, tamamla ve tek maç renginde okunuyor", () => {
    for (const dolgu of [MOD_RENGI.kupon, Colors.accent, MOD_RENGI.tek]) {
      assert.ok(contrast(Colors.onAccent, dolgu) >= ESIK, `${dolgu} ${contrast(Colors.onAccent, dolgu).toFixed(2)}`);
    }
  });

  test("kupon kartında boş maç uyarısı (accent) eşiği geçiyor", () => {
    const z = zemin(MOD_RENGI.kupon);
    assert.ok(contrast(Colors.accent, z) >= ESIK, `uyari ${contrast(Colors.accent, z).toFixed(2)}`);
  });

  test("bölüm alt yazısı sayfa zemininde eşiği geçiyor", () => {
    assert.ok(contrast(ACIKLAMA_RENGI, Colors.background) >= ESIK);
  });

  test("NEGATİF: eski alfa (0x30) ve eski rozet yazısı yeni renklerde EŞİĞİN ALTINDA", () => {
    /* Bu testin dayanağı: seçilen değerler keyfi değil. Biri alfayı "daha
     * canlı" diye geri büyütürse ya da rozeti düz mod rengine döndürürse
     * yukarıdaki iddialar düşer; bu da o değerlerin GERÇEKTEN düştüğünü
     * sabitliyor — düşmüyorsa ölçüm eskimiş demektir. */
    assert.ok(contrast(ACIKLAMA_RENGI, zemin(MOD_RENGI.kupon, 0x30)) < ESIK, "0x30 kupon aciklamasi artik esigi geciyor — olcum eskimis");
    const dusenRozet = MOD_SIRASI.filter((k) => {
      const z = zemin(MOD_RENGI[k]);
      return contrast(MOD_RENGI[k], bindir(MOD_RENGI[k], ROZET_ALFA / 255, z)) < ESIK;
    });
    assert.ok(dusenRozet.length > 0, "duz mod rengi rozette hic dusmuyor — acik ton gerekcesi kalmamis");
  });
});

describe("bileşenler ölçülen değerleri KULLANIYOR", () => {
  test("merkez ve kupon kartında gömülü renk yok (yalnız lib/oyunMerkezi)", () => {
    for (const [ad, src] of [["OyunMerkezi", MERKEZ], ["KuponKarti", KUPON]] as const) {
      const kod = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(kod, /["']#[0-9a-fA-F]{3,8}["']/, `${ad} icinde gomulu renk var — olculmemis ton`);
    }
  });

  test("zemin gradyanları ZEMIN_UST_ALFA ile, rozet yazıları açık tonla çiziliyor", () => {
    assert.match(MERKEZ, /renk \+ alfa\(ZEMIN_UST_ALFA\)/);
    assert.match(KUPON, /RENK \+ alfa\(ZEMIN_UST_ALFA\)/);
    assert.match(MERKEZ, /s\.rozetYazi, \{ color: acikTon\(renk, ROZET_YAZI_ACMA\) \}/, "izgara rozeti duz renk");
    assert.match(KUPON, /s\.rozetYazi, \{ color: acikTon\(RENK, ROZET_YAZI_ACMA\) \}/, "kupon rozeti duz renk");
    assert.match(MERKEZ, /s\.bagCipYazi, \{ color: acikTon\(MOD_RENGI\.tek, ROZET_YAZI_ACMA\) \}/, "tum maclar cipi duz renk");
    assert.match(MERKEZ, /aciklama:\s*\{ color: ACIKLAMA_RENGI/, "genis kart aciklamasi olculen tonu kullanmiyor");
    assert.match(MERKEZ, /izgaraAciklama:\s*\{ color: ACIKLAMA_RENGI/, "izgara aciklamasi olculen tonu kullanmiyor");
  });
});

describe("OTURMAMIŞ DÜZEN — yükseklik veriye bağlı değil (2026-08-31 dersi)", () => {
  test("bedel rozeti sabit yükseklikli kabın İÇİNDE, koşullu", () => {
    assert.match(MERKEZ, /rozetKabi:\s*\{ height: 22/, "rozet kabi sabit yukseklikli degil");
    const kap = MERKEZ.indexOf("<View style={s.rozetKabi}>");
    const kosul = MERKEZ.indexOf("{m.bedel ? (");
    assert.ok(kap > 0 && kosul > kap && kosul - kap < 80, "kosullu bedel sabit kabin disinda");
  });

  test("ızgara açıklaması üç satırlık yer ayırıyor", () => {
    assert.match(MERKEZ, /izgaraAciklama:[^}]*minHeight: 48/, "aciklama minHeight kalkmis");
    assert.match(MERKEZ, /<Text style=\{s\.izgaraAciklama\} numberOfLines=\{3\}>/);
  });
});

describe("HEMEN OYNA — kupon ve günün maçı merkezin İÇİNDE", () => {
  test("live.tsx kupon ve günün maçını AYRICA çizmiyor (aynı oyun iki kez görünmez)", () => {
    assert.doesNotMatch(EKRAN, /<KuponKarti\b/, "live.tsx kupon kartini ayrica ciziyor");
    assert.doesNotMatch(EKRAN, /<DailyMatchCard\b/, "live.tsx gunun macini ayrica ciziyor");
    assert.match(MERKEZ, /<KuponKarti\b/, "merkez kuponu cizmiyor");
    assert.match(MERKEZ, /<DailyMatchCard\s+gomulu\b/, "merkez gunun macini gomulu cizmiyor");
  });

  test("gömülü kartlar yalnız TAM modda — kompakt satır önce dönüyor", () => {
    const erken = MERKEZ.indexOf("if (!tam) {");
    assert.ok(erken > 0, "kompakt erken donus yok");
    assert.ok(MERKEZ.indexOf("<KuponKarti") > erken, "kupon karti kompakt donusten once");
    assert.ok(MERKEZ.indexOf("<DailyMatchCard") > erken, "gunun maci kompakt donusten once");
    assert.match(EKRAN, /tam=\{mode === "schedule" \|\| mode === "open"\}/, "tam bayragi mac listesi moduna bagli degil");
  });

  test("günün maçı yoksa Tek Maç kartı boş kalmıyor", () => {
    assert.match(GUNUN, /if \(!fixture\) return bosken \? <>\{bosken\}<\/> : null;/, "bosken dugumu cizilmiyor");
    assert.match(MERKEZ, /bosken=\{\s*<Basinc onPress=\{tahmineGit\}/, "tek mac bos durumunda eylem yok");
  });

  test("gömülüyken günün maçı kendi kutusunu çizmiyor (iç içe iki kart yok)", () => {
    assert.match(GUNUN, /const kap = gomulu \? s\.gomuluKap : s\.card;/);
    assert.match(GUNUN, /\{!gomulu && <GradyanZemin/);
  });

  test("kupon yokken nedeni AYRILIYOR: yalnız sunucu cevap verdiyse 'hazırlanıyor'", () => {
    assert.match(KUPON, /setNeden\(j\?\.ok \? "yok" : "bilinmiyor"\)/, "neden sunucu cevabina bagli degil");
    assert.match(KUPON, /if \(!kupon\) return bosken \? <>\{bosken\(neden\)\}<\/> : null;/);
    assert.match(MERKEZ, /ust=\{neden === "yok" \? t\("kuponSoon"\) : null\}/,
      "misafire/ag hatasinda da 'kupon hazirlaniyor' deniyor — kupon acikken yalan");
  });
});

describe("SIRA", () => {
  test("marka bandı < oyun merkezi < skor merkezi", () => {
    const marka = EKRAN.indexOf("MARKA BANDI");
    const merkez = EKRAN.indexOf("<OyunMerkezi");
    const skor = EKRAN.indexOf("<SkorMerkezi");
    assert.ok(marka > 0 && merkez > 0 && skor > 0, "bloklardan biri ekranda yok");
    assert.ok(marka < merkez, "marka bandi merkezin altina dusmus");
    assert.ok(merkez < skor, "oyun merkezi skor merkezinin altinda kalmis");
  });

  test("beceri modları önde, kesinti/havuz mekaniği (düello, havuz) EN SONDA", () => {
    assert.deepEqual(MOD_SIRASI.slice(-2), ["duello", "havuz"]);
    assert.deepEqual(MOD_SIRASI.slice(0, 2), ["kupon", "tek"], "birincil oyunlar basta degil");
  });

  test("izgaraModlari: tam modda kupon ve tek ÇIKARILIYOR, sıra korunuyor", () => {
    const hepsi = MOD_SIRASI.map((key) => ({ key }));
    assert.deepEqual(izgaraModlari(hepsi, true).map((m) => m.key), ["mini", "gs1987", "duello", "havuz"]);
    assert.deepEqual(izgaraModlari(hepsi, false).map((m) => m.key), [...MOD_SIRASI]);
    const gizli = hepsi.filter((m) => m.key !== "duello" && m.key !== "havuz");
    assert.deepEqual(izgaraModlari(gizli, true).map((m) => m.key), ["mini", "gs1987"]);
  });
});

describe("kuponIlerlemesi", () => {
  const maclar = ["a", "b", "c", "d"].map((fixtureId) => ({ fixtureId }));

  test("katılmadı → katil, dolu parça yok", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: false, tahminlerim: null });
    assert.equal(r.asama, "katil");
    assert.deepEqual(r.dolular, [false, false, false, false]);
    assert.equal(r.macSayisi, 4);
  });

  test("katıldı, eksik → eksik ve parçalar MAÇ SIRASIYLA", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: true, tahminlerim: { b: "H", d: "A" } });
    assert.equal(r.asama, "eksik");
    assert.equal(r.girilen, 2);
    assert.equal(r.eksik, 2);
    assert.deepEqual(r.dolular, [false, true, false, true]);
  });

  test("kupondan düşmüş maçın tahmini SAYILMIYOR (anahtar sayımı 4/4 derdi)", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: true, tahminlerim: { a: "H", b: "D", c: "A", eski: "H" } });
    assert.equal(r.girilen, 3);
    assert.equal(r.asama, "eksik", "eski macin tahmini kuponu tamam gosterdi — bos mac yanlis sayilir");
  });

  test("hepsi dolu → tamam; boş/veri yok → güvenli", () => {
    const r = kuponIlerlemesi({ maclar, katildiMi: true, tahminlerim: { a: "H", b: "D", c: "A", d: "H" } });
    assert.equal(r.asama, "tamam");
    assert.deepEqual(kuponIlerlemesi(null), { macSayisi: 0, girilen: 0, eksik: 0, asama: "katil", dolular: [] });
  });

  test("kart ilerlemeyi bu fonksiyondan çiziyor", () => {
    assert.match(KUPON, /const ilerleme = kuponIlerlemesi\(kupon\);/);
    assert.match(KUPON, /ilerleme\.dolular\.map\(/);
    assert.doesNotMatch(KUPON, /Object\.keys\(kupon\.tahminlerim\)/, "anahtar sayimi geri gelmis");
  });

  test("eksikken boş maç sayısı kaybolmuyor (ilerleme satırında), düğme kısa", () => {
    /* 360 px'de "Tamamla · 3 maç boş" kesiliyordu (önizlemede ölçüldü). Sayı
     * düğmeden çıktı ama kullanıcıya hâlâ söylenmeli — BOŞ MAÇ YANLIŞ SAYILIYOR. */
    assert.match(KUPON, /\? t\("kuponMissingShort", \{ n: ilerleme\.eksik \}\)/, "bos mac sayisi ekrandan kalkmis");
    assert.match(KUPON, /ilerleme\.asama === "eksik" \? \{ yazi: t\("kuponFill"\), zemin: Colors\.accent \}/,
      "eksik dugmesi yine uzun metin tasiyor");
  });
});

describe("çizimler", () => {
  test("gradyan kimlikleri örnek başına üretiliyor (sabit id yok)", () => {
    assert.doesNotMatch(SANAT, /\bid="/, "sabit svg id — iki kart ayni ekranda renk karistirir");
    assert.match(SANAT, /useRef\(`\$\{onek\}\$\{\+\+sayac\}`\)/);
  });

  test("web'de geçersiz DOM özelliği üreten rotation/origin kullanılmıyor", () => {
    /* Önizlemede ölçüldü: <G rotation origin> web'de "Invalid DOM property
     * transform-origin" uyarısı verdi. transform dizesi her platformda aynı. */
    assert.doesNotMatch(SANAT, /\b(rotation|origin)=\{?/);
  });

  test("her modun çizimi merkezde bağlı", () => {
    for (const ad of ["KuponSanati", "TekMacSanati", "MiniSanati", "GsSanati", "DuelloSanati", "HavuzSanati"]) {
      assert.match(SANAT, new RegExp(`export function ${ad}\\(`), `${ad} tanimli degil`);
      assert.match(MERKEZ, new RegExp(`\\b${ad}\\b`), `${ad} merkezde kullanilmiyor`);
    }
  });
});
