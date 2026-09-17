/**
 * ANA EKRAN KART YÜZEYİ — zeminden ayrılıyor, yazılar okunuyor, tek ton.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-17): "Ana ekran başta olmak üzere zemin rengiyle
 * kutuların rengi arasındaki benzerliği biraz daha düşürelim. Tam bir ayrımdan
 * ziyade … koyu mavi, çok hafif dark yeşile doğru açılabilir."
 *
 * ÖLÇÜLDÜ: eski kart #0f172a sayfa zemininde (#030d18) 1.09 — kart ile zemin
 * neredeyse aynıydı. Yeni #132b36: 1.33. Alt/üst sınır testte: 1.25'in altı
 * "ayrılmıyor" şikâyetine döner, 1.6'nın üstü kullanıcının istemediği "tam
 * ayrım"a gider.
 *
 * ⚠️ TEK TON: ana ekran bileşenleri kart rengini elle `"#0f172a"` diye
 * yazıyordu (8 yer). Yalnız Oyun Merkezi değişseydi ekran iki tonlu kalırdı;
 * hepsi `Colors.card`a bağlandı ve burada sınanıyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contrast, Colors } from "../constants/colors.ts";
import { IC_YUZEY, KART_ZEMINI, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, MOD_RENGI } from "../lib/oyunMerkezi.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ESIK = 4.5;

describe("kart ve zemin", () => {
  test("kart zeminden AYRILIYOR ama sert değil (1.25–1.6)", () => {
    const k = contrast(Colors.card, Colors.bg);
    assert.ok(k >= 1.25, `kart zeminde ${k.toFixed(2)} — ayrilmiyor (eski #0f172a 1.09 idi)`);
    assert.ok(k <= 1.6, `kart zeminde ${k.toFixed(2)} — kullanici "tam ayrim" istemedi`);
  });

  test("iç yüzey karttan ayrılıyor", () => {
    const k = contrast(Colors.cardInner, Colors.card);
    assert.ok(k >= 1.15, `ic yuzey kartta ${k.toFixed(2)}`);
  });

  test("Oyun Merkezi tonları global kart tonuyla AYNI (tek ton)", () => {
    assert.equal(KART_ZEMINI.toLowerCase(), Colors.card.toLowerCase(), "merkez karti ana ekranin diger kartlarindan farkli tonda");
    assert.equal(IC_YUZEY.toLowerCase(), Colors.cardInner.toLowerCase());
  });

  test("ton mavi-yeşil: mavi kanal kırmızıdan belirgin yüksek, yeşil kırmızıdan yüksek", () => {
    /* "koyu mavi, çok hafif dark yeşile doğru" — gri ya da mor kaymasın. */
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(Colors.card.slice(i, i + 2), 16));
    assert.ok(b > r + 20 && g > r + 10, `ton ${Colors.card} mavi-yesil degil`);
  });
});

describe("yazılar yeni kartta okunuyor", () => {
  test("metin tonları kartta ve iç yüzeyde ≥ 4.5", () => {
    for (const zemin of [Colors.card, Colors.cardInner]) {
      for (const [ad, yazi] of Object.entries({ METIN_ANA, METIN_IKINCIL, METIN_SOLUK, mutedOnCard: Colors.mutedOnCard })) {
        const k = contrast(yazi, zemin);
        assert.ok(k >= ESIK, `${ad} ${zemin} uzerinde ${k.toFixed(2)}`);
      }
    }
  });

  test("mod vurguları kartta ≥ 4.5", () => {
    for (const [k, r] of Object.entries(MOD_RENGI)) {
      assert.ok(contrast(r, Colors.card) >= ESIK, `${k} ${contrast(r, Colors.card).toFixed(2)}`);
    }
  });

  test("NEGATİF: Colors.muted kartta eşiğin ALTINDA — mutedOnCard'ın gerekçesi", () => {
    assert.ok(contrast(Colors.muted, Colors.card) < ESIK,
      "Colors.muted kartta artik okunuyor — mutedOnCard gereksizlesmis, sadelestir");
  });
});

describe("ana ekran bileşenleri kart rengini sabitten alıyor", () => {
  const DOSYALAR = [
    "components/SkorMerkezi.tsx", "components/NasilOynanirSeridi.tsx", "components/AramaKutusu.tsx",
    "components/StreakBar.tsx", "components/QuickPickCard.tsx", "components/QuickPlaySection.tsx",
    "components/OyunKartParcalari.tsx", "components/KrallarOzeti.tsx",
  ];
  for (const d of DOSYALAR) {
    test(`${d}: eski kart rengi ve kartta okunmayan soluk yazı elle yazılmamış`, () => {
      const k = kod(oku(d));
      assert.doesNotMatch(k, /["']#0f172a["']/i, "eski kart rengi elle yazilmis — ekran iki tonlu kalir");
      /* Yalnız YAZI stilleri: `{ key: "draw", color: "#64748b" }` gibi düğme
       * ÇERÇEVE renkleri (anahtar/etiket taşıyan nesneler) sayılmıyor. */
      const yazi = k.split("\n").filter((l) => !/\b(key|label|api):/.test(l)).join("\n");
      /* `(?<![A-Za-z])`: `borderColor:` yazı rengi değil (ilk hâli onu da yakalıyordu). */
      assert.doesNotMatch(yazi, /(?<![A-Za-z])color:\s*["']#(64748b|475569)["']/, "kart ustunde okunmayan soluk yazi");
    });
  }

  test("live.tsx maç kartı ve çipler Colors.card", () => {
    const s = oku("app/(tabs)/live.tsx");
    assert.match(s, /const cardBg = selected \? "#1e1b4b" : isLive \? "#071a0f" : Colors\.card;/);
    assert.match(s, /backgroundColor: secili \? "#1d4ed822" : Colors\.card,/);
  });
});
