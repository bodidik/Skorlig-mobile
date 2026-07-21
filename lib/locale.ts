// ISO 3166-1 alpha-2 region kodu → API'nin beklediği ülke adı
// Aynı liste ileride IP-based detection için de kullanılabilir.
const REGION_TO_COUNTRY: Record<string, string> = {
  // Türkiye
  TR: "Türkiye",
  // Batı Avrupa
  GB: "İngiltere",
  DE: "Almanya",
  FR: "Fransa",
  ES: "İspanya",
  IT: "İtalya",
  PT: "Portekiz",
  NL: "Hollanda",
  BE: "Belçika",
  AT: "Avusturya",
  CH: "İsviçre",
  SE: "İsveç",
  NO: "Norveç",
  DK: "Danimarka",
  FI: "Finlandiya",
  IE: "İrlanda",
  GR: "Yunanistan",
  // Doğu Avrupa
  PL: "Polonya",
  CZ: "Çekya",
  SK: "Slovakya",
  HU: "Macaristan",
  RO: "Romanya",
  HR: "Hırvatistan",
  RS: "Sırbistan",
  UA: "Ukrayna",
  RU: "Rusya",
  // Güney Amerika
  AR: "Arjantin",
  BR: "Brezilya",
  BO: "Bolivya",
  CL: "Şili",
  CO: "Kolombiya",
  PE: "Peru",
  UY: "Uruguay",
  EC: "Ekvador",
  PY: "Paraguay",
  VE: "Venezuela",
  // Kuzey & Orta Amerika
  MX: "Meksika",
  US: "ABD",
  CA: "Kanada",
  // Afrika
  NG: "Nijerya",
  GH: "Gana",
  EG: "Mısır",
  ZA: "Güney Afrika",
  MA: "Fas",
  CI: "Fildişi Sahili",
  SN: "Senegal",
  // Orta Doğu
  SA: "Suudi Arabistan",
  AE: "BAE",
  QA: "Katar",
  // Asya & Okyanusya
  JP: "Japonya",
  KR: "Güney Kore",
  CN: "Çin",
  AU: "Avustralya",
  IN: "Hindistan",
};

export function getDeviceCountry(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    // "tr-TR" → "TR", "es-BO" → "BO", "en-GB" → "GB"
    const parts = locale.split(/[-_]/);
    const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : parts[0].toUpperCase();
    return REGION_TO_COUNTRY[region] ?? null;
  } catch {
    return null;
  }
}

export function getDeviceRegionCode(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split(/[-_]/);
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null;
  } catch {
    return null;
  }
}
