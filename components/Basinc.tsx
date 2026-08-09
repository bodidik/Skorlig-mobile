import React, { useRef } from "react";
import { Animated, Pressable, ViewStyle, StyleProp } from "react-native";

/**
 * Basınca küçülüp yaylanarak dönen dokunma sarmalayıcı.
 *
 * ⚠️ NEDEN VAR: uygulamadaki her dokunma TouchableOpacity idi — tek geri
 * bildirim opaklık düşmesi. Fiziksel his yok; "banka portalı" hissinin ana
 * kaynaklarından biri. Bu sarmalayıcı dokunuşa kütle kazandırır.
 */
type Props = {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children: React.ReactNode;
};

export default function Basinc({ onPress, disabled, style, scaleTo = 0.95, children }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const bas = () =>
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const birak = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={bas} onPressOut={birak} disabled={disabled} style={style}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}
