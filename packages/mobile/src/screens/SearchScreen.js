/**
 * SearchScreen — search creators, live streams and products.
 * API: GET /content/search?q=...  → { users, streams, products }
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, useColorScheme, ActivityIndicator,
  SectionList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get } from '../api/client';
import { dark, light } from '../theme/colors';

function fmtViewers(n) {
  if (!n) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function AvatarCircle({ name, color, size = 44 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color || '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>
        {(name || 'U')[0].toUpperCase()}
      </Text>
    </View>
  );
}

export default function SearchScreen({ navigation }) {
  const scheme      = useColorScheme();
  const C           = scheme === 'dark' ? dark : light;
  const { t }       = useTranslation();
  const TABS        = [t('search.tabs.all'), t('search.tabs.creators'), t('search.tabs.streams'), t('search.tabs.products')];
  const [query,     setQuery]    = useState('');
  const [tab,       setTab]      = useState(TABS[0]);
  const [users,     setUsers]    = useState([]);
  const [streams,   setStreams]  = useState([]);
  const [products,  setProducts] = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [searched,  setSearched] = useState(false);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await get(`/content/search?q=${encodeURIComponent(q)}&limit=30`);
      setUsers(data.users    || []);
      setStreams(data.streams || []);
      setProducts(data.products || []);
    } catch {
      setUsers([]); setStreams([]); setProducts([]);
    }
    setLoading(false);
  }, [query]);

  const clear = () => {
    setQuery('');
    setUsers([]); setStreams([]); setProducts([]);
    setSearched(false);
  };

  const s = styles(C);

  /* ── Build sections for SectionList ── */
  const sections = [];
  const showUsers    = tab === TABS[0] || tab === TABS[1];
  const showStreams   = tab === TABS[0] || tab === TABS[2];
  const showProducts = tab === TABS[0] || tab === TABS[3];

  if (showUsers    && users.length > 0)    sections.push({ title: t('search.sectionCreators'), data: users,    type: 'user' });
  if (showStreams   && streams.length > 0)  sections.push({ title: t('search.sectionStreams'),  data: streams,  type: 'stream' });
  if (showProducts && products.length > 0) sections.push({ title: t('search.sectionProducts'), data: products, type: 'product' });

  const totalResults = (showUsers ? users.length : 0)
    + (showStreams ? streams.length : 0)
    + (showProducts ? products.length : 0);

  const renderItem = ({ item, section }) => {
    if (section.type === 'user') {
      return (
        <TouchableOpacity
          style={s.row}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('CreatorProfile', { creatorId: String(item._id || item.id) })}
        >
          <AvatarCircle name={item.displayName || item.handle} />
          <View style={s.rowInfo}>
            <Text style={s.rowName}>{item.displayName || item.handle || 'Creator'}</Text>
            {item.bio ? <Text style={s.rowSub} numberOfLines={1}>{item.bio}</Text> : null}
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      );
    }

    if (section.type === 'stream') {
      const vc = fmtViewers(item.viewerCount || item.viewers);
      const isLive = item.status === 'live';
      return (
        <TouchableOpacity
          style={s.row}
          activeOpacity={0.75}
          onPress={() => {
            if (item._id && isLive) {
              navigation.navigate('Tabs', { screen: 'Live' });
            } else {
              navigation.navigate('Tabs', { screen: 'Live' });
            }
          }}
        >
          <View style={[s.streamThumb, isLive && { borderColor: '#ef4444', borderWidth: 2 }]}>
            <Text style={{ fontSize: 20 }}>📺</Text>
            {isLive && (
              <View style={s.liveDot}><Text style={s.liveDotText}>LIVE</Text></View>
            )}
          </View>
          <View style={s.rowInfo}>
            <Text style={s.rowName} numberOfLines={1}>{item.title || 'Stream'}</Text>
            <Text style={s.rowSub} numberOfLines={1}>
              {item.creatorName || item.displayName || 'Creator'}
              {vc ? ` · ${vc} watching` : ''}
            </Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      );
    }

    if (section.type === 'product') {
      const price = item.priceCents != null ? `$${(item.priceCents / 100).toFixed(2)}` : '';
      return (
        <TouchableOpacity
          style={s.row}
          activeOpacity={0.75}
          onPress={() => {
            const creatorId = String(item.creatorId || '');
            if (creatorId) navigation.navigate('CreatorProfile', { creatorId });
          }}
        >
          <View style={[s.streamThumb, { backgroundColor: C.bgCard }]}>
            <Text style={{ fontSize: 22 }}>📦</Text>
          </View>
          <View style={s.rowInfo}>
            <Text style={s.rowName} numberOfLines={1}>{item.name || 'Product'}</Text>
            {price ? <Text style={[s.rowSub, { color: C.accent }]}>{price}</Text> : null}
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('search.sectionCreators')}</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchBar}>
        <Text style={{ fontSize: 16, color: C.textMuted, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={C.textMuted}
          returnKeyType="search"
          onSubmitEditing={search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: C.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar — only shown after a search */}
      {searched && !loading && (
        <View style={s.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[s.tabBtn, tab === t && s.tabBtnActive]}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Body */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
      ) : !searched ? (
        <View style={s.hint}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>🔍</Text>
          <Text style={s.hintText}>{t('search.startHint')}</Text>
        </View>
      ) : totalResults === 0 ? (
        <View style={s.hint}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>😶</Text>
          <Text style={s.hintText}>{t('search.noResults', { query })}</Text>
          <Text style={[s.hintText, { fontSize: 13, marginTop: 4 }]}>{t('search.noResultsHint')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => String(item._id || item.id || index)}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title, data } }) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{title}</Text>
              <Text style={s.sectionCount}>{data.length}</Text>
            </View>
          )}
          contentContainerStyle={s.list}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:   { fontSize: 20, fontWeight: '800', color: C.text },

  searchBar:     { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8,
                   paddingHorizontal: 14, paddingVertical: 10,
                   borderWidth: 1, borderColor: C.border, borderRadius: 14, backgroundColor: C.bgCard },
  input:         { flex: 1, fontSize: 15, color: C.text },

  tabBar:        { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 6, gap: 6 },
  tabBtn:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                   borderWidth: 1, borderColor: C.border, backgroundColor: C.bgCard },
  tabBtnActive:  { backgroundColor: C.accent, borderColor: C.accent },
  tabText:       { fontSize: 13, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: '#fff' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: C.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount:  { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  list:          { paddingBottom: 32 },
  row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                   paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  rowInfo:       { flex: 1 },
  rowName:       { fontSize: 15, fontWeight: '600', color: C.text },
  rowSub:        { fontSize: 13, color: C.textMuted, marginTop: 2 },
  chevron:       { fontSize: 20, color: C.textMuted, lineHeight: 24 },

  streamThumb:   { width: 44, height: 44, borderRadius: 10, backgroundColor: C.border,
                   alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  liveDot:       { position: 'absolute', bottom: 0, left: 0, right: 0,
                   backgroundColor: '#ef4444', alignItems: 'center' },
  liveDotText:   { color: '#fff', fontSize: 7, fontWeight: '800', paddingVertical: 1 },

  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  hintText:      { color: C.textMuted, fontSize: 15, textAlign: 'center' },
});
