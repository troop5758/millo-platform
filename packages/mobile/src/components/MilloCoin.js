import React from 'react';
import { Image, StyleSheet } from 'react-native';

const coin = require('../../assets/millocoin.png');

export function MilloCoin({ size = 20, style }) {
  return (
    <Image
      source={coin}
      style={[{ width: size, height: size }, styles.base, style]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'center' },
});
