import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoBubble } from '@/components/chat/PhotoBubble';
import { VoiceBubble } from '@/components/chat/VoiceBubble';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { Button, Sheet, Text, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { loadMessages, sendPhoto, sendText, sendVoice, type Message } from '@/lib/chat/chat';
import { pickChatPhoto, uploadChatPhoto } from '@/lib/photo/chatPhoto';
import { uploadChatVoice } from '@/lib/photo/chatVoice';
import {
  blockConnection,
  disconnectConnection,
  loadInboxThread,
  markChatRead,
  setNickname,
  threadName,
  type InboxThread,
} from '@/lib/inbox';
import { useRealtime } from '@/lib/realtime';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function InboxChat() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { otherId } = useLocalSearchParams<{ otherId: string }>();

  const [thread, setThread] = useState<InboxThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);
  const chatId = thread?.chat_id ?? null;
  const frozen = thread?.connection_status === 'disconnected' || !!thread?.closed_at;
  // No chat row behind this thread yet — don't present a dead input box.
  const unavailable = !loading && !chatId;

  const load = useCallback(async () => {
    if (!otherId) return;
    const t = await loadInboxThread(otherId);
    setThread(t);
    setNick(t?.nickname ?? '');
    if (t?.chat_id) {
      setMessages(await loadMessages(t.chat_id));
      markChatRead(t.chat_id);
    }
    setLoading(false);
  }, [otherId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    chatId ? `inbox-chat-${chatId}` : null,
    [{ table: 'messages', filter: `chat_id=eq.${chatId}`, event: 'INSERT' }],
    () => {
      if (chatId) {
        loadMessages(chatId).then(setMessages);
        markChatRead(chatId);
      }
    },
  );

  async function onSend() {
    const body = draft.trim();
    if (!body || !chatId || !myId) return;
    setSending(true);
    setDraft('');
    try {
      await sendText(chatId, myId, body);
      setMessages(await loadMessages(chatId));
    } catch {
      setDraft(body);
      Alert.alert('Message not sent', 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  function onAttach() {
    Alert.alert('Send a photo', undefined, [
      { text: 'Take photo', onPress: () => sendPickedPhoto(true) },
      { text: 'Choose from library', onPress: () => sendPickedPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function sendPickedPhoto(fromCamera: boolean) {
    if (!chatId || !myId) return;
    const base64 = await pickChatPhoto(fromCamera);
    if (!base64) return;
    setSendingPhoto(true);
    try {
      const path = await uploadChatPhoto(chatId, base64);
      await sendPhoto(chatId, myId, path);
      setMessages(await loadMessages(chatId));
    } catch {
      Alert.alert('Photo not sent', 'Please try again.');
    } finally {
      setSendingPhoto(false);
    }
  }

  async function onSendVoice(localUri: string, seconds: number) {
    if (!chatId || !myId) return;
    const path = await uploadChatVoice(chatId, localUri);
    await sendVoice(chatId, myId, path, seconds);
    setMessages(await loadMessages(chatId));
  }

  async function onSaveNickname() {
    if (!otherId) return;
    setBusy(true);
    try {
      await setNickname(otherId, nick);
      setMenuOpen(false);
      await load();
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function onDisconnect() {
    Alert.alert(
      'Disconnect?',
      'The conversation stays visible but frozen. They are not told.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (!otherId) return;
            await disconnectConnection(otherId);
            setMenuOpen(false);
            router.replace('/(main)/inbox');
          },
        },
      ],
    );
  }

  function onBlock() {
    Alert.alert(
      'Block this person?',
      'They will be blocked and you will never be matched again. The thread freezes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!otherId) return;
            await blockConnection(otherId);
            setMenuOpen(false);
            router.replace('/(main)/inbox');
          },
        },
      ],
    );
  }

  const name = thread ? threadName(thread) : '';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.surfaceEdge }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading" weight="bold" numberOfLines={1} style={styles.headerTitle}>
          {name}
        </Text>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Conversation options">
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          keyboardVerticalOffset={8}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const mine = item.sender_id === myId;
              return (
                <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                  <View
                    style={[
                      styles.bubble,
                      item.type === 'photo' && styles.bubblePhoto,
                      mine
                        ? { backgroundColor: colors.accent, borderBottomRightRadius: 4 }
                        : { backgroundColor: colors.surface, borderColor: colors.surfaceEdge, borderWidth: 1, borderBottomLeftRadius: 4 },
                    ]}
                  >
                    {item.type === 'photo' ? (
                      <PhotoBubble url={item.media_signed_url ?? null} />
                    ) : item.type === 'voice' ? (
                      <VoiceBubble
                        url={item.media_signed_url ?? null}
                        mine={mine}
                        durationHint={item.body ? Number(item.body) : null}
                      />
                    ) : (
                      <Text variant="body" tone={mine ? 'onAccent' : 'primary'}>
                        {item.type === 'text' ? item.body : '📎 Attachment'}
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
          />

          {frozen || unavailable ? (
            <View style={[styles.closedBar, { backgroundColor: colors.surface, borderTopColor: colors.surfaceEdge }]}>
              <Text variant="small" tone="faint" center>
                {frozen ? 'This conversation is frozen.' : 'This conversation isn’t ready yet.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.surfaceEdge }]}>
              {!recordingVoice && (
                <Pressable
                  onPress={onAttach}
                  disabled={sendingPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Send a photo"
                  style={styles.attachBtn}
                >
                  {sendingPhoto ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons name="image-outline" size={26} color={colors.textSecondary} />
                  )}
                </Pressable>
              )}
              {!recordingVoice && (
                <TextInput
                  style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                  placeholder="Message"
                  placeholderTextColor={colors.textFaint}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  editable={!sending}
                />
              )}
              <VoiceRecorder
                disabled={sending || sendingPhoto}
                onRecordingChange={setRecordingVoice}
                onSend={onSendVoice}
              />
              {!recordingVoice && (
                <Pressable
                  onPress={onSend}
                  disabled={!draft.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  style={[styles.sendBtn, { backgroundColor: draft.trim() ? colors.accent : colors.surfaceEdge }]}
                >
                  <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
                </Pressable>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={name}>
        <TextField
          label="Nickname (only you see it)"
          placeholder={thread?.other_name ?? 'Their name'}
          value={nick}
          onChangeText={setNick}
          editable={!busy}
        />
        <Button label="Save nickname" onPress={onSaveNickname} busy={busy} />
        <Button label="Disconnect" variant="secondary" onPress={onDisconnect} disabled={busy} />
        <Pressable onPress={onBlock} hitSlop={8} style={styles.blockLink} disabled={busy}>
          <Text variant="label" weight="semibold" center style={{ color: colors.danger }}>
            Block
          </Text>
        </Pressable>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  bubbleRow: { marginVertical: spacing.xs, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubblePhoto: { paddingHorizontal: 4, paddingVertical: 4 },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  closedBar: { padding: spacing.lg, borderTopWidth: 1 },
  blockLink: { paddingVertical: spacing.sm },
});
