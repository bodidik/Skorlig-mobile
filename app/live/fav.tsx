import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../../constants/colors";

/**
 * ⚠️ BU EKRAN TEKİLLEŞTİRİLDİ — artık yalnızca yönlendirme.
 *
 * Burada `app/stats/fav.tsx` ile BİREBİR AYNI form vardı ("Favori Takım Seç"):
 * iki ayrı ekran, aynı işi yapıyordu. İkisi de kırıktı ve FARKLI yanlış uçlara
 * gidiyordu (`/api/stats/fav` ve `/api/rt/fav-team` — ikisi de yok), yani
 * favori takım hiçbir zaman kaydedilmiyordu.
 *
 * Üstüne menüde "Favori Takımım Canlı" diye etiketliydi: kullanıcı takımının
 * canlı maçlarını bekleyip takım adı yazma formuyla karşılaşıyordu.
 *
 * Kopyayı silmek yerine yönlendirmeye çevirdim: eski bağlantılar (stats/me.tsx
 * ve stats sekmesi menüsü) kırılmasın, ama tek bir ayar ekranı kalsın.
 */
export default function FavRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/stats/fav");
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }}>
      <ActivityIndicator size="small" color={Colors.primary} />
    </View>
  );
}
