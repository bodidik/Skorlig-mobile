/**
 * NÖBETÇİ: her yönlendirme hedefi GERÇEK bir ekrana çözülüyor mu?
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-03): "kurduğumuz turnuvalara tekrar tıklayınca
 * unmatched route oluyor."
 *
 * Ölçüldü: `app/(tabs)/live.tsx` turnuva kartını `/mini-group`a gönderiyordu ve
 * öyle bir ekran YOK. Expo Router eşleşmeyen yolda kendi "Unmatched Route"
 * ekranını basıyor — yani kullanıcı kurduğu turnuvaya her tıkladığında 404
 * görüyordu.
 *
 * ⚠️ SAPAN TEK YERDİ: kardeş üç yönlendirme (`mini/index`, `mini/create`,
 * `me`) zaten doğru kalıbı kullanıyordu (`/mini/[id]` + `params.id`). Bir
 * ekranı düzeltip ötekileri ölçmemek, bu kusurun ilk kez nasıl oluştuğuysa
 * odur — bu yüzden test TEK BİR yolu değil, BÜTÜN hedefleri tarıyor.
 *
 * ⚠️ TypeScript bunu YAKALAYAMAZ: `pathname` bir dize ve Expo Router'ın tip
 * üretimi bu depoda açık değil. Kapı burada.
 */

import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const APP = path.join(KOK, "app");

/** app/ altındaki gerçek rota kümesi. */
function rotalariTopla(): Set<string> {
  const rotalar = new Set<string>();
  const gez = (dizin: string, onek: string) => {
    for (const ad of fs.readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      if (fs.statSync(tam).isDirectory()) {
        const grupMu = ad.startsWith("(") && ad.endsWith(")");
        /* Grup segmenti (parantezli) yolda GÖRÜNMEZ ama yazılabilir de:
         * "/(tabs)/predict" ve "/predict" ikisi de geçerli. İki biçim de
         * kaydedilir, yoksa geçerli yönlendirmeler kırık sanılır. */
        gez(tam, grupMu ? onek : onek + "/" + ad);
        if (grupMu) gez(tam, onek + "/" + ad);
        continue;
      }
      if (!/\.(tsx|jsx|ts|js)$/.test(ad)) continue;
      const taban = ad.replace(/\.(tsx|jsx|ts|js)$/, "");
      if (taban === "_layout" || taban.startsWith("+")) continue;
      rotalar.add(taban === "index" ? onek || "/" : onek + "/" + taban);
    }
  };
  gez(APP, "");
  return rotalar;
}

/** Kaynaktaki yönlendirme hedefleri: yol -> nerede geçtiği. */
function hedefleriTopla(): Map<string, string[]> {
  const hedefler = new Map<string, string[]>();
  const KALIP = /(?:pathname:[ ]*|(?:push|replace|navigate)\([ ]*|href=\{?[ ]*)["'`](\/[^"'`\s]*)["'`]/g;

  const tara = (dizin: string) => {
    for (const ad of fs.readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      if (fs.statSync(tam).isDirectory()) {
        if (ad !== "node_modules") tara(tam);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(ad)) continue;
      const rel = path.relative(KOK, tam).split(path.sep).join("/");
      fs.readFileSync(tam, "utf8")
        .split("\n")
        .forEach((satir, i) => {
          /* Bu depoda yorumlar kusurları BİREBİR alıntılıyor; taranırsa
           * düzeltilmiş bir kusur kendi açıklamasından yeniden bulunur. */
          const kirp = satir.trim();
          if (kirp.startsWith("//") || kirp.startsWith("*")) return;
          KALIP.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = KALIP.exec(satir))) {
            const yol = m[1];
            if (!hedefler.has(yol)) hedefler.set(yol, []);
            hedefler.get(yol)!.push(rel + ":" + (i + 1));
          }
        });
    }
  };
  tara(APP);
  tara(path.join(KOK, "components"));
  /* ⚠️ `lib/` TARANMIYORDU. Yönlendirme yalnız ekranlarda kurulmuyor:
   * lib/tanitimKart.ts yolları VERİ olarak tutuyor ve o dosyadaki
   * "gruplar" kartı olmayan bir ekrana ("/friends") gidiyordu. */
  tara(path.join(KOK, "lib"));
  return hedefler;
}

test("her yonlendirme hedefi gercek bir ekrana cozulur", () => {
  const rotalar = rotalariTopla();
  const hedefler = hedefleriTopla();

  /* ⚠️ KÖRLÜK KORUMASI: ölçüt bir gün dosya düzeni değişip hiçbir şey
   * bulamazsa "kırık yok" der ve sessizce ölür. "0 kusur" ile "0 ölçüm"
   * aynı görünmesin. */
  assert.ok(rotalar.size > 10, "rota bulunamadi -- olcut kor, TEMIZ SAYILMAZ");
  assert.ok(hedefler.size > 10, "hedef bulunamadi -- olcut kor, TEMIZ SAYILMAZ");

  const kirik = [...hedefler].filter(([yol]) => !rotalar.has(yol));
  const rapor = kirik.map(([yol, yerler]) => yol + "  <- " + yerler.join(", "));
  assert.deepStrictEqual(rapor, [], "Unmatched Route uretecek hedef(ler)");
});

test("VERIDE tutulan yonlendirme hedefleri de cozuluyor", async () => {
  /**
   * ⚠️ KALIP TARAMASININ İKİNCİ KÖR NOKTASI — ÖLÇÜLDÜ.
   *
   * `KALIP` yalnız `push("/x")`, `replace("/x")`, `pathname:"/x"`, `href="/x"`
   * biçimlerini görüyor. `lib/tanitimKart.ts` ise yolu VERİ olarak tutuyor
   * (`{ anahtar: "gruplar", yol: "/friends" }`) ve components/TanitimSeridi.tsx
   * onu DEĞİŞKENLE push ediyor (`router.push(kart.yol as any)`). İkisi de
   * kalıba uymuyor.
   *
   * ÖLÇÜLDÜ (2026-09-11): taramayı `lib/`e açmak TEK BAŞINA hiçbir şey
   * bulmadı — dizin ekseni kapanıyor ama biçim ekseni açık kalıyordu.
   * Kusur gerçekti: `/friends` diye bir ekran yok (app/friends/ altında
   * yalnız board.tsx ve list.tsx var), yani kart her göründüğünde Expo
   * Router "Unmatched Route" basıyordu.
   *
   * ⚠️ TANITIMSERIDI.TSX YORUMU TERSİNİ İDDİA EDİYORDU: "Buradaki yolların
   * hepsi o nöbetçinin taradığı kümede." Yorum, ölçüm değil.
   */
  const { KARTLAR } = await import("../lib/tanitimKart.ts");
  const rotalar = rotalariTopla();

  assert.ok(KARTLAR.length >= 3,
    `KARTLAR ${KARTLAR.length} kayitli — olcut kor, TEMIZ SAYILMAZ`);

  const kirik = KARTLAR
    .filter((k: { anahtar: string; yol: string }) => !rotalar.has(k.yol))
    .map((k: { anahtar: string; yol: string }) => `${k.anahtar} -> ${k.yol}`);
  assert.deepStrictEqual(kirik, [],
    "tanitim seridi Unmatched Route uretecek: " + kirik.join(", "));
});

test("olcut GERCEKTEN kirik hedefi yakalar", () => {
  /* Pozitif kontrol: yukarıdaki "0 kırık" sonucu ölçütün körlüğünden mi
   * geliyor? Kullanıcının bildirdiği gerçek kusurun yolu sınanır. */
  const rotalar = rotalariTopla();
  assert.ok(!rotalar.has("/mini-group"), "/mini-group ekrani yok olmali");
  assert.ok(rotalar.has("/mini/[id]"), "dogru hedef /mini/[id] bulunamadi");
});
