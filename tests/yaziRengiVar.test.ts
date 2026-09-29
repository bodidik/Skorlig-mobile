/**
 * KOYU ZEMİNDE RENKSİZ YAZI = SİYAH = GÖRÜNMEZ.
 *
 * KULLANICI BİLDİRİMİ (2026-09-29): *"profil sayfasındaki renkler
 * anlaşılırlığı azaltıyor. Mesela benimkiler yazısı siyah ve okunmuyor."*
 *
 * ÖLÇÜLDÜ: React Native'de `<Text>` rengi verilmezse SİYAH basılır; uygulamanın
 * kartları koyu (`#0f172a`). Profilde 11 etiket bu yüzden **1.18** kontrastla
 * çiziliyordu (eşik 4.5). Düzeltmeden sonra 14.48.
 *
 * ⚠️ HER RENKSİZ YAZI KUSUR DEĞİL — iki meşru durum ölçüldü ve bu yüzden
 * ölçüt zemini de hesaplıyor:
 *   1) AÇIK zeminli kart (LC mağaza paketleri `#fff`): orada siyah DOĞRU,
 *      19 kullanım böyle. Hepsini boyamak o yazıları görünmez yapardı.
 *   2) Emoji/bayrak/simge: kendi renginde basılır, yazı rengi etkilemez.
 *
 * Bu yüzden nöbetçi "renk yok" demiyor; **siyahın o zemindeki kontrastını**
 * ölçüyor ve yalnız METİN düğümlerini sayıyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const SAYFA_ZEMIN = "#030d18";
const ESIK = 4.5;

/* Palet karşılıkları — `constants/colors.ts` ile aynı değerler. Kopya değil
 * eşleme: sabit adları stil içinde geçiyor, oradaki HEX'i çözmek gerekiyor. */
const PALET: Record<string, string> = {
  "Colors.card": "#132b36",
  "Colors.cardInner": "#1d3b47",
  "Colors.dark": "#020617",
  "Colors.bg": "#030d18",
  "Colors.background": "#030d18",
  "Colors.headerBlue": "#1a1a2e",
  "Colors.white": "#ffffff",
  "Colors.accent": "#f59e0b",
};

function lum(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return (
    0.2126 * f(parseInt(h.slice(0, 2), 16) / 255) +
    0.7152 * f(parseInt(h.slice(2, 4), 16) / 255) +
    0.0722 * f(parseInt(h.slice(4, 6), 16) / 255)
  );
}
function kontrast(a: string, b: string): number | null {
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function* tsxDosyalari(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* tsxDosyalari(p);
    else if (e.name.endsWith(".tsx")) yield p;
  }
}

type Bulgu = { yer: string; zemin: string; k: number; satir: string };

function tara(): { olculen: number; bulgular: Bulgu[] } {
  const bulgular: Bulgu[] = [];
  let olculen = 0;
  for (const kok of ["app", "components"]) {
    for (const f of tsxDosyalari(path.join(KOK, kok))) {
      const satirlar = fs.readFileSync(f, "utf8").replace(/\r\n?/g, "\n").split("\n");
      satirlar.forEach((l, i) => {
        const m = l.match(/<Text\s+style=\{\{([^}]*)\}\}/);
        if (!m) return;
        if (/color/.test(m[1])) return;
        /* İÇ İÇE <Text> rengi EBEVEYNDEN miras alır — kusur değil. */
        const oncekiler = satirlar.slice(Math.max(0, i - 3), i).join(" ");
        if (/<Text[^/]*>[^<]*$/.test(oncekiler)) return;
        /* ⚠️ "GÖVDEDE HARF VAR MI" ÖLÇÜTÜ YANLIŞ POZİTİF VERDİ (ölçüldü):
         * `{playerAvatar(duel.creatorName)}` harf taşıyor ama o fonksiyon
         * EMOJİ döndürüyor (arena.tsx:68 — harf→hayvan haritası); aynı şekilde
         * `{match.vitrin ? "✨" : "⚔️"}`ün harfleri ifadede, çıktıda değil.
         * İfadedeki kimliklere bakmak, ÇIKTIYI okumak değildir.
         *
         * Daralttılmış ölçüt: gerçekten harf basan üç biçim —
         *   1) i18n çağrısı (`t("…")`, `t2("…")`),
         *   2) harf taşıyan dize sabiti,
         *   3) süslü parantez DIŞINDA düz metin. */
        const govde = l.replace(/<Text[^>]*>/, "").replace(/<\/Text>.*$/, "");
        const i18n = /\bt2?\(/.test(govde);
        /* ⚠️ DİZE SABİTİ KÜÇÜK HARF İSTİYOR — ikinci yanlış pozitif buydu:
         * `{predLock.reason === "PRED_NOT_OPEN_YET" ? "🕓" : "🔒"}` çıktısı
         * emoji, ama karşılaştırdığı HATA KODU harf taşıyor. Kod adları
         * BÜYÜK harf, insan metni neredeyse her zaman küçük harf içeriyor.
         * Kapsam sınırı bilerek: baştan sona büyük harfli düz bir etiket
         * ("SIRAN" gibi) bu ölçüte görünmez — o tür metinler `t()`ten geliyor
         * ve i18n dalı onları zaten yakalıyor. */
        const harfliDize = /["'`][^"'`]*[a-zçğıöşü][^"'`]*["'`]/.test(govde);
        const duzMetin = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(govde.replace(/\{[^}]*\}/g, ""));
        if (!i18n && !harfliDize && !duzMetin) return;
        olculen++;
        let zemin = SAYFA_ZEMIN;
        let kaynak = "sayfa";
        for (let j = i; j >= Math.max(0, i - 40); j--) {
          const b = satirlar[j].match(/backgroundColor:\s*("#[0-9a-fA-F]{3,8}"|Colors\.[a-zA-Z0-9]+)/);
          if (b) {
            const ham = b[1].replace(/"/g, "");
            zemin = PALET[ham] || (ham.startsWith("#") ? ham : SAYFA_ZEMIN);
            kaynak = ham;
            break;
          }
        }
        const k = kontrast("#000000", zemin);
        if (k !== null && k < ESIK) {
          bulgular.push({ yer: `${path.relative(KOK, f).replace(/\\/g, "/")}:${i + 1}`, zemin: kaynak, k, satir: l.trim().slice(0, 70) });
        }
      });
    }
  }
  return { olculen, bulgular };
}

describe("koyu zeminde renksiz yazı", () => {
  const { olculen, bulgular } = tara();

  test("ölçüt kör değil — renksiz METİN düğümü gerçekten sayılıyor", () => {
    /* "0 kusur" ile "0 ölçüm" aynı görünür: kaç düğüm ölçüldüğünü de bas. */
    assert.ok(olculen > 10, `yalnızca ${olculen} renksiz metin düğümü ölçüldü — tarama bozulmuş olabilir`);
  });

  test("hiçbiri görünmez kontrastta değil", () => {
    const liste = bulgular.map((b) => `  ${b.k.toFixed(2)}  ${b.yer}  zemin=${b.zemin}  ${b.satir}`).join("\n");
    assert.equal(
      bulgular.length, 0,
      `Koyu zeminde renk verilmemiş yazı (RN varsayılanı SİYAH):\n${liste}\n` +
      `Çare: stile \`color: Colors.slate900\` ekle. Zemin AÇIKSA dokunma.`
    );
  });

  test("NEGATİF KONTROL — tohumlanmış kusur yakalanıyor", () => {
    /* Ölçütün kendisi sınanıyor: koyu zeminde renksiz bir satır bulunmalı. */
    const k = kontrast("#000000", "#0f172a")!;
    assert.ok(k < ESIK, `eşik mantığı ters: siyah/#0f172a = ${k.toFixed(2)}`);
    const iyi = kontrast("#e2e8f0", "#0f172a")!;
    assert.ok(iyi > 7, `düzeltme rengi yetersiz: ${iyi.toFixed(2)}`);
  });
});
