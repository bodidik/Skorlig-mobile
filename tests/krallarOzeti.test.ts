/**
 * ANA EKRAN KRALLAR ÖZETİ — ilk 5, Krallar sekmesiyle AYNI tablo.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-17): "ana ekranda kralların ilk 5 sırasını
 * gösteren bir alan … isteyen listeyi devamına tıklayarak krallar kısmından
 * devam edebilsin."
 *
 * Asıl değişmez: özetteki 1–5 ile Krallar sekmesindeki 1–5 aynı kişiler, aynı
 * puan yazımıyla. Emülatörde ölçüldü: ilk yazımda özet "142.5", sekme "143"
 * diyordu (sekme Math.round kullanıyor).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contrast } from "../constants/colors.ts";
import { ilkBes, ozetPuani, OZET_UCU, OZET_ADEDI, siraRozeti } from "../lib/krallarOzeti.ts";
import { IC_YUZEY } from "../lib/oyunMerkezi.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

const SATIRLAR = [
  { userId: "c", totalPoints: 96 },
  { userId: "a", totalPoints: 142.5 },
  { userId: "Ben", totalPoints: 117.25 },
  { userId: "d", totalPoints: 88.5 },
  { userId: "b", totalPoints: 128 },
  { userId: "e", totalPoints: 41 },
];

describe("ilkBes", () => {
  test("puana göre azalan, ilk 5, sıra indeks+1", () => {
    const r = ilkBes(SATIRLAR, null);
    assert.deepEqual(r.map((x) => x.userId), ["a", "b", "Ben", "c", "d"]);
    assert.deepEqual(r.map((x) => x.sira), [1, 2, 3, 4, 5]);
    assert.equal(OZET_ADEDI, 5);
  });

  test("Krallar sekmesinin sıralamasıyla birebir (aynı ifade)", () => {
    /* kings.tsx: .slice().sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0)).map((it, idx) => rank idx+1) */
    const sekme = SATIRLAR.slice().sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0)).map((it, idx) => ({ ...it, rank: idx + 1 }));
    const ozet = ilkBes(SATIRLAR, null);
    for (let i = 0; i < ozet.length; i++) {
      assert.equal(ozet[i].userId, sekme[i].userId);
      assert.equal(ozet[i].sira, sekme[i].rank);
    }
    const kings = oku("app/(tabs)/kings.tsx");
    assert.match(kings, /\.sort\(\(a, b\) => \(b\.totalPoints \|\| 0\) - \(a\.totalPoints \|\| 0\)\)/,
      "Krallar sekmesinin siralama ifadesi degismis — ozet ayrisabilir");
  });

  test("eşit puanda sunucu sırası korunuyor (kararlı)", () => {
    const r = ilkBes([{ userId: "x", totalPoints: 10 }, { userId: "y", totalPoints: 10 }], null);
    assert.deepEqual(r.map((x) => x.userId), ["x", "y"]);
  });

  test("kendi satırı büyük/küçük harf duyarsız işaretleniyor; boş kimlik kimseyi işaretlemiyor", () => {
    assert.deepEqual(ilkBes(SATIRLAR, "ben").map((x) => x.ben), [false, false, true, false, false]);
    assert.ok(ilkBes(SATIRLAR, "").every((x) => !x.ben));
    assert.deepEqual(ilkBes(null, "x"), []);
  });

  test("puan yazımı Krallar sekmesiyle aynı yuvarlama", () => {
    assert.equal(ozetPuani(142.5), "143");
    assert.equal(ozetPuani(117.25), "117");
    assert.equal(ozetPuani(null), "0");
    const kings = oku("app/(tabs)/kings.tsx");
    assert.match(kings, /Math\.round\(row\.totalPoints \|\| 0\)/, "sekme yuvarlamasi degismis — ozet ayrisabilir");
  });
});

describe("uç ve bot kuralı Krallar ile aynı", () => {
  test("aynı uç, yalnız limit farklı; humans süzgeci YOK (sekme de süzmüyor)", () => {
    assert.equal(OZET_UCU, "/api/rt/totals?limit=5");
    const kings = oku("app/(tabs)/kings.tsx");
    assert.match(kings, /apiFetch\(`\/api\/rt\/totals\?limit=\$\{sinir\}`\)/, "Krallar sekmesinin ucu degismis");
    assert.doesNotMatch(kings, /humans=1/, "Krallar botlari suzuyor artik — ozet de suzmeli");
  });
});

describe("ekrana bağlı", () => {
  const EKRAN = oku("app/(tabs)/live.tsx");
  const OZET = oku("components/KrallarOzeti.tsx");

  test("live.tsx özeti maç listesi modlarında, Oyun Merkezi'nden sonra, Skor Merkezi'nden önce çiziyor", () => {
    const i = EKRAN.indexOf("<KrallarOzeti");
    assert.ok(i > 0, "ozet ekranda yok");
    assert.ok(EKRAN.indexOf("<OyunMerkezi") < i && i < EKRAN.indexOf("<SkorMerkezi"), "ozet yanlis yerde");
    assert.match(EKRAN, /\(mode === "schedule" \|\| mode === "open"\) && <KrallarOzeti userId=\{userId\} \/>/);
  });

  test("'devamı' Krallar sekmesine, satır profile gidiyor", () => {
    assert.match(OZET, /router\.push\("\/\(tabs\)\/kings" as any\)/);
    assert.match(OZET, /pathname: "\/profile\/\[userId\]"/);
    assert.match(OZET, /t\("kingsSeeMore"\)/);
  });

  test("Krallar sekmesi tanımlı ve başlığı çevrilmiş (alt çubukta 'kings' yazmıyor)", () => {
    assert.match(oku("app/(tabs)/_layout.tsx"), /<Tabs\.Screen name="kings" options=\{\{ title: t\("kingsTab"\) \}\} \/>/);
    assert.match(oku("components/TabBar.tsx"), /kings:\s*\{ aktif: "trophy"/);
  });

  test("hata olursa boş kutu yok; boş tabloda açıklama var", () => {
    assert.match(OZET, /if \(hata\) return null;/);
    assert.match(OZET, /satirlar\.length === 0 \? \(\s*<Text style=\{parca\.aciklama\}>\{t\("kingsEmpty"\)\}/);
  });
});

describe("sıra rozetleri okunuyor", () => {
  test("rozet yazısı her rozette ≥ 4.5; 4–5 rozeti iç yüzey tonu", () => {
    for (const sira of [1, 2, 3, 4, 5]) {
      const r = siraRozeti(sira);
      assert.ok(contrast(r.yazi, r.zemin) >= 4.5, `${sira}. rozet ${contrast(r.yazi, r.zemin).toFixed(2)}`);
    }
    assert.equal(siraRozeti(4).zemin.toLowerCase(), IC_YUZEY.toLowerCase());
  });
});
