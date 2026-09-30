/**
 * İLK ÜYE BİLDİRİMİ (2026-09-30). "Kurucu dersek hak sahibi olurlar" —
 * kullanıcıya görünen metin bu kelimeyi TAŞIMAMALI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const kok = path.join(import.meta.dirname, "..");
const i18n = fs.readFileSync(path.join(kok, "lib", "i18n.ts"), "utf8");

test("görünen metinde 'kurucu' / 'founder' YOK", () => {
  const satirlar = i18n.split("\n").filter((l) => /^\s+(txIlkUye|ilkUye\w+):/.test(l));
  assert.equal(satirlar.length, 8, `tr+en anahtarlari eksik: ${satirlar.length}`);
  for (const l of satirlar) assert.doesNotMatch(l, /kurucu|founder/i, l);
});

test("bildirim yalnız LC YATTIYSA; kademe grubu sıradan", () => {
  const src = fs.readFileSync(path.join(kok, "lib", "ilkUye.ts"), "utf8");
  assert.match(src, /!\(Number\(u\.yatan\) > 0\)/, "yatan 0 iken de bildirim cikar");
  assert.match(src, /const grup = 200;/);
});

test("üç takma ad kayıt yolu da bildirimi çağırıyor", () => {
  for (const f of ["app/index.tsx", "components/NicknameBackfillPrompt.tsx", "app/(tabs)/me.tsx"]) {
    assert.match(fs.readFileSync(path.join(kok, f), "utf8"), /ilkUyeBildir\((data|r)\)/, f);
  }
});

test("LC defteri sebebi etiketliyor (ham 'ilk_uye_bonus' basılmıyor)", () => {
  const src = fs.readFileSync(path.join(kok, "app", "lc-ledger.tsx"), "utf8");
  assert.match(src, /reason === "ilk_uye_bonus"\) return t\("txIlkUye"\)/);
});
