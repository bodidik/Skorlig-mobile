/**
 * UYGULAMA ÇAPINDA HATA SINIRI.
 *
 * ⚠️ NEDEN VAR: uygulamada hiç ErrorBoundary yoktu. React'te render sırasında
 * atılan tek bir hata TÜM ağacı söker: geliştirmede kırmızı ekran, yayında
 * beyaz/kapanan uygulama. Kullanıcı ne olduğunu anlamaz ve genellikle geri
 * dönmez — bu, düzeltmeye çalıştığımız "yılıp gitme" sorununun en sert hâli.
 *
 * Tek bir ekranın verisi bozuk geldiğinde (beklenmeyen alan, null dizi) tüm
 * uygulamanın ölmesi yerine burada yakalanır ve kullanıcıya çıkış yolu verilir.
 *
 * ⚠️ SINIRLARI: ErrorBoundary yalnızca RENDER sırasındaki hataları yakalar.
 * Olay işleyicileri, `setTimeout` ve reddedilen promise'ler buraya DÜŞMEZ —
 * onlar için apiFetch'teki try/catch ve hataMesaji.ts kullanılıyor.
 */

import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";

type Props = { children: React.ReactNode };
type State = { hata: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hata: null };

  static getDerivedStateFromError(hata: Error): State {
    return { hata };
  }

  componentDidCatch(hata: Error, bilgi: { componentStack?: string }) {
    // Konsola bas: Metro/logcat'te görünsün. Uzak raporlama eklenirse burası.
    console.error("[ErrorBoundary] render hatasi:", hata?.message || hata, bilgi?.componentStack);
  }

  render() {
    if (!this.state.hata) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: "#0b0f14", padding: 24, justifyContent: "center" }}>
        <Text style={{ color: "#e5e7eb", fontSize: 20, fontWeight: "700", marginBottom: 10 }}>
          Bir şeyler ters gitti
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 14, lineHeight: 20, marginBottom: 22 }}>
          Beklenmeyen bir hata oluştu ve ekran yüklenemedi. Verilerin güvende;
          tekrar denemen yeterli.
        </Text>

        <TouchableOpacity
          onPress={() => this.setState({ hata: null })}
          style={{
            backgroundColor: "#a3e635",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#0b0f14", fontWeight: "700", fontSize: 15 }}>Tekrar dene</Text>
        </TouchableOpacity>

        {/* Teknik ayrıntı yalnızca geliştirmede: kullanıcıya yığın izi gösterilmez. */}
        {__DEV__ ? (
          <ScrollView style={{ marginTop: 22, maxHeight: 220 }}>
            <Text style={{ color: "#f87171", fontSize: 11, fontFamily: "monospace" }}>
              {String(this.state.hata?.stack || this.state.hata?.message || this.state.hata)}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    );
  }
}
