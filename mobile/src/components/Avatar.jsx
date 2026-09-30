import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { photoUrl } from '../format/photoUrl';

// The web's Avatar: a PHOTO when the person has one, INITIALS on a brand-soft
// disc otherwise (feat/profile-photos, 2026-09-30). `photo` is the stored
// `users.profile_pic` FILE NAME, turned into an address by the mirrored
// format/photoUrl.js — so only USER rows carry one; a learner's avatar is
// always initials, because `students` has no photo column. A photo that fails
// to load (the file gone after a restore of an older backup — KNOWN_ISSUES)
// falls back to the initials, never a broken image. Not announced: the name
// is always beside it as text.
//
// The size and the circle are a plain style OBJECT on the View and the Image,
// never a style function — NativeWind drops a function (MOBILE_CONVENTIONS
// M20).
export function initialsOf(name) {
  if (typeof name !== 'string') return '';
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

export default function Avatar({ name, photo = null, size = 38 }) {
  const initials = initialsOf(name);
  const uri = photoUrl(photo, API_BASE_URL);
  // The address that failed, not a boolean: a NEW photo gets its own try.
  const [failed, setFailed] = useState(null);

  if (uri && failed !== uri) {
    return (
      <View
        accessible={false}
        className="overflow-hidden rounded-full bg-brand-soft"
        style={{ width: size, height: size }}
      >
        <Image
          source={{ uri }}
          onError={() => setFailed(uri)}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  if (!initials) return null;
  return (
    <View
      accessible={false}
      className="items-center justify-center rounded-full bg-brand-soft"
      style={{ width: size, height: size }}
    >
      <Text className={`${size >= 64 ? 'text-xl' : 'text-xs'} font-semibold text-brand`}>{initials}</Text>
    </View>
  );
}
