/**
 * Manual mock for expo-secure-store used in Jest tests.
 * Simulates an in-memory key-value store.
 */
const store = {};

const SecureStore = {
  getItemAsync: jest.fn(async (key) => store[key] ?? null),
  setItemAsync: jest.fn(async (key, value) => { store[key] = value; }),
  deleteItemAsync: jest.fn(async (key) => { delete store[key]; }),
  _reset: () => { Object.keys(store).forEach(k => delete store[k]); },
};

module.exports = SecureStore;
