import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { t, setLang } from "../lib/i18n.ts";

/**
 * 1987 BONUS İPUCU — "bu maçta bonusun geçiyor mu" ÖDEMEDEN ÖNCE yazıyor.
 *
 * ⚠️ ÖLÇÜLEN BOŞLUK (2026-09-12): bonus cebi yalnızca GALATASARAY maçlarında
 * harcanıyor (api/lib/gs1987.cjs). Üye bunu ancak tahmini gönderdikten SONRA,
 * `/predict` yanıtındaki `bonus1987Kanali` alanından öğreniyordu — para
 * çıktıktan sonra. Sunucu artık aynı alanı LİSTEDE de gönderiyor ve ekran
 * maç kartında basıyor.
 *
 * ⚠️ ALAN ÜÇ DEĞERLİ ve ekranın bunu bozmaması kritik:
 *     null  → kullanıcı üye değil  → satır HİÇ basılmaz
 *     true  → bonus cebinden düşecek
 *     false → üye ama GS maçı değil → normal bakiyeden
 * `pick.bonus1987Kanali && …` gibi truthy bir kontrol `false` ile `null`u
 * aynı kovaya atar; o zaman "bonusun bu maçta geçmez" satırı üye OLMAYANA da
 * görünür — hiç bonusu olmayan birine bonus vaadi. Deponun kayıtlı
 * "değerlendiremedim ile olumsuz karışıyor" sınıfı.
 *
 * Sunucu tarafındaki eşi: api/tests/1987-bonus-kanali-listede.mongo.test.cjs
 * (orada ilanın parayla TUTTUĞU da ölçülüyor).
 */

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

describe("bonus ipucu — üç değerli alan", () => {
  test("ekran null ile false'u AYIRIYOR", () => {
    const src = oku("components/Picks1987.tsx");
    assert.match(src, /pick\.bonus1987Kanali != null/,
      "ipucu `!= null` ile elenmiyor — uye olmayana da basilabilir");
    assert.doesNotMatch(src, /\{\s*pick\.bonus1987Kanali\s*&&/,
      "truthy kontrol: false ile null ayni kovaya dusuyor");
  });

  test("iki durum için AYRI metin var", () => {
    const src = oku("components/Picks1987.tsx");
    assert.match(src, /bonus1987Applies/, "bonus GECEN mac metni yok");
    assert.match(src, /bonus1987NotHere/, "bonus GECMEYEN mac metni yok");
  });
});

describe("metinler", () => {
  test("iki dilde de var ve birbirinden farklı", () => {
    setLang("tr");
    const trA = t("bonus1987Applies"), trN = t("bonus1987NotHere");
    setLang("en");
    const enA = t("bonus1987Applies"), enN = t("bonus1987NotHere");
    setLang("tr");

    for (const [ad, m] of [["tr/applies", trA], ["tr/notHere", trN],
      ["en/applies", enA], ["en/notHere", enN]] as const) {
      assert.ok(m && m.length > 5 && !m.startsWith("bonus1987"),
        `${ad} metni cevrilmemis: ${JSON.stringify(m)}`);
    }
    assert.notEqual(trA, trN, "geciyor ve gecmiyor AYNI metin");
    assert.notEqual(enA, enN, "geciyor ve gecmiyor AYNI metin (en)");
  });

  test("cüzdan satırı bonusun KAPSAMINI doğru anlatıyor", () => {
    /**
     * ⚠️ ESKİ METİN YANLIŞ BİLGİYDİ: "1987 oyunlarında önce bundan düşer".
     * Bonus bu ucun HER maçında değil, yalnızca Galatasaray maçlarında
     * geçiyor (ölçüldü 2026-09-11: haftalık pencerede açık 56 maçın 0'ı
     * GS'ydi). Üye cebinin her maçta geçtiğini sanıyordu.
     */
    setLang("tr");
    const satir = t("bonus1987Line", { n: 8 });
    assert.match(satir, /Galatasaray/,
      `cuzdan satiri kapsami soylemiyor: ${JSON.stringify(satir)}`);
    setLang("en");
    assert.match(t("bonus1987Line", { n: 8 }), /Galatasaray/,
      "ingilizce satir kapsami soylemiyor");
    setLang("tr");
  });
});
