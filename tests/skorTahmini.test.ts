/**
 * SKOR TAHMİNİ nöbetçisi — kartın saf mantığı ve yapı kuralları.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-17): "Ayrı ama ana akımda bir maç skoru
 * tahmini alanı yazalım ve SkorLig ana ekranında verelim. Tek maç şeklinde
 * olsun." Puan, ödül ve para SUNUCUDA (api/lib/skor-tahmini.cjs, kendi
 * testleriyle); burada yalnız gösterim kararları ölçülüyor.
 *
 * Emülatörde (Türkçe) görülen üç kusurun nöbetçisi de burada:
 *   · Geçici ağ hatasında kart iskeletten sonra KALICI olarak kayboluyordu
 *     (token yenilenemedi → NETWORK → `return null`).
 *   · Kapanmış, tahminsiz maçta "0 : 0" gerçek skor gibi okunuyordu.
 *   · Sonuçlanmış maçta büyük rakamlar TAHMİNİ gösteriyordu, sonuç sanılıyordu.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MAKS_GOL, eylemDurumu, golAyarla, ilkTaslak, oneCikanMac, puanIsaretli, type SkorMaci,
} from "../lib/skorTahmini.ts";
import { t, setLang } from "../lib/i18n.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
/** Yorumları atar — kural anlatan notlar yasaklı kalıpları ANARKEN testi düşürmesin. */
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const KART = oku("components/SkorTahminiKarti.tsx");
const EKRAN = oku("app/skor-tahmini.tsx");
const MERKEZ = oku("components/OyunMerkezi.tsx");
const MANTIK = oku("lib/skorTahmini.ts");

function mac(o: Partial<SkorMaci> = {}): SkorMaci {
  return {
    fixtureId: "f1", ulke: "Türkiye", home: "Trabzonspor", away: "Galatasaray",
    league: "Süper Lig", kickoffISO: "2026-09-19T17:00:00.000Z", haftaKey: "2026-W38",
    kilitli: false, benim: null, ...o,
  };
}

describe("golAyarla", () => {
  test("0..MAKS_GOL arasında kalır", () => {
    assert.equal(golAyarla(0, -1), 0);
    assert.equal(golAyarla(2, 1), 3);
    assert.equal(golAyarla(MAKS_GOL, 1), MAKS_GOL);
    assert.equal(MAKS_GOL, 15);
  });

  test("bozuk girdi sıfırdan başlar, kesir yuvarlanır", () => {
    assert.equal(golAyarla(NaN, 1), 1);
    assert.equal(golAyarla(2.6, 0), 3);
  });
});

describe("oneCikanMac", () => {
  const a = mac({ fixtureId: "a", kickoffISO: "2026-09-14T17:00:00.000Z", kilitli: true });
  const b = mac({ fixtureId: "b", kickoffISO: "2026-09-19T17:00:00.000Z" });
  const c = mac({ fixtureId: "c", kickoffISO: "2026-09-17T19:00:00.000Z" });

  test("tahmine AÇIK olanların en erkeni", () => {
    assert.equal(oneCikanMac([a, b, c])?.fixtureId, "c");
  });

  test("hepsi kapalıysa en son başlayan", () => {
    const kapali = [a, b, c].map((m) => ({ ...m, kilitli: true }));
    assert.equal(oneCikanMac(kapali)?.fixtureId, "b");
  });

  test("boş/bozuk → null; girdi dizisi değişmez", () => {
    assert.equal(oneCikanMac([]), null);
    assert.equal(oneCikanMac(null), null);
    /* Hepsi kapalı: yerinde sıralama yalnız bu dalda olur — açık maçlı liste
     * `filter`dan geçtiği için kusuru gizliyordu (negatif kontrolde kaçtı). */
    const liste = [a, b, c].map((m) => ({ ...m, kilitli: true }));
    oneCikanMac(liste);
    assert.deepEqual(liste.map((m) => m.fixtureId), ["a", "b", "c"]);
  });
});

describe("eylemDurumu", () => {
  test("beş durum", () => {
    assert.equal(eylemDurumu(mac(), { home: 0, away: 0 }), "gonder");
    const benim = { home: 1, away: 2, sonuc: null };
    assert.equal(eylemDurumu(mac({ benim }), { home: 1, away: 2 }), "kayitli");
    assert.equal(eylemDurumu(mac({ benim }), { home: 2, away: 2 }), "guncelle");
    assert.equal(eylemDurumu(mac({ kilitli: true, benim }), { home: 5, away: 0 }), "kilitli");
    assert.equal(eylemDurumu(mac({ kilitli: true, benim: { ...benim, sonuc: { puan: 9 } } }), { home: 1, away: 2 }), "sonuclandi");
  });

  test("maç yoksa düğme yok (kilitli)", () => {
    assert.equal(eylemDurumu(null, { home: 0, away: 0 }), "kilitli");
  });

  test("sonuç, kilitten ÖNCE gelir — sonuçlanmış maç 'kapandı' yazmaz", () => {
    const benim = { home: 0, away: 0, sonuc: { iade: true, iadeLc: 1 } };
    assert.equal(eylemDurumu(mac({ kilitli: true, benim }), { home: 0, away: 0 }), "sonuclandi");
  });
});

describe("ilkTaslak ve puanIsaretli", () => {
  test("taslak kendi tahminimden, yoksa 0-0", () => {
    assert.deepEqual(ilkTaslak(mac({ benim: { home: 3, away: 1, sonuc: null } })), { home: 3, away: 1 });
    assert.deepEqual(ilkTaslak(mac()), { home: 0, away: 0 });
    assert.deepEqual(ilkTaslak(null), { home: 0, away: 0 });
  });

  test("işaretli puan: +12 · 0 · −4 (U+2212, tire değil)", () => {
    assert.equal(puanIsaretli(12), "+12");
    assert.equal(puanIsaretli(0), "0");
    assert.equal(puanIsaretli(-4), "−4");
    assert.equal(puanIsaretli(null), "0");
  });
});

describe("puan formülü mobilde YOK", () => {
  test("mantık dosyası puan hesaplamıyor; kurallar ekranı örneği sunucudan çiziyor", () => {
    /* İki kopya ayrışırsa oyuncuya gösterilen puan ödenen puandan farklı olur. */
    assert.doesNotMatch(kod(MANTIK), /Math\.abs|Math\.sign|function puanla/);
    assert.doesNotMatch(kod(EKRAN), /Math\.abs|Math\.sign|function puanla/);
    assert.match(EKRAN, /kural\.ornek\.satirlar\.map\(/);
  });
});

describe("ana ekran yerleşimi", () => {
  test("kart Tek Maç'tan SONRA, 'Diğer oyunlar'dan ÖNCE ve yalnız bayrak açıkken", () => {
    const k = kod(MERKEZ);
    assert.match(k, /const skorVar = gorunenModlar\.some\(\(m\) => m\.key === "skor"\);/);
    const tek = k.indexOf("<DailyMatchCard");
    const skor = k.indexOf("{skorVar && <SkorTahminiKarti />}");
    const diger = k.indexOf('t("otherGames")');
    assert.ok(tek > 0, "Tek Mac karti bulunamadi");
    assert.ok(diger > 0, "diger oyunlar bolumu bulunamadi");
    assert.ok(skor > tek, "Skor Tahmini karti Tek Mac'tan once ya da yok");
    assert.ok(skor < diger, "Skor Tahmini karti 'Diger oyunlar'dan sonra");
    /* Kart bir kez çiziliyor ve diğer oyunlar satırlarına da düşmüyor. */
    assert.equal(k.split("<SkorTahminiKarti").length - 1, 1);
  });

  test("kartın bağlantısı kurallar/sıralama ekranına gidiyor", () => {
    assert.match(KART, /router\.push\("\/skor-tahmini" as any\)/);
  });
});

describe("kart davranışı", () => {
  test("oturum hazır olmadan istek yok", () => {
    assert.match(KART, /if \(oturumYukleniyor\) return;\s*\n\s*yukle\(\);/);
  });

  test("YALNIZ özellik kapalıyken gizlenir; geçici hatada 'Tekrar dene'", () => {
    const k = kod(KART);
    assert.match(k, /setHata\(j\?\.error === "FEATURE_DISABLED" \? "kapali" : "gecici"\);/);
    assert.match(k, /if \(hata === "kapali"\) return null;/);
    assert.doesNotMatch(k, /if \(hata\) return null;/);
    const gecici = k.slice(k.indexOf('if (hata === "gecici" && !maclar)'), k.indexOf("if (!maclar)"));
    assert.ok(gecici.length > 50, "gecici hata dali bulunamadi");
    assert.match(gecici, /t\("retry"\)/);
    assert.match(gecici, /yukle\(\)/);
  });

  test("sonuçlanmışsa büyük rakamlar GERÇEK skor; kapanmış tahminsiz maçta tire", () => {
    const k = kod(KART);
    assert.match(k, /const gercek = durum === "sonuclandi" \? secili\?\.benim\?\.sonuc\?\.gercek \?\? null : null;/);
    assert.match(k, /gercek \? gercek\[taraf\] : duzenlenebilir \|\| secili\?\.benim \? taslak\[taraf\] : null/);
    assert.match(k, /\{gol \?\? "–"\}/);
  });

  test("gönderim çift basılamaz", () => {
    assert.match(KART, /if \(!secili \|\| gonderiliyor \|\| \(durum !== "gonder" && durum !== "guncelle"\)\) return;/);
  });
});

describe("kurallar ekranı", () => {
  test("bayrak kapalıysa içerik çizilmez", () => {
    assert.match(EKRAN, /if \(!ozellik\.skor\) return <OzellikKapali \/>;/);
  });

  test("ağ hatası 'boş' diye gösterilmez", () => {
    const k = kod(EKRAN);
    assert.match(k, /maclarHata \? t\("netErr"\) : t\("skorNoMatch"\)/);
    assert.match(k, /tabloHata \? t\("netErr"\) : t\("skorEmptyTable"\)/);
    assert.match(k, /acikMac === m\.fixtureId && siralamaHata &&/);
  });
});

describe("yapı — v35 cihaz dersi (metin taşıyan yüzeyler düz)", () => {
  for (const [ad, src] of [["SkorTahminiKarti", KART], ["skor-tahmini ekranı", EKRAN]] as const) {
    test(`${ad}: saydam renk, gömülü renk, gradyan, kenarlık, mutlak konum YOK`, () => {
      const k = kod(src);
      assert.doesNotMatch(k, /GradyanZemin/);
      assert.doesNotMatch(k, /["'`]#[0-9a-fA-F]{3,8}["'`]/, "gomulu renk");
      assert.doesNotMatch(k, /rgba\(|\+\s*["'`][0-9a-fA-F]{2}["'`]/, "saydam renk");
      assert.doesNotMatch(k, /position:\s*["']absolute["']/);
      const kenar = [...k.matchAll(/border(?:Top|Bottom|Left|Right)?Width:\s*[^,}\n]+/g)].map((m) => m[0]);
      assert.deepEqual(kenar.filter((x) => !/borderTopWidth:\s*StyleSheet\.hairlineWidth/.test(x)), []);
    });
  }
});

describe("çeviriler", () => {
  beforeEach(() => setLang("tr"));

  test("kartta ve ekranda kullanılan her anahtar TR ve EN'de var", () => {
    const anahtarlar = new Set(
      [...(KART + EKRAN).matchAll(/\bt\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
    );
    assert.ok(anahtarlar.size >= 20, `beklenenden az anahtar: ${anahtarlar.size}`);
    for (const dil of ["tr", "en"] as const) {
      setLang(dil);
      const eksik = [...anahtarlar].filter((a) => t(a as any) === a);
      assert.deepEqual(eksik, [], `${dil} eksik anahtar`);
    }
  });

  test("Türkçe örnekler", () => {
    assert.equal(t("skorSend", { n: 1 }), "Tahmini gönder · 1 LC");
    assert.equal(t("skorLockedNone"), "Bu maç için tahminler kapandı");
  });
});
