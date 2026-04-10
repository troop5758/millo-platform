/**
 * ShopScreen — browse featured products from all creators.
 * GET /shop/products?status=active&limit=30
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  SafeAreaView, RefreshControl, useColorScheme, ActivityIndicator,
  TextInput, Modal, ScrollView, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { get } from '../api/client';
import { dark, light } from '../theme/colors';

const CART_KEY = 'millo_cart';

async function loadCart() {
  try { const r = await AsyncStorage.getItem(CART_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
async function saveCart(items) {
  try { await AsyncStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

function fmtPrice(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/* ── Product detail modal ── */
function ProductModal({ product, onClose, onAddToCart, C }) {
  const { t } = useTranslation();
  const [added, setAdded] = useState(false);
  const s = modalStyles(C);
  if (!product) return null;

  const handleAdd = async () => {
    await onAddToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <Text style={s.title} numberOfLines={2}>{product.name}</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Text style={{ color: C.textMuted, fontSize: 22 }}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {product.imageUrls?.[0] ? (
            <Image source={{ uri: product.imageUrls[0] }} style={s.image} resizeMode="cover" />
          ) : (
            <View style={[s.image, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 56 }}>🛍️</Text>
            </View>
          )}
          <View style={s.body}>
            <Text style={s.price}>{fmtPrice(product.priceCents, product.currency)}</Text>
            {product.description ? (
              <Text style={s.description}>{product.description}</Text>
            ) : null}
            {product.category && (
              <View style={s.tagRow}>
                <View style={s.tag}><Text style={s.tagText}>{product.category}</Text></View>
                {(product.tags || []).map((t) => (
                  <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                ))}
              </View>
            )}
            {product.inventory > 0 && (
              <Text style={s.stock}>{t('shop.inStock', { count: product.inventory })}</Text>
            )}
          </View>
        </ScrollView>
        <View style={s.footer}>
          <TouchableOpacity style={[s.addToCart, added && { backgroundColor: '#16a34a' }]} onPress={handleAdd} activeOpacity={0.85}>
            <Text style={s.addToCartText}>
              {added ? t('shop.addedToCart') : t('shop.addToCart', { price: fmtPrice(product.priceCents, product.currency) })}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const modalStyles = (C) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  title:       { flex: 1, fontSize: 17, fontWeight: '700', color: C.text, marginRight: 12 },
  closeBtn:    { padding: 4 },
  image:       { width: '100%', aspectRatio: 1, backgroundColor: C.border },
  body:        { padding: 20 },
  price:       { fontSize: 26, fontWeight: '900', color: C.accent, marginBottom: 12 },
  description: { fontSize: 14, color: C.textMuted, lineHeight: 22 },
  tagRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag:         { backgroundColor: C.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:     { fontSize: 11, color: C.textMuted, textTransform: 'capitalize' },
  stock:       { fontSize: 13, color: C.green, marginTop: 8, fontWeight: '600' },
  footer:      { padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  addToCart:   { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  addToCartText:{ color: '#fff', fontWeight: '800', fontSize: 15 },
});

/* ── Main screen ── */
export default function ShopScreen() {
  const { t } = useTranslation();
  const scheme   = useColorScheme();
  const C        = scheme === 'dark' ? dark : light;
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refresh,   setRefresh]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null);
  const [offset,    setOffset]    = useState(0);
  const [hasMore,   setHasMore]   = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [toastMsg,  setToastMsg]  = useState(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMsg(null));
  }, [toastOpacity]);

  // Load cart count on mount
  useEffect(() => {
    loadCart().then((items) => setCartCount(items.length));
  }, []);

  const handleAddToCart = useCallback(async (product) => {
    const cart = await loadCart();
    const existing = cart.findIndex((i) => String(i._id) === String(product._id));
    if (existing >= 0) {
      cart[existing].qty = (cart[existing].qty || 1) + 1;
    } else {
      cart.push({
        _id:        String(product._id || product.id),
        name:       product.name,
        priceCents: product.priceCents,
        currency:   product.currency || 'USD',
        imageUrls:  product.imageUrls || [],
        qty:        1,
      });
    }
    await saveCart(cart);
    setCartCount(cart.length);
    showToast(t('shop.addedToCartMsg', { name: product.name }));
  }, [showToast]);

  const load = useCallback(async (reset = false) => {
    const off = reset ? 0 : offset;
    if (reset || off === 0) setLoading(true);
    if (reset) setLoadError('');
    try {
      const data = await get(`/shop/products?status=active&limit=20&offset=${off}`);
      const list = data.products || [];
      setProducts((prev) => reset ? list : [...prev, ...list]);
      setHasMore(list.length >= 20);
      setOffset(off + list.length);
      setLoadError('');
    } catch (e) {
      if (reset || off === 0) setLoadError(e.message || t('common.error'));
    }
    setLoading(false);
    setRefresh(false);
  }, [offset, t]);

  useEffect(() => { load(true); }, []);

  const filtered = search
    ? products.filter((p) =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase()))
    : products;

  const s = styles(C);
  const numCols = 2;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('shop.title')}</Text>
        {cartCount > 0 && (
          <View style={s.cartBadge}>
            <Text style={s.cartBadgeText}>🛒 {cartCount}</Text>
          </View>
        )}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <Text style={{ color: C.textMuted, marginRight: 6 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('shop.searchPlaceholder')}
            placeholderTextColor={C.textMuted}
            style={s.searchInput}
          />
        </View>
      </View>

      {loadError ? (
        <View style={s.center}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
          <Text style={[s.emptyTitle, { textAlign: 'center', marginBottom: 8 }]}>{loadError}</Text>
          <TouchableOpacity onPress={() => load(true)} activeOpacity={0.8}
            style={{ backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : loading && products.length === 0 ? (
        <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={numCols}
          keyExtractor={(item) => String(item._id || item.id)}
          contentContainerStyle={s.list}
          columnWrapperStyle={s.row}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.accent} />}
          onEndReached={() => { if (hasMore && !loading) load(false); }}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
              <View style={s.imageWrap}>
                {item.imageUrls?.[0]
                  ? <Image source={{ uri: item.imageUrls[0] }} style={s.image} resizeMode="cover" />
                  : <View style={[s.image, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 36 }}>🛍️</Text>
                    </View>}
              </View>
              <View style={s.info}>
                <Text style={s.name} numberOfLines={2}>{item.name}</Text>
                <Text style={s.price}>{fmtPrice(item.priceCents, item.currency)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🛍️</Text>
              <Text style={s.emptyTitle}>{t('shop.noProducts')}</Text>
              <Text style={s.emptySub}>{search ? t('shop.noResultsDesc') : t('shop.noProductsDesc')}</Text>
            </View>
          }
        />
      )}

      <ProductModal product={selected} onClose={() => setSelected(null)} onAddToCart={handleAddToCart} C={C} />

      {/* Cart toast */}
      {toastMsg && (
        <Animated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  cartBadge:   { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  cartBadgeText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  searchWrap:  { paddingHorizontal: 16, paddingBottom: 12 },
  searchBar:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  list:        { padding: 12 },
  row:         { gap: 12, marginBottom: 12 },
  card:        { flex: 1, backgroundColor: C.bgCard, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  imageWrap:   { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: C.border },
  image:       { width: '100%', height: '100%' },
  info:        { padding: 10 },
  name:        { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 4, lineHeight: 18 },
  price:       { fontSize: 14, fontWeight: '800', color: C.accent },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub:    { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
  toast:       { position: 'absolute', bottom: 32, left: 24, right: 24, backgroundColor: '#1a1a1a', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10 },
  toastText:   { color: '#fff', fontSize: 14, fontWeight: '600' },
});
