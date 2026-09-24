import { Linking, Platform } from 'react-native';
import type { PurchaseDocument } from '../types/purchase';

/**
 * Opens a locally-captured document file where the platform allows it.
 * Returns false when there is nothing openable (metadata-only record).
 */
export async function openDocumentFile(document: PurchaseDocument): Promise<boolean> {
  if (document.content) return false; // handled by the in-app text viewer
  if (!document.uri) return false;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.open(document.uri, '_blank', 'noopener');
      return true;
    }
    const supported = await Linking.canOpenURL(document.uri);
    if (!supported) return false;
    await Linking.openURL(document.uri);
    return true;
  } catch {
    return false;
  }
}
