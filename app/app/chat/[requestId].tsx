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
import { Button, Sheet, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  cancelReportBlock,
  loadChatForRequest,
  loadMessages,
  loadParticipantNames,
  sendPhoto,
  sendText,
  type Message,
} from '@/lib/chat/chat';
import { pickChatPhoto, uploadChatPhoto } from '@/lib/photo/chatPhoto';
import { loadMatchForRequest, type MatchDetails } from '@/lib/help/matching';
import { useRealtime } from '@/lib/realtime';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Chat() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { requestId } = useLocalSearchParams<{ requestId: string }>();

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingPhoto, setSendingPhoto] = useState(false);

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);

  const refreshMessages = useCallback(async (cid: string) => {
    setMessages(await loadMessages(cid));
  }, []);

  const load = useCallback(async () => {
    if (!requestId) return;
    const [m, chat] = await Promise.all([
      loadMatchForRequest(requestId),
      loadChatForRequest(requestId),
    ]);
    setMatch(m);
    setChatId(chat?.id ?? null);
    // No chat row (e.g. an older match from before chats existed), a closed
    // chat, or a finished/cancelled match → the conversation is not open.
    setClosed(
      !chat || !!chat.closed_at || !m || m.status === 'cancelled' || m.status === 'completed',
    );
    if (chat?.id) {
      await refreshMessages(chat.id);
      setNames(await loadParticipantNames(chat.id));
    }
    setLoading(false);
  }, [requestId, refreshMessages]);

  const isGroup = Object.keys(names).length > 2;

  useEffect(() => {
    load();
  }, [load]);

  // Live messages.
  useRealtime(
    chatId ? `chat-${chatId}` : null,
    [{ table: 'messages', filter: `chat_id=eq.${chatId}`, event: 'INSERT' }],
    () => {
      if (chatId) refreshMessages(chatId);
    },
  );

  async function onSend() {
    const body = draft.trim();
    if (!body || !chatId || !myId) return;
    setSending(true);
    setDraft('');
    try {
      await sendText(chatId, myId, body);
      await refreshMessages(chatId);
    } catch {
      setDraft(body); // restore on failure
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
      await refreshMessages(chatId);
    } catch {
      Alert.alert('Photo not sent', 'Please try again.');
    } finally {
      setSendingPhoto(false);
    }
  }

  async function onReportBlock() {
    if (!match) return;
    setReporting(true);
    try {
      await cancelReportBlock(match.id, reason);
      track('cancel_report_block');
      setSafetyOpen(false);
      Alert.alert(
        'Done',
        'The match was ended, this person was blocked, and our team was notified. You will not be matched with them again.',
      );
      router.replace('/(main)');
    } catch {
      Alert.alert('Could not complete', 'Please try again in a moment.');
    } finally {
      setReporting(false);
    }
  }

  const otherName = match?.other_name ?? 'Your neighbour';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.surfaceEdge }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading" weight="bold" numberOfLines={1} style={styles.headerTitle}>
          {otherName}
        </Text>
        <Pressable onPress={() => setSafetyOpen(true)} hitSlop={12} accessibilityLabel="Safety options">
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
            ListHeaderComponent={
              <Text variant="small" tone="faint" center style={styles.intro}>
                This chat is just for coordinating your meet-up. It closes when
                the help is done.
              </Text>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === myId;
              return (
                <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                  <View style={styles.bubbleWrap}>
                    {!mine && isGroup ? (
                      <Text variant="small" weight="semibold" tone="accent" style={styles.senderName}>
                        {names[item.sender_id] ?? 'Neighbour'}
                      </Text>
                    ) : null}
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
                      ) : (
                        <Text variant="body" tone={mine ? 'onAccent' : 'primary'}>
                          {item.type === 'text' ? item.body : '📎 Attachment'}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />

          {closed ? (
            <View style={[styles.closedBar, { backgroundColor: colors.surface, borderTopColor: colors.surfaceEdge }]}>
              <Text variant="small" tone="faint" center>
                This conversation has ended.
              </Text>
            </View>
          ) : (
            <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.surfaceEdge }]}>
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
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                placeholder="Message"
                placeholderTextColor={colors.textFaint}
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!sending}
              />
              <Pressable
                onPress={onSend}
                disabled={!draft.trim() || sending}
                style={[styles.sendBtn, { backgroundColor: draft.trim() ? colors.accent : colors.surfaceEdge }]}
                accessibilityLabel="Send"
              >
                <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      <Sheet visible={safetyOpen} onClose={() => setSafetyOpen(false)} title="Something wrong?">
        <Text variant="body" tone="secondary">
          If you feel unsafe or this person is behaving badly, you can end this
          match now. They&apos;ll be blocked, our team will review the chat, and
          your request will look for someone else. You won&apos;t be matched with
          them again.
        </Text>
        <TextField
          label="What happened? (optional)"
          placeholder="Briefly, so our team can help"
          value={reason}
          onChangeText={setReason}
          multiline
          editable={!reporting}
          style={styles.reasonInput}
        />
        <Button
          label="End, report & block"
          variant="secondary"
          onPress={onReportBlock}
          busy={reporting}
        />
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
  intro: { paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  bubbleRow: { marginVertical: spacing.xs, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubbleWrap: { maxWidth: '80%' },
  senderName: { marginLeft: spacing.md, marginBottom: 2 },
  bubble: {
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
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedBar: { padding: spacing.lg, borderTopWidth: 1 },
  reasonInput: { minHeight: 72, textAlignVertical: 'top' },
});
