import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

type BismillahOrnamentProps = {
  color: string;
};

function OrnamentEnd(): React.JSX.Element {
  return (
    <G>
      {/* Top and Bottom outer arches */}
      <Path d="M6 20h19c11 0 13-10 18-10s7 10 18 10h19" />
      <Path d="M6 56h19c11 0 13 10 18 10s7-10 18-10h19" />

      {/* Top and Bottom inner parallel arches (creates double-line density) */}
      <Path d="M6 23h18c10 0 12-8 19-8s9 8 19 8h18" />
      <Path d="M6 53h18c10 0 12 8 19 8s9-8 19-8h18" />

      {/* Concentric circles for high density */}
      <Circle cx="43" cy="38" r="20" />
      <Circle cx="43" cy="38" r="17" />
      <Circle cx="43" cy="38" r="13.5" />
      
      {/* Rub el Hizb (8-pointed star) inside the innermost circle */}
      <Rect x="34" y="29" width="18" height="18" rx="1.5" />
      <Rect x="34" y="29" width="18" height="18" rx="1.5" transform="rotate(45 43 38)" />
      <Circle cx="43" cy="38" r="3.5" />

      {/* Peak accent diamonds (top and bottom) */}
      <Path d="M41 10 L43 8 L45 10 L43 12 Z" />
      <Path d="M41 66 L43 68 L45 66 L43 64 Z" />

      {/* Left side circle ornament with inner cross lines and concentric rings */}
      <Circle cx="14" cy="38" r="5" />
      <Circle cx="14" cy="38" r="2" />
      <Path d="M6 38h3" />
      <Path d="M19 38h4" />
      <Path d="M14 33v2" />
      <Path d="M14 41v2" />

      {/* Right side circle ornament with inner cross lines and concentric rings */}
      <Circle cx="72" cy="38" r="5" />
      <Circle cx="72" cy="38" r="2" />
      <Path d="M63 38h4" />
      <Path d="M77 38h3.5" />
      <Path d="M72 33v2" />
      <Path d="M72 41v2" />

      {/* Decorative tip/diamond connecting to cartouche */}
      <Path d="M76.5 38 L80 34.5 L83.5 38 L80 41.5 Z" />
    </G>
  );
}

function BismillahOrnamentComponent({ color }: BismillahOrnamentProps): React.JSX.Element {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 560 76"
      fill="none"
      stroke={color}
      strokeWidth={1.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      <Rect x="2" y="2" width="556" height="72" rx="3" />
      <Rect x="6" y="6" width="548" height="64" rx="2" />

      <OrnamentEnd />
      <G transform="translate(560 0) scale(-1 1)">
        <OrnamentEnd />
      </G>

      {/* Cartouche double border */}
      <Path d="M80 38c8-24 25-24 25-24h350s17 0 25 24c-8 24-25 24-25 24H105s-17 0-25-24Z" />
      <Path d="M84 38c7-21 24-21 24-21h344s16 0 24 21c-7 21-24 21-24 21H108s-16 0-24-21Z" />

      {/* Internal cartouche flourishes */}
      <Path d="M108 17 112 21 108 25 104 21Z" />
      <Path d="M452 17 456 21 452 25 448 21Z" />
      <Path d="M108 59 112 55 108 51 104 55Z" />
      <Path d="M452 59 456 55 452 51 448 55Z" />

      {/* Mirrored leaf-and-dot accents fill the pockets beside the calligraphy. */}
      <Path d="M91 38c4-5 8-5 12 0-4 5-8 5-12 0Z" />
      <Circle cx="97" cy="38" r="1.35" />
      <Path d="M103 38h5" />
      <G transform="translate(560 0) scale(-1 1)">
        <Path d="M91 38c4-5 8-5 12 0-4 5-8 5-12 0Z" />
        <Circle cx="97" cy="38" r="1.35" />
        <Path d="M103 38h5" />
      </G>
    </Svg>
  );
}

export const BismillahOrnament = React.memo(BismillahOrnamentComponent);
