/**
 * Hub for account surfaces hidden from the bottom tab bar (Profile, Messages, Alerts).
 * Push deep-links still target tab names directly — screen names are unchanged.
 * https://milloapp.com
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useColorScheme,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { dark, light } from '../theme/colors';

const ROWS = [
  { screen: 'Profile', icon: 'person-circle-outline', labelKey: 'tabs.profile' },
  { screen: 'Messages', icon: 'chatbubbles-outline', labelKey: 'tabs.messages' },
  { screen: 'Notifications', icon: 'notifications-outline', labelKey: 'tabs.notifications' },
];

export default function MoreMenuScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const s = styles(C);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>{t('moreMenu.title')}</Text>
        <Text style={s.subtitle}>{t('moreMenu.subtitle')}</Text>
      </View>
      <View style={s.list}>
        {ROWS.map(({ screen, icon, labelKey }, index) => (
          <TouchableOpacity
            key={screen}
            style={[s.row, index === ROWS.length - 1 && s.rowLast]}
            onPress={() => navigation.navigate(screen)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t(labelKey)}
          >
            <View style={s.rowLeft}>
              <Ionicons name={icon} size={22} color={C.accent} />
              <Text style={s.rowLabel}>{t(labelKey)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function styles(C) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
    title: { fontSize: 24, fontWeight: '700', color: C.text },
    subtitle: { marginTop: 6, fontSize: 14, color: C.textMuted, lineHeight: 20 },
    list: {
      marginHorizontal: 16,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.bgCard,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    rowLabel: { fontSize: 16, fontWeight: '600', color: C.text },
  });
}
