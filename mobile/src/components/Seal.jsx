import { Image, View } from 'react-native';
import seal from '../../assets/school-seal.png';

// THE SEAL ALWAYS SITS ON ITS WHITE DISC (§9). The source is a JPG-derived
// PNG with a solid white field and no alpha, so on a dark surface or the
// brand panel the disc is what makes it read as a seal rather than a white
// square. `seal-bg` is white in BOTH themes on purpose. Same alt text as
// everywhere on the web.

export const SEAL_ALT = 'Captain H. Francisco Elementary School seal';

export default function Seal({ size = 96, halo = false }) {
  const disc = size + 8;
  return (
    <View
      className={`items-center justify-center rounded-full bg-seal-bg ${halo ? 'border-4 border-brand-panel-ring' : ''}`}
      style={{ width: disc, height: disc }}
    >
      <Image
        source={seal}
        accessibilityLabel={SEAL_ALT}
        accessible
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    </View>
  );
}
