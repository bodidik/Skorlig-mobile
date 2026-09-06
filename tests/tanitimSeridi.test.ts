/**
 * NÖBETÇİ: tanıtım şeridi — i18n anahtarları ve rota hedefleri.
 *
 * ⚠️ NEDEN VAR (2026-09-06): şerit metinleri `t(\`tanitim_${k}\` as any)` ile
 * çağrılıyor; `as any` yüzünden **tsc bunu yakalamaz**. Kart listesi bileşende,
 * metinler i18n'de — ikisi ayrışırsa ekranda ham `tanitim_kupon` görünür.
 * Bu, `react_*` anahtarlarında bir kez yaşanmış tuzağın birebir aynısı
 * (bkz. tests/tepki-istemci-uyumu API tarafında).
 *
 * İkinci kapı: kart yolları gerçek ekranlara çözülmeli, yoksa Expo Router
 * "Unmatched Route" basar — bu depoda ölçülmüş kusur (tests/rotaHedefleri).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { t, setLang } from "../lib/i18n.ts";
import { KARTLAR, kartSec } from "../lib/tanitimKart.ts";

const KOK = path.join(import.meta.dirname, "..");

/** Kart listesi lib/tanitimKart.ts'ten — bileşen .tsx ve strip-types onu yükleyemiyor. */
function kartlar(): { anahtar: string; yol: string }[] {
  return KARTLAR;
}

test("KURULUM SINANDI: kart listesi okunabiliyor", () => {
  const k = kartlar();
  assert.ok(k.length >= 3, `yalnizca ${k.length} kart — olcut kor, TEMIZ SAYILMAZ`);
});

test("her kartin metni TR ve EN'de var (ham anahtar gorunmesin)", () => {
  for (const dil of ["tr", "en"] as const) {
    setLang(dil);
    for (const { anahtar } of kartlar()) {
      const anah = `tanitim_${anahtar}`;
      const metin = t(anah as any);
      assert.notEqual(metin, anah, `${dil}: "${anah}" karsiligi yok — ekranda ham anahtar gorunur`);
      assert.ok(String(metin).trim().length > 0, `${dil}: "${anah}" bos`);
    }
    const kapat = t("tanitim_kapat");
    assert.notEqual(kapat, "tanitim_kapat", `${dil}: kapatma metni yok`);
  }
  setLang("tr");
});

test("metinler KISA (serit tek satir, sabit yukseklik)", () => {
  setLang("tr");
  for (const { anahtar } of kartlar()) {
    const m = String(t(`tanitim_${anahtar}` as any));
    assert.ok(m.length <= 60, `"${anahtar}" metni ${m.length} karakter — tek satira sigmaz: ${m}`);
  }
});

test("kart yollari GERCEK ekrana cozuluyor", () => {
  for (const { anahtar, yol } of kartlar()) {
    /* "/(tabs)/arena" → app/(tabs)/arena.tsx ; "/kupon" → app/kupon.tsx veya app/kupon/ */
    const rel = yol.replace(/^\//, "");
    const adaylar = [
      path.join(KOK, "app", rel + ".tsx"),
      path.join(KOK, "app", rel, "index.tsx"),
      path.join(KOK, "app", rel),
    ];
    assert.ok(adaylar.some((p) => fs.existsSync(p)),
      `${anahtar}: "${yol}" hicbir ekrana cozulmuyor — Expo Router "Unmatched Route" basar`);
  }
});

test("kart secimi DETERMINISTIK ve tohuma gore dagiliyor", () => {
  /* Aynı maçta kart sabit kalmalı (kendiliğinden dönen şerit gözü çeker),
   * ama maçtan maça değişmeli (hep aynı kart tanıtımı öldürür). */
  assert.equal(kartSec("FDO-123", 4), kartSec("FDO-123", 4), "ayni tohum farkli kart verdi");
  const n = kartlar().length;
  const gorulen = new Set(
    ["FDO-1", "FDO-2", "FDO-3", "MK-A", "MK-B", "ESPN-9", "x7", "q12"].map((s) => kartSec(s, n))
  );
  assert.ok(gorulen.size >= 2, `8 farkli mac ${gorulen.size} farkli kart verdi — dagilim yok`);
  assert.equal(kartSec("", n), 0, "bos tohum cokmemeli");
  assert.equal(kartSec("x", 0), 0, "sifir uzunlukta cokmemeli");
});

test("NÖBETÇİ: serit ekranda GERCEKTEN kullaniliyor", () => {
  /* Bileşen yazılıp yerleştirilmezse test yeşil kalır ama kullanıcı hiçbir şey
   * görmez — bu depoda "uç var, istemci çağırmıyor" biçiminde defalarca çıktı. */
  const ekran = fs.readFileSync(path.join(KOK, "app", "match-race", "[fixtureId].tsx"), "utf8");
  assert.ok(/import TanitimSeridi from/.test(ekran), "match-race seridi import etmiyor");
  const kullanim = (ekran.match(/<TanitimSeridi\b/g) || []).length;
  assert.ok(kullanim >= 2,
    `serit ${kullanim} yerde — mac oncesi VE mac sirasi dallarinin ikisinde de olmali`);
  assert.ok(/<TanitimSeridi tohum=\{fixtureId\}/.test(ekran), "tohum verilmemis — kart her cizimde degisebilir");
});
