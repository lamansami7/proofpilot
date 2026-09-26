// AsyncStorage ships an official in-memory mock; storage behavior itself is
// exercised through the pure snapshot/store logic tests instead.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
