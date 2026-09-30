/**
 * 4'LÜ PAKET KİLİDİ (kullanıcı isteği 2026-09-30).
 *
 * "4'lü pakette bir maçın saati geldiğinde diğer maçlar da tıklanamaz olsun
 * ve paket 1 maç bile başlarsa kullanıcıya sunulmaktan men edilsin."
 *
 * Paket ekranda sabit bir küme; maçlar tek tek kilitlense de öteki üçü açık
 * görünüyordu. Artık İLK maçın kilit anında paketin tamamı çekiliyor.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { paketKilitAni, paketAcikMi } from "../lib/paketKilidi.ts";

const T0 = Date.parse("2026-10-01T12:00:00Z");
const ko = (dk: number) => ({ kickoffISO: new Date(T0 + dk * 60_000).toISOString() });

test("sunucunun ilanı varsa o kullanılıyor", () => {
  const ilan = new Date(T0 + 5 * 60_000).toISOString();
  assert.equal(paketKilitAni(ilan, [ko(120)]), T0 + 5 * 60_000);
});

test("ilan yoksa İLK maçın kickoff'undan 10 dk önce — sonraki maçlar değil", () => {
  assert.equal(paketKilitAni(null, [ko(300), ko(60), ko(200), ko(90)]), T0 + 50 * 60_000);
});

test("bir maç kilitlenince paketin TAMAMI kapanıyor", () => {
  const maclar = [ko(60), ko(300), ko(400), ko(500)];
  const kilit = paketKilitAni(null, maclar);
  assert.equal(paketAcikMi(kilit, T0 + 49 * 60_000), true, "kilitten once kapali");
  /* İlk maç kilitlendi; öteki üçü saatler sonra ama paket kalkmalı. */
  assert.equal(paketAcikMi(kilit, T0 + 50 * 60_000), false, "ilk mac kilitlenince paket hala acik");
});

test("kilit anı bilinmiyorsa paket SUNULMAZ", () => {
  assert.equal(paketAcikMi(paketKilitAni(null, [{ kickoffISO: null }]), T0), false);
});

test("NÖBETÇİ: QuickPlaySection paketi bu kapıdan geçiriyor", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "..", "components", "QuickPlaySection.tsx"), "utf8");
  assert.match(src, /hasQuad\s*=\s*quad\.length > 0 && paketAcikMi\(paketKilitAni\(/,
    "paket kilit kapisindan gecmeden ciziliyor");
  assert.match(src, /setPaketKilitISO\(quadR\.paketKilitISO/, "sunucunun ilani okunmuyor");
});
