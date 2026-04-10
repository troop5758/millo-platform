'use strict';
const React = require('react');
const stub = (name) => ({ displayName: name, render: () => null });
module.exports = {
  SafeAreaProvider: (p) => React.createElement('SafeAreaProvider', null, p.children),
  SafeAreaView:     (p) => React.createElement('SafeAreaView', null, p.children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame:  () => ({ x: 0, y: 0, width: 375, height: 812 }),
};
