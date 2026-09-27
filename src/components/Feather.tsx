import React from 'react';
import ExpoFeather from '@expo/vector-icons/Feather';
/** All app icons accompany a text label or a labeled control. Hide glyphs from
 * assistive technology instead of announcing private-use Unicode characters. */
export function Feather(props: React.ComponentProps<typeof ExpoFeather>) {
  return <ExpoFeather {...props} accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" />;
}
