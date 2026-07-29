/**
 * Desteklenen ülkelerin YEREL kopyası.
 *
 * NEDEN VAR: Onboarding'de ülke seçimi ZORUNLU — kullanıcı bunu geçemeden
 * uygulamayı kullanamıyor. Liste sunucudan çekiliyordu ve istek düşerse ekran
 * sonsuza kadar "Ülkeler yükleniyor…" spinner'ında kalıyordu.
 *
 * Tetikleyici Render ücretsiz katmanı: servis ~15dk boştalıkta uyutuluyor,
 * uyanması 30-60 saniye sürüyor. apiFetch 15sn zaman aşımı + 2 tekrar ile
 * çalıştığı için üç deneme de düşüyor ve yeni kullanıcı ilk ekranda takılı
 * kalıyordu. Yani en kötü ilk izlenim, en kritik ekranda.
 *
 * Bu liste ile onboarding ağa HİÇ bağlı değil: anında açılır, sunucu yanıtı
 * geldiğinde sessizce tazelenir.
 *
 * BAYATLAMA RİSKİ KABUL EDİLEBİLİR: sunucuya yeni ülke eklenirse eski
 * sürümdeki kullanıcı onu görmez, ama seçtiği ülke sunucuda `canonicalCountry`
 * ile doğrulandığı için geçersiz bir değer YAZILAMAZ. Sunucu yanıtı da
 * saniyeler içinde listeyi güncelliyor.
 *
 * Kaynak: api/lib/countries.cjs — sunucudaki TEK ülke kaynağı (2026-07-29,
 * 77 ülke). Orada ülke eklenir/çıkarılırsa bu liste bayatlar; tek doğruluk
 * kaynağı hâlâ sunucudur, burası yalnızca ağ yokken devreye giren kopyadır.
 */

export type CountryOpt = { country: string; flag: string };

export const FALLBACK_COUNTRIES: CountryOpt[] = [
  { country: "Türkiye", flag: "🇹🇷" },
  { country: "Albania", flag: "🇦🇱" },
  { country: "Argentina", flag: "🇦🇷" },
  { country: "Australia", flag: "🇦🇺" },
  { country: "Austria", flag: "🇦🇹" },
  { country: "Belgium", flag: "🇧🇪" },
  { country: "Bolivia", flag: "🇧🇴" },
  { country: "Brazil", flag: "🇧🇷" },
  { country: "Bulgaria", flag: "🇧🇬" },
  { country: "Canada", flag: "🇨🇦" },
  { country: "Chile", flag: "🇨🇱" },
  { country: "China", flag: "🇨🇳" },
  { country: "Colombia", flag: "🇨🇴" },
  { country: "Costa Rica", flag: "🇨🇷" },
  { country: "Croatia", flag: "🇭🇷" },
  { country: "Cyprus", flag: "🇨🇾" },
  { country: "Czech Republic", flag: "🇨🇿" },
  { country: "Denmark", flag: "🇩🇰" },
  { country: "Ecuador", flag: "🇪🇨" },
  { country: "Egypt", flag: "🇪🇬" },
  { country: "El Salvador", flag: "🇸🇻" },
  { country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { country: "Estonia", flag: "🇪🇪" },
  { country: "Faroe Islands", flag: "🇫🇴" },
  { country: "Finland", flag: "🇫🇮" },
  { country: "France", flag: "🇫🇷" },
  { country: "Germany", flag: "🇩🇪" },
  { country: "Greece", flag: "🇬🇷" },
  { country: "Guatemala", flag: "🇬🇹" },
  { country: "Honduras", flag: "🇭🇳" },
  { country: "Hungary", flag: "🇭🇺" },
  { country: "Iceland", flag: "🇮🇸" },
  { country: "India", flag: "🇮🇳" },
  { country: "Indonesia", flag: "🇮🇩" },
  { country: "Ireland", flag: "🇮🇪" },
  { country: "Israel", flag: "🇮🇱" },
  { country: "Italy", flag: "🇮🇹" },
  { country: "Japan", flag: "🇯🇵" },
  { country: "Kazakhstan", flag: "🇰🇿" },
  { country: "Kosovo", flag: "🇽🇰" },
  { country: "Kuwait", flag: "🇰🇼" },
  { country: "Latvia", flag: "🇱🇻" },
  { country: "Lebanon", flag: "🇱🇧" },
  { country: "Lithuania", flag: "🇱🇹" },
  { country: "Malta", flag: "🇲🇹" },
  { country: "Mexico", flag: "🇲🇽" },
  { country: "Morocco", flag: "🇲🇦" },
  { country: "Mozambique", flag: "🇲🇿" },
  { country: "Netherlands", flag: "🇳🇱" },
  { country: "New Zealand", flag: "🇳🇿" },
  { country: "Nicaragua", flag: "🇳🇮" },
  { country: "Northern Ireland", flag: "🇬🇧" },
  { country: "Norway", flag: "🇳🇴" },
  { country: "Panama", flag: "🇵🇦" },
  { country: "Paraguay", flag: "🇵🇾" },
  { country: "Peru", flag: "🇵🇪" },
  { country: "Poland", flag: "🇵🇱" },
  { country: "Portugal", flag: "🇵🇹" },
  { country: "Qatar", flag: "🇶🇦" },
  { country: "Romania", flag: "🇷🇴" },
  { country: "Russia", flag: "🇷🇺" },
  { country: "Saudi Arabia", flag: "🇸🇦" },
  { country: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { country: "Serbia", flag: "🇷🇸" },
  { country: "Slovakia", flag: "🇸🇰" },
  { country: "Slovenia", flag: "🇸🇮" },
  { country: "South Korea", flag: "🇰🇷" },
  { country: "Spain", flag: "🇪🇸" },
  { country: "Sweden", flag: "🇸🇪" },
  { country: "Switzerland", flag: "🇨🇭" },
  { country: "UAE", flag: "🇦🇪" },
  { country: "Ukraine", flag: "🇺🇦" },
  { country: "Uruguay", flag: "🇺🇾" },
  { country: "USA", flag: "🇺🇸" },
  { country: "Uzbekistan", flag: "🇺🇿" },
  { country: "Venezuela", flag: "🇻🇪" },
  { country: "Vietnam", flag: "🇻🇳" },
];
