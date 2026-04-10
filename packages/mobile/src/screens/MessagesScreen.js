import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, useColorScheme, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { get, post } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { dark, light } from '../theme/colors';
import { enqueueDm } from '../services/offlineDmSync';

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function ConversationList({ convos, loading, refresh, onRefresh, onSelect, onCalls, C }) {
  const { t } = useTranslation();
  const s = convStyles(C);
  if (loading) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;
  return (
    <FlatList
      data={convos}
      keyExtractor={(i) => String(i.userId)}
      ListHeaderComponent={onCalls ? (
        <TouchableOpacity style={s.callsRow} onPress={onCalls} activeOpacity={0.8}>
          <View style={s.callsIcon}><Text style={s.callsIconText}>📞</Text></View>
          <Text style={s.callsLabel}>{t('calls.title')}</Text>
          <Text style={s.callsHint}>{t('calls.viewHistory')}</Text>
        </TouchableOpacity>
      ) : null}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      renderItem={({ item }) => (
        <TouchableOpacity style={s.row} onPress={() => onSelect(item)} activeOpacity={0.8}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(item.displayName || 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={s.info}>
            <View style={s.nameRow}>
              <Text style={s.name}>{item.displayName}</Text>
              <Text style={s.time}>{timeAgo(item.lastMessage?.createdAt)}</Text>
            </View>
            <Text style={s.preview} numberOfLines={1}>{item.lastMessage?.body || t('messages.noMessages')}</Text>
          </View>
          {item.unreadCount > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{item.unreadCount}</Text></View>
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={s.empty}>{t('messages.noConversations')}</Text>}
    />
  );
}
const convStyles = (C) => StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  callsRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  callsIcon:  { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent + '20', alignItems: 'center', justifyContent: 'center' },
  callsIconText: { fontSize: 22 },
  callsLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  callsHint:  { fontSize: 12, color: C.textMuted },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  avatar:     { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  info:       { flex: 1 },
  nameRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  name:       { fontSize: 15, fontWeight: '600', color: C.text },
  time:       { fontSize: 12, color: C.textMuted },
  preview:    { fontSize: 13, color: C.textMuted, marginTop: 2 },
  badge:      { width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty:      { textAlign: 'center', color: C.textMuted, marginTop: 60, fontSize: 14 },
});

export default function MessagesScreen() {
  const scheme       = useColorScheme();
  const C            = scheme === 'dark' ? dark : light;
  const { user }     = useAuth();
  const { t }        = useTranslation();
  const navigation  = useNavigation();
  const [convos,    setConvos]   = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [refresh,   setRefresh]  = useState(false);
  const [selected,  setSelected] = useState(null);
  const [messages,  setMessages] = useState([]);
  const [input,     setInput]    = useState('');
  const [sending,     setSending]     = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const loadConvos = async (silent = false) => {
    if (!silent) setLoading(true);
    try { const d = await get('/dm/conversations'); setConvos(d.conversations || []); } catch (err) { console.warn('[MessagesScreen] failed to load conversations:', err?.message); }
    setLoading(false); setRefresh(false);
  };

  const loadMessages = async (c) => {
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const d = await get(`/dm/conversation/${c.userId}/messages`);
      setMessages(d.messages || []);
    } catch (err) {
      console.warn('[MessagesScreen] failed to load messages:', err?.message);
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => { loadConvos(); }, []);

  const selectConvo = (c) => { setSelected(c); loadMessages(c); };

  const sendMsg = async () => {
    const body = input.trim();
    if (!body || sending || !selected) return;
    setSending(true);
    const opt = { _id: 'opt_' + Date.now(), senderId: user?._id, body, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, opt]);
    setInput('');
    try {
      await post('/dm/messages', { receiverId: selected.userId, body });
    } catch (err) {
      // Network error — queue for offline retry (keep optimistic message visible with pending indicator)
      const isNetErr = !err?.response && (err?.message?.includes('fetch') || err?.message?.includes('network') || err?.message?.includes('Network'));
      if (isNetErr) {
        const token = (await import('@react-native-async-storage/async-storage').then(m => m.default?.getItem?.('millo_token'))) || '';
        await enqueueDm({ toUserId: selected.userId, text: body, token })
          .catch((err) => console.warn('[MessagesScreen] offline queue failed:', err?.message));
        // Mark the optimistic message as queued
        setMessages((prev) => prev.map((m) => m._id === opt._id ? { ...m, queued: true } : m));
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== opt._id));
      }
    }
    setSending(false);
  };

  const s = styles(C);
  const myId = String(user?._id || '');

  if (selected) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.threadHeader}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={{ color: C.accent, fontSize: 15 }}>← {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={s.threadName}>{selected.displayName}</Text>
        </View>
        {loadingMsgs ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} size="large" />
          </View>
        ) : null}
        <FlatList
          data={loadingMsgs ? [] : messages}
          keyExtractor={(i) => String(i._id)}
          contentContainerStyle={s.msgs}
          ListEmptyComponent={
            !loadingMsgs ? (
              <Text style={{ textAlign: 'center', color: C.textMuted, marginTop: 40, fontSize: 13 }}>
                {t('messages.noMessages')}
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const fromMe = String(item.senderId) === myId;
            return (
              <View style={[s.bubble, fromMe ? s.bubbleMe : s.bubbleThem, item.queued && { opacity: 0.6 }]}>
                <Text style={[s.bubbleText, fromMe ? s.bubbleTextMe : s.bubbleTextThem]}>{item.body}</Text>
                {item.queued && (
                  <Text style={{ fontSize: 10, color: fromMe ? 'rgba(255,255,255,0.6)' : C.textMuted, marginTop: 2 }}>
                    {t('messages.queued')}
                  </Text>
                )}
              </View>
            );
          }}
        />
        <View style={s.inputBar}>
          <TextInput style={s.textInput} value={input} onChangeText={setInput}
            placeholder={t('messages.typeMessage')} placeholderTextColor={C.textMuted}
            onSubmitEditing={sendMsg} returnKeyType="send" />
          <TouchableOpacity onPress={sendMsg} disabled={!input.trim() || sending} style={s.sendBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('messages.send')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}><Text style={s.headerTitle}>{t('messages.title')}</Text></View>
      <ConversationList convos={convos} loading={loading} refresh={refresh}
        onRefresh={() => { setRefresh(true); loadConvos(true); }}
        onSelect={selectConvo}
        onCalls={() => navigation.navigate('Calls')}
        C={C} />
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  header:         { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: C.text },
  threadHeader:   { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  threadName:     { fontSize: 16, fontWeight: '700', color: C.text },
  msgs:           { padding: 16, gap: 8 },
  bubble:         { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 },
  bubbleMe:       { alignSelf: 'flex-end', backgroundColor: C.accent },
  bubbleThem:     { alignSelf: 'flex-start', backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
  bubbleText:     { fontSize: 14 },
  bubbleTextMe:   { color: '#fff' },
  bubbleTextThem: { color: C.text },
  inputBar:       { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.border },
  textInput:      { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.text, backgroundColor: C.bgCard },
  sendBtn:        { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
});
