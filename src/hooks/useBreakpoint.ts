import { useWindowDimensions } from 'react-native';
import { breakpoints } from '../design/tokens';

export type Viewport = { width: number; isPhone: boolean; isTablet: boolean; isDesktop: boolean };
export function useBreakpoint(): Viewport {
  const { width } = useWindowDimensions();
  return { width, isPhone: width <= breakpoints.phone, isTablet: width > breakpoints.phone && width <= breakpoints.desktop, isDesktop: width > breakpoints.desktop };
}
