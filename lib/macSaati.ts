/**
 * Maç başlama etiketi — TEK KAYNAK.
 *
 * NEDEN TEK DOSYA: aynı bilgi BEŞ ekranda ayrı ayrı kuruluyordu ve üçü
 * yalnızca saati basıyordu (arena, DailyMenuStrip, QuickPickCard) — yarınki
 * 20:00 maçı bugünkü 20:00'den ayırt edilemiyordu. live ise ham tarih
 * yazıyordu ("31/08/26 20:00"). Etiketi her ekranda yeniden kurmak, bu depoda
 * tur tur avlanan "iki gerçeklik" kusurudur; kural bu yüzden burada duruyor.
 *
 * GÜN AYRIMI TAKVİM GÜNÜYLE yapılır, 24 saat farkıyla DEĞİL: gece 23:50'de
 * bakan kullanıcı için 00:10 maçı "20 dakika sonra" değil YARIN'dır.
 *
 * DİLİM: hem gün karşılaştırması hem saat cihazın YEREL dilimini kullanır,
 * yani ekranda yazan saat ile "bugün/yarın" kararı aynı takvimden çıkar.
 *
 * YAPRAK MODÜL — hiçbir şey içe aktarmıyor. Sebep tsconfig'de yazılı: Node'un
 * strip-types çalıştırıcısı göreli ESM'de açık `.ts` uzantısı istiyor ve o
 * biçim yalnızca tests/ altında serbest. i18n'i içe aktarsaydı bu dosya
 * ÖLÇÜLEMEZ olurdu. Bu yüzden gün adları PARAMETRE: çağıran `t("today")` ve
 * `t("tomorrow")` geçirir. Varsayılanlar Türkçe, yani bağlamayı unutan yeni
 * bir çağrı yeri boş etiket değil Türkçe etiket gösterir.
 */

export type MacSaatiSecenek = {
  /** Karşılaştırma anı — testler sabitler; üretimde boş bırakılır. */
  simdi?: Date;
  bugun?: string;
  yarin?: string;
  /** Ay adının dili. Varsayılan uygulamanın birincil dili. */
  yerel?: string;
};

function ikiHane(n: number): string {
  return String(n).padStart(2, "0");
}

/** Yalnızca gün taşıyan kayıt: "2026-08-31" — saatsiz fikstürler böyle geliyor. */
function saatsizGunMu(iso: string): boolean {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso);
}

/** İki tarih AYNI takvim gününde mi (yerel dilim). */
export function ayniGunMu(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Gün etiketi: "Bugün" | "Yarın" | "3 Eyl" | "5 Oca 2027" */
export function macGunEtiketi(d: Date, simdi: Date, s: MacSaatiSecenek = {}): string {
  if (ayniGunMu(d, simdi)) return s.bugun || "Bugün";

  const yarin = new Date(simdi.getTime());
  yarin.setDate(yarin.getDate() + 1);
  if (ayniGunMu(d, yarin)) return s.yarin || "Yarın";

  const gunAy = d.toLocaleDateString(s.yerel || "tr-TR", { day: "numeric", month: "short" });
  // Yıl YALNIZCA farklıysa yazılır; aynı yılda her satıra "2026" koymak gürültü.
  return d.getFullYear() === simdi.getFullYear() ? gunAy : gunAy + " " + d.getFullYear();
}

/**
 * "Bugün 20:00" | "Yarın 20:00" | "3 Eyl 20:00" | "5 Oca 2027 20:00"
 *
 * Saatsiz kayıtta yalnızca gün döner — olmayan bir saati uydurmaz.
 * Çözülemeyen girdide BOŞ döner: yanlış bir tarih basmak hiç basmamaktan kötü.
 */
export function macSaatiEtiketi(
  iso: string | null | undefined,
  s: MacSaatiSecenek = {},
): string {
  const ham = String(iso || "").trim();
  if (!ham) return "";

  const d = new Date(ham);
  if (!Number.isFinite(d.getTime())) return "";

  const now = s.simdi || new Date();
  const gun = macGunEtiketi(d, now, s);

  if (saatsizGunMu(ham)) return gun;
  return gun + " " + ikiHane(d.getHours()) + ":" + ikiHane(d.getMinutes());
}

/**
 * TAKVİM günü farkı (bugün=0, yarın=1). Saat farkına BÖLMEZ.
 *
 * Kusur buradan çıktı: DailyMatchCard rozeti `ceil((kick-now)/86400000)`
 * kullanıyordu ve bugün 14:00'te bakılırken YARIN 20:00 maçına "2 gün sonra"
 * diyordu (30 saat / 24 = 1.25 -> ceil 2). Aynı takvim kuralı iki yerde ayrı
 * yazılmasın diye burada duruyor.
 */
export function takvimGunFarki(d: Date, simdi: Date): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}
