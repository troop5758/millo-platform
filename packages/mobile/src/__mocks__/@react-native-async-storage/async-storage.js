'use strict';
const store = new Map();
module.exports = {
  getItem:    jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
  setItem:    jest.fn((key, val) => { store.set(key, val); return Promise.resolve(); }),
  removeItem: jest.fn((key) => { store.delete(key); return Promise.resolve(); }),
  clear:      jest.fn(() => { store.clear(); return Promise.resolve(); }),
  getAllKeys:  jest.fn(() => Promise.resolve([...store.keys()])),
  _store: store,
};
