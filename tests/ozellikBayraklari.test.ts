import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  OZELLIK_VARSAYILAN, ozellikleriCoz, modAcikMi, sekmeGizliMi, duelloBildirimHedefi,
} from "../lib/ozellikler.ts";
import { KARTLAR, gorunurKartlar } from "../lib/tanitimKart.ts";

/**
 * ÇIKIŞ SÜRÜMÜNDE DÜELLO VE HAVUZ GİZLİ — istemci tarafı.
 *
 * Kullanıcı kararı (13 Eylül 2026): Play IARC anketinde "simüle edilmiş şans
 * oyunu" sorusuna dürüstçe "Hayır" diyebilmek için iki mekanik çıkışta gizli.
 * Sunucu yeni para girişini zaten kapatıyor (api/lib/ozellikler.cjs); ama
 * derecelendirme UYGULAMANIN GÖSTERDİĞİ şey hakkında — sekme, düğme, slayt,
 * kart kalırsa beyan yine yalana döner.
 *
 * İki katman:
 *   1. saf kurallar (okunamazsa gizli, yalnız açık `true` açar, ...);
 *   2. KAYNAK NÖBETÇİSİ: düello/havuz/arena rotasına giden HER dosya bayrağa
 *      bağlı olmalı. Özellik birden fazla ekrandan açılıyor (sekme, oyun
 *      modları, tahmin ekranı, maç listesi, tanıtım kartı, bildirim) ve
 *      bunlardan birini unutmak — "aynı savunma bir yerde var, ötekinde yok" —
 *      bu depoda en sık tekrar eden kusur sınıfı.
 */

describe("saf kurallar", () => {
  test("varsayılan HEPSİ KAPALI ve donmuş", () => {
    assert.deepEqual({ ...OZELLIK_VARSAYILAN }, { duello: false, havuz: false, premium: false });
    assert.ok(Object.isFrozen(OZELLIK_VARSAYILAN), "varsayilan degistirilebilir — bir ekran onu acabilir");
  });

  test("okunamayan/bozuk yanıt GİZLİ sayılıyor", () => {
    for (const yanit of [null, undefined, {}, { ok: true }, { ozellikler: null }, "html hata sayfasi", 42]) {
      assert.deepEqual(ozellikleriCoz(yanit), { duello: false, havuz: false, premium: false }, `acildi: ${JSON.stringify(yanit)}`);
    }
  });

  test("yalnızca açık `true` açıyor — \"true\", 1, \"1\" açmıyor", () => {
    assert.deepEqual(ozellikleriCoz({ ozellikler: { duello: true, havuz: false, premium: true } }), { duello: true, havuz: false, premium: true });
    for (const deger of ["true", 1, "1", "evet"]) {
      const o = ozellikleriCoz({ ozellikler: { duello: deger, havuz: deger, premium: deger } });
      assert.deepEqual(o, { duello: false, havuz: false, premium: false }, `${JSON.stringify(deger)} acti`);
    }
  });

  test("modAcikMi yalnızca bayraklı modları süzüyor", () => {
    const kapali = { duello: false, havuz: false, premium: false };
    assert.equal(modAcikMi("duello", kapali), false);
    assert.equal(modAcikMi("havuz", kapali), false);
    for (const key of ["tek", "kupon", "mini", "gs1987", "yeni-mod"]) {
      assert.equal(modAcikMi(key, kapali), true, `${key} gizlendi`);
    }
    assert.equal(modAcikMi("duello", { duello: true, havuz: false, premium: false }), true);
  });

  test("sekmeGizliMi expo-router'ın href:null işaretini tanıyor", () => {
    assert.equal(sekmeGizliMi({ tabBarItemStyle: { display: "none" } }), true);
    for (const o of [undefined, null, {}, { tabBarItemStyle: {} }, { tabBarItemStyle: { display: "flex" } }, { title: "x" }]) {
      assert.equal(sekmeGizliMi(o), false, `yanlislikla gizlendi: ${JSON.stringify(o)}`);
    }
  });

  test("düello bildirimi kapalıyken LC geçmişine gidiyor, açıkken arenaya", () => {
    assert.equal(duelloBildirimHedefi({ duello: false, havuz: false, premium: false }), "/lc-ledger");
    assert.equal(duelloBildirimHedefi({ duello: true, havuz: false, premium: false }), "/(tabs)/arena");
  });

  test("tanıtım kartları: kapalı özelliğin kartı YOK, ötekiler duruyor", () => {
    const kapali = gorunurKartlar({ duello: false, premium: false }).map((k) => k.anahtar);
    assert.ok(!kapali.includes("duello"), "kapaliyken duello karti basiliyor");
    assert.ok(!kapali.includes("premium"), "magaza kapaliyken premium karti basiliyor — satilamayan seyi tanitir");
    assert.equal(kapali.length, KARTLAR.length - 2, "kapali ozellikler disinda kart da silindi");
    const acik = gorunurKartlar({ duello: true, premium: true }).map((k) => k.anahtar);
    assert.ok(acik.includes("duello") && acik.includes("premium"));
    assert.equal(acik.length, KARTLAR.length);
  });
});

/* ── Kaynak nöbetçisi ─────────────────────────────────────────────────────── */

const KOK = path.join(import.meta.dirname, "..");

/**
 * Yorumları BOŞLUKLA doldurur (satır numaraları korunur). Çift eğiğin
 * önündeki karakter iki nokta ise URL'dir, yorum değil.
 */
function yorumsuz(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, on) => on + " ".repeat(m.length - on.length));
}

function oku(goreli: string): string {
  return yorumsuz(fs.readFileSync(path.join(KOK, goreli), "utf8"));
}

function kaynakDosyalari(): string[] {
  const out: string[] = [];
  const gez = (d: string) => {
    for (const ad of fs.readdirSync(path.join(KOK, d), { withFileTypes: true })) {
      const g = path.join(d, ad.name);
      if (ad.isDirectory()) { gez(g); continue; }
      if (/\.(ts|tsx)$/.test(ad.name)) out.push(g.split(path.sep).join("/"));
    }
  };
  for (const d of ["app", "components", "lib", "hooks"]) gez(d);
  return out;
}

/** Düello/havuz/arena ekranına götüren rota ifadesi. */
const ROTA = /["'`]\/(?:\(tabs\)\/arena|duel\/|pool\/)/;
/** Bayrağa bağlı olduğunu gösteren işaretler. */
const BAYRAK = /useOzellikler\(|modAcikMi\(|gorunurKartlar\(|duelloBildirimHedefi\(|ozellik\.(duello|havuz)/;

/** Rota içerip bayrak işareti taşımaması MEŞRU olanlar — gerekçesiyle. */
const MUAF: Record<string, string> = {
  "lib/ozellikler.ts": "kuralın kendisi; rota dizesini döndüren fonksiyon burada",
  "lib/tanitimKart.ts": "kart VERİSİ; gösterim gorunurKartlar() üzerinden ve TanitimSeridi onu çağırıyor",
};

describe("kaynak nöbetçisi", () => {
  test("KURULUM: tarama dosya buluyor ve rota ifadesini tanıyor", () => {
    const dosyalar = kaynakDosyalari();
    assert.ok(dosyalar.length > 50, `yalnizca ${dosyalar.length} dosya — tarama kor`);
    const rotali = dosyalar.filter((f) => ROTA.test(oku(f)));
    assert.ok(rotali.length >= 5, `rota iceren ${rotali.length} dosya — desen kor`);
  });

  test("düello/havuz/arena rotasına giden HER dosya bayrağa bağlı", () => {
    const korumasiz = kaynakDosyalari()
      .filter((f) => !MUAF[f])
      .filter((f) => { const s = oku(f); return ROTA.test(s) && !BAYRAK.test(s); });
    assert.deepEqual(korumasiz, [],
      `bayraga bagli olmadan duello/havuz rotasi kuran dosya(lar): ${korumasiz.join(", ")} — ` +
      "cikis surumunde gizli ozellige yeni bir giris kapisi acilmis");
  });

  test("muafiyetler bayat değil (dosya var ve rota gerçekten içeriyor)", () => {
    for (const f of Object.keys(MUAF)) {
      assert.ok(fs.existsSync(path.join(KOK, f)), `${f} yok — muafiyet bayat`);
      assert.ok(ROTA.test(oku(f)), `${f} artik rota icermiyor — muafiyet bayat`);
    }
    assert.match(oku("components/TanitimSeridi.tsx"), /gorunurKartlar\(ozellik\)/,
      "tanitimKart muafiyetinin dayanagi kalmamis: serit kartlari suzmuyor");
  });

  test("sekme gizleniyor VE özel çubuk bu işareti okuyor", () => {
    assert.match(oku("app/(tabs)/_layout.tsx"),
      /name="arena" options=\{\{[^}]*href: ozellik\.duello \? undefined : null/,
      "arena sekmesi bayraga bagli degil");
    assert.match(oku("components/TabBar.tsx"), /if \(sekmeGizliMi\(options\)\) return null;/,
      "ozel sekme cubugu href:null isaretini okumuyor — sekme gizlenmez");
  });

  test("oyun merkezi süzülmüş listeyi çiziyor ve sayıyı SAYIYOR", () => {
    /* Merkezde üç çizim yolu var (kompakt satır, geniş kartlar, ızgara);
     * üçü de süzülmüş listeden türemeli. Süzgeç tek yerde: `gorunenModlar`. */
    const s = oku("components/OyunMerkezi.tsx");
    assert.match(s, /const gorunenModlar: Mod\[\] = MOD_SIRASI\s*\.filter\(\(key\) => modAcikMi\(key, ozellik\)\)/,
      "mod listesi bayrakla suzulmuyor");
    assert.match(s, /gorunenModlar\.map\(\(m\) => <KompaktDugme/, "kompakt satir suzulmemis listeyi ciziyor");
    assert.match(s, /const izgara = izgaraModlari\(gorunenModlar, true\)/, "izgara suzulmemis listeden turuyor");
    assert.match(s, /const kuponVar = gorunenModlar\.some\(/, "kupon karti suzulmus listeye bakmiyor");
    assert.match(s, /const tekVar = gorunenModlar\.some\(/, "tek mac karti suzulmus listeye bakmiyor");
    assert.ok(!/MOD_SIRASI\.map\(/.test(s), "suzulmemis sira dogrudan ciziliyor");
    assert.match(s, /t\("modesCount", \{ n: gorunenModlar\.length \}\)/, "mod sayisi sabit metin");
  });

  test("DÜĞME DÜZEYİ: aynı dosyadaki her giriş ayrı ayrı bağlı", () => {
    /* Dosya düzeyindeki tarama bir dosyada bayrak GEÇTİĞİNİ görür, her
     * düğmenin bağlı olduğunu görmez: maç listesinde hook dururken düğme
     * korumasız kalabilirdi. Buradaki iddialar giriş başına. */
    const tahmin = oku("app/(tabs)/predict.tsx");
    assert.match(tahmin, /\{ozellik\.havuz \? \(\s*<TouchableOpacity\s*onPress=\{\(\) => router\.push\(\{\s*pathname: "\/pool\/\[fixtureId\]"/,
      "tahmin ekraninda havuz dugmesi bayraga bagli degil");
    assert.match(tahmin, /\{!ozellik\.duello \? null : duelloKapali \?/,
      "tahmin ekraninda duello dugmesi bayraga bagli degil");
    assert.match(oku("app/(tabs)/live.tsx"), /onDuel=\{ozellik\.duello \? goDuel : undefined\}/,
      "mac listesinde duello dugmesi bayraga bagli degil");
    assert.match(oku("app/index.tsx"), /getSlides\(ozellik\.duello\)/,
      "karsilama slaytlari bayraga bagli degil — duello slayti gorunur");
    assert.match(oku("app/(tabs)/me.tsx"), /\.\.\.\(ozellik\.duello \? \[\{ key: "duel" as const/,
      "bildirim tercihlerinde duello satiri bayraga bagli degil");
    assert.match(oku("app/_layout.tsx"), /case "duel":\s*return duelloBildirimHedefi\(ozellikAnlik\(\)\);/,
      "duello bildirimi kapali ekrana gonderiyor");
  });

  test("üç ekran da kapalıyken OzellikKapali döndürüyor", () => {
    for (const [dosya, bayrak] of [["app/(tabs)/arena.tsx", "duello"], ["app/duel/[fixtureId].tsx", "duello"], ["app/pool/[fixtureId].tsx", "havuz"]]) {
      const s = oku(dosya);
      assert.match(s, new RegExp(`export default function \\w+\\(\\) \\{\\s*const ozellik = useOzellikler\\(\\);\\s*if \\(!ozellik\\.${bayrak}\\) return <OzellikKapali />;`),
        `${dosya} kapaliyken ekrani aciyor`);
    }
  });

  test("PREMIUM: mağaza kapalıyken fiyat ve satın alma düğmesi çizilmiyor", () => {
    /* Sunucu yalnızca "mock" modda satın alma tamamlayabiliyor; üretimde mod
     * "disabled" ve uç 403 STORE_DISABLED. Play Faturalandırma yokken ₺ fiyatlı
     * abonelik düğmesi hem ödeme politikası riski hem basınca hata veren vaat. */
    const s = oku("app/premium.tsx");
    const kapi = s.indexOf('{data.mode !== "mock" ? (');
    const planlar = s.indexOf("(data.plans || []).map(");
    assert.ok(kapi > 0, "premium ekraninda magaza kapisi yok");
    assert.ok(planlar > kapi, "plan listesi magaza kapisinin ONUNDE — kapali modda fiyatlar cizilir");
    assert.match(s, /async function subscribe\(plan: Plan\) \{\s*if \(data\?\.mode !== "mock"\) return;/,
      "satin alma akisi magaza kapaliyken de basliyor");
  });

  test("hata sözlüğü FEATURE_DISABLED'i tanıyor (sunucu bu kodu dönüyor)", () => {
    assert.match(oku("lib/hataMesaji.ts"), /^\s*FEATURE_DISABLED:\s*"/m);
  });
});
