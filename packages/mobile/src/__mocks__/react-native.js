'use strict';
/**
 * Minimal React Native mock for Jest (node environment).
 * Replaces native UI components with identity stubs so screen modules
 * can be imported and their JS logic tested without a simulator.
 */
const React = require('react');

function stub(name) {
  const C = ({ children, ...props }) => React.createElement(name, props, children);
  C.displayName = name;
  return C;
}

const RN = {
  View:              stub('View'),
  Text:              stub('Text'),
  TouchableOpacity:  stub('TouchableOpacity'),
  FlatList:          stub('FlatList'),
  SafeAreaView:      stub('SafeAreaView'),
  ActivityIndicator: stub('ActivityIndicator'),
  ScrollView:        stub('ScrollView'),
  TextInput:         stub('TextInput'),
  Image:             stub('Image'),
  Modal:             stub('Modal'),
  StatusBar:         { setHidden: jest.fn(), setBarStyle: jest.fn() },
  Platform:          { OS: 'ios', select: (obj) => obj.ios ?? obj.default },
  Dimensions:        { get: () => ({ width: 390, height: 844 }) },
  Alert:             { alert: jest.fn() },
  StyleSheet:        { create: (s) => s, flatten: (s) => s },
  RefreshControl:    stub('RefreshControl'),
  Switch:            stub('Switch'),
  Pressable:         stub('Pressable'),
  KeyboardAvoidingView: stub('KeyboardAvoidingView'),
  useColorScheme:    () => 'light',
  Linking:           { openURL: jest.fn().mockResolvedValue(undefined), canOpenURL: jest.fn().mockResolvedValue(true) },
  Animated:          { Value: class { interpolate() {} }, timing: () => ({ start: jest.fn() }), View: stub('Animated.View') },
};

module.exports = RN;
