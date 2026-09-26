// AsyncStorage ships an official in-memory mock; storage behavior itself is
// exercised through the pure snapshot/store logic tests instead.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// Jest has no native font registry; SDK 52's generic native mock returns an
// object for getLoadedFonts(). Browser E2E exercises the real font loader.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: jest.fn(() => true),
  loadAsync: jest.fn(async () => {}),
}));
