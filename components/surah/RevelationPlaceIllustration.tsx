import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, G, Line, Ellipse } from 'react-native-svg';

import { useAppTheme } from '@/providers/ThemeContext';

type RevelationPlaceIllustrationProps = {
  place: string;
};

type MinaretProps = {
  x: number;
  height: number;
  color: string;
};

// Reusable elegant minaret silhouette
function BackgroundMinaret({ x, height, color }: MinaretProps): React.JSX.Element {
  const shaftWidth = 3.5;
  const balconyWidth = 6.5;
  const baseY = 78;
  const topY = baseY - height;

  return (
    <G opacity={0.85}>
      {/* Minaret Shaft */}
      <Rect
        x={x - shaftWidth / 2}
        y={topY}
        width={shaftWidth}
        height={height}
        fill={color}
        rx={0.5}
      />
      {/* Lower Balcony */}
      <Rect
        x={x - balconyWidth / 2}
        y={topY + height * 0.45}
        width={balconyWidth}
        height={2}
        fill={color}
        rx={0.3}
      />
      {/* Upper Balcony */}
      <Rect
        x={x - balconyWidth / 2}
        y={topY + height * 0.15}
        width={balconyWidth}
        height={2}
        fill={color}
        rx={0.3}
      />
      {/* Bulbous Dome Cap */}
      <Path
        d={`M ${x - 2.2} ${topY} Q ${x - 2.7} ${topY - 3.5} ${x} ${topY - 4.5} Q ${x + 2.7} ${topY - 3.5} ${x + 2.2} ${topY} Z`}
        fill={color}
      />
      {/* Spire Tip */}
      <Line
        x1={x}
        y1={topY - 4.5}
        x2={x}
        y2={topY - 7.5}
        stroke={color}
        strokeWidth={0.8}
      />
    </G>
  );
}

function MakkahIllustration({ dark }: { dark: boolean }): React.JSX.Element {
  // Curated theme palettes for Makkah (warm, desert tones)
  const bgColor = dark ? '#27211B' : '#FDF7EA';
  const mosqueColor = dark ? '#43372B' : '#EADCB9';
  const minaretColor = dark ? '#504233' : '#DECFA2';
  const groundColor = dark ? '#5C5042' : '#DECFA2';
  const shadowColor = dark ? '#000000' : '#8B7355';
  
  const kaabaLeft = dark ? '#0C0A09' : '#1C1917';
  const kaabaRight = dark ? '#161412' : '#2A2723';
  const gold = dark ? '#B8922A' : '#C5A028';
  const goldLight = dark ? '#D3AB3B' : '#E5C158';

  return (
    <Svg width="100%" height="100%" viewBox="0 0 136 78">
      {/* Background Arch Backdrop */}
      <Path
        d="M 40,78 C 40,30 65,15 88,15 C 111,15 136,30 136,78 Z"
        fill={bgColor}
      />

      {/* Silhouetted Background Minarets */}
      <BackgroundMinaret x={54} height={50} color={minaretColor} />
      <BackgroundMinaret x={68} height={56} color={minaretColor} />
      <BackgroundMinaret x={122} height={44} color={minaretColor} />

      {/* Background Mosque Arches / Wall */}
      <Path
        d="M 45,78 L 45,62 L 48,62 Q 53,58 58,62 L 61,62 L 61,78 M 61,78 L 61,62 L 64,62 Q 69,58 74,62 L 77,62 L 77,78 M 77,78 L 77,62 L 80,62 Q 85,58 90,62 L 93,62 L 93,78 M 93,78 L 93,62 L 96,62 Q 101,58 106,62 L 109,62 L 109,78 M 109,78 L 109,62 L 112,62 Q 117,58 122,62 L 125,62 L 125,78"
        fill={mosqueColor}
        opacity={0.5}
      />

      {/* Shadow under the Kaaba */}
      <Ellipse cx={92} cy={70} rx={22} ry={4.5} fill={shadowColor} opacity={dark ? 0.4 : 0.15} />

      {/* Ground Line */}
      <Line
        x1={20}
        y1={72}
        x2={125}
        y2={72}
        stroke={groundColor}
        strokeWidth={1.8}
        strokeLinecap="round"
      />

      {/* Kaaba (3D Perspective Block) */}
      {/* Left Face */}
      <Path
        d="M 76,40 L 92,44 L 92,70 L 76,66 Z"
        fill={kaabaLeft}
      />
      {/* Right Face */}
      <Path
        d="M 92,44 L 108,40 L 108,66 L 92,70 Z"
        fill={kaabaRight}
      />

      {/* Kiswa Gold Band */}
      {/* Left Kiswa Band */}
      <Path
        d="M 76,45.2 L 92,49.2 L 92,51.7 L 76,47.7 Z"
        fill={gold}
      />
      {/* Right Kiswa Band */}
      <Path
        d="M 92,49.2 L 108,45.2 L 108,47.7 L 92,51.7 Z"
        fill={goldLight}
      />

      {/* Bab al-Kaaba (Golden Door on Right Face) */}
      <Path
        d="M 96,68.8 L 101,67.55 L 101,54.55 L 96,55.8 Z"
        fill={goldLight}
      />
    </Svg>
  );
}

function MadinahIllustration({ dark }: { dark: boolean }): React.JSX.Element {
  // Curated theme palettes for Madinah (cool, green-teal tones)
  const bgColor = dark ? '#15221B' : '#EEF6F2';
  const mosqueColor = dark ? '#24372D' : '#D5E8DE';
  const minaretColor = dark ? '#2E473B' : '#C6DCD0';
  const groundColor = dark ? '#385244' : '#B8D1C4';
  const shadowColor = dark ? '#000000' : '#4E685B';

  const domeColor = dark ? '#439D7A' : '#28785C';
  const domeColorDark = dark ? '#348263' : '#1E5E45';
  const domeBaseColor = dark ? '#2E473B' : '#ECE5DB';
  const gold = dark ? '#B8922A' : '#C5A028';

  return (
    <Svg width="100%" height="100%" viewBox="0 0 136 78">
      {/* Background Arch Backdrop */}
      <Path
        d="M 40,78 C 40,30 65,15 88,15 C 111,15 136,30 136,78 Z"
        fill={bgColor}
      />

      {/* Silhouetted Background Minarets */}
      <BackgroundMinaret x={52} height={54} color={minaretColor} />
      <BackgroundMinaret x={118} height={50} color={minaretColor} />

      {/* Background Mosque Arches / Wall */}
      <Path
        d="M 45,78 L 45,64 L 48,64 Q 53,60 58,64 L 61,64 L 61,78 M 61,78 L 61,64 L 64,64 Q 69,60 74,64 L 77,64 L 77,78 M 77,78 L 77,64 L 80,64 Q 85,60 90,64 L 93,64 L 93,78 M 93,78 L 93,64 L 96,64 Q 101,60 106,64 L 109,64 L 109,78 M 109,78 L 109,64 L 112,64 Q 117,60 122,64 L 125,64 L 125,78"
        fill={mosqueColor}
        opacity={0.5}
      />

      {/* Shadow under the Dome structure */}
      <Ellipse cx={85} cy={70} rx={26} ry={4} fill={shadowColor} opacity={dark ? 0.45 : 0.2} />

      {/* Ground Line */}
      <Line
        x1={20}
        y1={72}
        x2={125}
        y2={72}
        stroke={groundColor}
        strokeWidth={1.8}
        strokeLinecap="round"
      />

      {/* Prophet's Mosque Green Dome (Foreground) */}
      {/* Square base of dome */}
      <Rect
        x={68}
        y={64}
        width={34}
        height={7}
        fill={domeBaseColor}
        rx={0.8}
      />
      {/* Cylindrical neck of dome */}
      <Rect
        x={72}
        y={58}
        width={26}
        height={6}
        fill={domeColorDark}
        rx={0.5}
      />
      {/* Bulbous Green Dome Path */}
      <Path
        d="M 70,58 C 68,50 74,38 85,36 C 96,38 102,50 100,58 Z"
        fill={domeColor}
      />

      {/* Dome Spire and Crescent (Gold) */}
      <G>
        <Line
          x1={85}
          y1={36}
          x2={85}
          y2={25}
          stroke={gold}
          strokeWidth={1.2}
        />
        {/* Detailed tiny crescent */}
        <Path
          d="M 85,25 C 86.3,25 87.2,25.8 87.2,26.8 C 87.2,27.8 86.2,28.6 85,28.6 C 85.7,28.6 86.4,28 86.4,26.8 C 86.4,25.8 85.7,25.3 85,25 Z"
          fill={gold}
        />
      </G>
    </Svg>
  );
}

function RevelationPlaceIllustrationComponent({
  place,
}: RevelationPlaceIllustrationProps): React.JSX.Element {
  const { isDark } = useAppTheme();
  const isMakkah = place.toLowerCase() === 'makkah';

  return (
    <View
      accessible
      accessibilityLabel={`${isMakkah ? 'Makki' : 'Madani'} surah`}
      style={styles.frame}
    >
      {isMakkah ? <MakkahIllustration dark={isDark} /> : <MadinahIllustration dark={isDark} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 136, height: 78 },
});

export const RevelationPlaceIllustration = React.memo(RevelationPlaceIllustrationComponent);
