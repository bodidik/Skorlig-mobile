import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { t, setLang } from "../lib/i18n.ts";
import { hataMesaji } from "../lib/hataMesaji.ts";

// React Native globali; Node'da yok (bkz. tests/hataMesaji.test.ts). Üretim davranışı.
(globalThis as any).__DEV__ = false;

/**
 * KULLANICI BİLDİRME — profil ekranı.
 *
 * Play kullanıcı içeriği politikası uygulama içinden bildirme yolu istiyor
 * (13 Eylül 2026'ya kadar YOKTU; sunucu tarafı api/routes/sikayet.cjs).
 *
 * Sınanan:
 *  - düğme yalnızca BAŞKASININ profilinde (kendini bildirme sunucuda da
 *    reddediliyor, ama düğmenin görünmesi boşa hata üretir);
 *  - istek doğru uca ve doğru alanlarla gidiyor;
 *  - sebep anahtarları sunucunun KAPALI listesiyle birebir aynı — iki ayrı
 *    depoda tutulan liste ayrışırsa her bildirim 400 REASON_REQUIRED yer ve
 *    kullanıcı yalnızca "hata" görür ("iki gerçeklik" sınıfı);
 *  - metinler tr ve en'de var; sunucunun döndürdüğü hata kodları Türkçe.
 */

const KOK = path.join(import.meta.dirname, "..");

function yorumsuz(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, on) => on + " ".repeat(m.length - on.length));
}

const EKRAN = yorumsuz(fs.readFileSync(path.join(KOK, "app", "profile", "[userId].tsx"), "utf8"));
const API_ROTA = path.join(KOK, "..", "api", "routes", "sikayet.cjs");

describe("profil ekranı", () => {
  test("bildir düğmesi yalnız başkasının profilinde ve oturum açıkken", () => {
    assert.match(EKRAN, /\{!isOwn && ownUserId && userId \? \(\s*<TouchableOpacity[\s\S]{0,300}setBildirAcik\(true\)/,
      "bildir dugmesi kosulsuz ya da kendi profilinde de ciziliyor");
  });

  test("istek /api/sikayet'e hedef ve sebeple gidiyor", () => {
    assert.match(EKRAN, /apiFetch\("\/api\/sikayet", \{\s*method: "POST"/, "bildirim yanlis uca gidiyor");
    assert.match(EKRAN, /JSON\.stringify\(\{ targetUserId: userId, sebep, baglam: "profil" \}\)/, "govde alanlari eksik");
  });

  test("sebepler Modal içinde tek tek düğme (Android Alert 3 düğmeyle sınırlı)", () => {
    assert.match(EKRAN, /<Modal visible=\{bildirAcik\}/);
    assert.match(EKRAN, /BILDIRIM_SEBEPLERI\.map\(/);
  });
});

describe("sunucuyla sözleşme", () => {
  test("sebep anahtarları sunucunun kapalı listesiyle BİREBİR aynı", (tt) => {
    if (!fs.existsSync(API_ROTA)) return tt.skip("api deposu yan klasorde yok");
    const api = fs.readFileSync(API_ROTA, "utf8");
    const liste = /const SEBEPLER = Object\.freeze\(\[([^\]]+)\]\)/.exec(api);
    assert.ok(liste, "sunucudaki SEBEPLER listesi okunamadi — olcut kor");
    const sunucu = [...liste[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    const istemci = [...EKRAN.matchAll(/\{ sebep: "([a-z_]+)", etiket:/g)].map((m) => m[1]).sort();
    assert.ok(sunucu.length >= 3, `sunucuda ${sunucu.length} sebep — olcut kor`);
    assert.deepEqual(istemci, sunucu, "istemci ile sunucu sebep listeleri ayrisiyor — bildirimler 400 yer");
  });

  test("sunucunun bildirim hata kodları kullanıcıya Türkçe açıklanıyor", () => {
    const YEDEK = "__yedek__";
    for (const kod of ["REQ", "SELF_NOT_ALLOWED", "REASON_REQUIRED", "RATE_LIMIT", "NO_DB", "REPORT_FAILED"]) {
      assert.notEqual(hataMesaji(kod, YEDEK), YEDEK, `${kod} karsiliksiz — kullanici yalniz "hata" gorur`);
    }
  });
});

describe("metinler", () => {
  const ANAHTARLAR = ["reportUser", "reportTitle", "reportReasonName", "reportReasonAbuse", "reportReasonCheat", "reportReasonOther", "reportSent"];
  for (const dil of ["tr", "en"] as const) {
    test(`${dil}: bildirim metinleri var (ham anahtar basılmıyor)`, () => {
      setLang(dil);
      try {
        for (const k of ANAHTARLAR) assert.notEqual(t(k as any), k, `${dil}'de ${k} yok`);
      } finally {
        setLang("tr");
      }
    });
  }
});
