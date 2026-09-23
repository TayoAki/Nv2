import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { type ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { errorMessage, isNetworkError, type StylistMessage } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { OutfitCard } from '@/components/stylist/OutfitCard';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Banner, StateView } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/IconButton';
import { GoldSwitch } from '@/components/ui/Toggle';
import { useSendStylistMessage, useStylistThread } from '@/data/stylist';
import { track } from '@/lib/analytics';
import { timeLabel } from '@/lib/format';
import { colors, fonts, radius, space } from '@/theme';

const STARTERS = [
  'Style my navy blazer for dinner.',
  'What should I wear to a wedding?',
  'A relaxed weekend look from my closet.',
];

/** 10 · AI stylist — /stylist */
export default function StylistScreen() {
  const params = useLocalSearchParams<{ prompt?: string; focusItemId?: string }>();
  const thread = useStylistThread();
  const send = useSendStylistMessage();
  const [text, setText] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [failed, setFailed] = useState<{ text: string; message: string; focusItemId?: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const handledPrompt = useRef<string | null>(null);

  const submit = (message: string, focusItemId?: string) => {
    const trimmed = message.trim();
    if (!trimmed || send.isPending) return;
    setFailed(null);
    setText('');
    track('stylist_request', { ownedOnly, focused: !!focusItemId });
    send.mutate(
      { text: trimmed, ownedOnly, focusItemId },
      { onError: (error) => setFailed({ text: trimmed, message: errorMessage(error), focusItemId }) },
    );
  };

  // "Style this piece" from the closet arrives with a prompt; send it once.
  const sendIncomingPrompt = useEffectEvent((prompt: string, focusItemId?: string) => {
    submit(prompt, focusItemId);
    router.setParams({ prompt: undefined, focusItemId: undefined });
  });
  const threadReady = !!thread.data;
  useEffect(() => {
    if (!params.prompt || !threadReady) return;
    const key = `${params.focusItemId ?? ''}:${params.prompt}`;
    if (handledPrompt.current === key) return;
    handledPrompt.current = key;
    sendIncomingPrompt(params.prompt, params.focusItemId);
  }, [params.prompt, params.focusItemId, threadReady]);

  const messages = thread.data?.messages ?? [];
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');

  // Follow the conversation as it grows, but open at the top so the title is visible.
  const shownCount = messages.length + (send.isPending ? 1 : 0) + (failed ? 1 : 0);
  const lastCount = useRef<number | null>(null);
  const onContentSizeChange = () => {
    if (!thread.data) return;
    if (lastCount.current !== null && shownCount > lastCount.current) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
    lastCount.current = shownCount;
  };

  const footer = (
    <View style={styles.footer}>
      {/* Wraps onto two lines on narrow phones instead of clipping. */}
      <View style={styles.controls}>
        <Chip label="More relaxed" onPress={() => submit('More relaxed')} disabled={send.isPending} style={styles.followUp} />
        <Chip label="Dress it up" onPress={() => submit('Dress it up')} disabled={send.isPending} style={styles.followUp} />
        <View style={styles.owned}>
          <AppText variant="secondary" numberOfLines={1}>
            Owned items only
          </AppText>
          <GoldSwitch value={ownedOnly} onValueChange={setOwnedOnly} accessibilityLabel="Owned items only" />
        </View>
      </View>
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask your stylist..."
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={() => submit(text)}
          accessibilityLabel="Message your stylist"
          maxLength={500}
        />
        <IconButton
          icon="send"
          variant="ink"
          size={52}
          iconSize={22}
          accessibilityLabel="Send"
          disabled={!text.trim() || send.isPending}
          onPress={() => submit(text)}
        />
      </View>
    </View>
  );

  return (
    <Screen
      header={
        <AppHeader
          right={<IconButton icon="settings" accessibilityLabel="Style preferences" iconSize={26} onPress={() => router.push('/style-profile')} />}
        />
      }
      footer={footer}
      scrollRef={scrollRef}
      onContentSizeChange={onContentSizeChange}>
      <AppText variant="display" accessibilityRole="header">
        Nyoni stylist
      </AppText>
      <AppText variant="bodyLarge" color={colors.muted}>
        Your personal AI styling assistant
      </AppText>

      <View style={styles.thread} accessibilityLiveRegion="polite">
        {thread.isPending ? (
          <StateView compact kind="loading" title="Loading your conversation" />
        ) : thread.isError ? (
          <StateView
            compact
            kind={isNetworkError(thread.error) ? 'offline' : 'error'}
            actionLabel="Try again"
            onAction={() => thread.refetch()}
          />
        ) : messages.length === 0 ? (
          <View style={styles.intro}>
            <AppText variant="body" color={colors.muted}>
              Ask for a look for any occasion. I&apos;ll use pieces from your closet and explain why they work.
            </AppText>
            <View style={styles.starters}>
              {STARTERS.map((starter) => (
                <Chip key={starter} label={starter} onPress={() => submit(starter)} style={styles.starter} />
              ))}
            </View>
          </View>
        ) : (
          messages.map((message, index) =>
            message.role === 'user' ? (
              <UserBubble key={message.id} message={message} showTime={index === lastUserIndex} />
            ) : (
              <AssistantMessage key={message.id} message={message} />
            ),
          )
        )}

        {send.isPending ? (
          <View style={styles.assistantRow}>
            <Avatar />
            <View style={[styles.bubble, styles.assistantBubble]}>
              <AppText variant="body" color={colors.muted}>
                Putting a look together…
              </AppText>
            </View>
          </View>
        ) : null}

        {failed ? (
          <Banner
            tone="error"
            title="Your stylist is unavailable right now"
            message={failed.message}
            actionLabel="Try again"
            onAction={() => submit(failed.text, failed.focusItemId)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Avatar() {
  return (
    <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AppText variant="heading" color={colors.ivory} style={styles.avatarText}>
        NC
      </AppText>
    </View>
  );
}

function UserBubble({ message, showTime }: { message: StylistMessage; showTime: boolean }) {
  return (
    <View style={styles.userWrap}>
      <View style={[styles.bubble, styles.userBubble]} accessibilityLabel={`You said: ${message.text}`}>
        <AppText variant="bodyLarge">{message.text}</AppText>
      </View>
      {showTime ? (
        <AppText variant="caption" color={colors.muted}>
          {timeLabel(message.createdAt)}
        </AppText>
      ) : null}
    </View>
  );
}

function AssistantMessage({ message }: { message: StylistMessage }) {
  return (
    <View style={styles.assistant}>
      <View style={styles.assistantRow}>
        <Avatar />
        <View style={[styles.bubble, styles.assistantBubble]} accessibilityLabel={`Stylist: ${message.text}`}>
          <AppText variant="bodyLarge">{message.text}</AppText>
        </View>
      </View>
      {message.outfitId ? <OutfitCard outfitId={message.outfitId} /> : null}
      {message.status === 'sparse_closet' ? (
        <Button title="Add clothes" variant="outline" size="sm" fullWidth={false} onPress={() => router.navigate('/closet')} style={styles.inlineAction} />
      ) : null}
      {message.suggestedProductId ? (
        <Button
          title="View in shop"
          variant="outline"
          size="sm"
          fullWidth={false}
          trailingIcon="arrowRight"
          onPress={() => router.push(`/product/${message.suggestedProductId}`)}
          style={styles.inlineAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: {
    gap: space.md,
    marginTop: space.lg,
  },
  intro: {
    gap: space.md,
  },
  starters: {
    gap: space.xs,
    alignItems: 'flex-start',
  },
  starter: {
    alignSelf: 'flex-start',
  },
  userWrap: {
    alignItems: 'flex-end',
    gap: space.xxs,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxWidth: '86%',
  },
  userBubble: {
    backgroundColor: colors.surfaceSunken,
  },
  assistant: {
    gap: space.sm,
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceSunken,
    flexShrink: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 22,
  },
  inlineAction: {
    alignSelf: 'flex-start',
  },
  footer: {
    gap: space.sm,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  followUp: {
    paddingHorizontal: space.sm + 2,
  },
  owned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginLeft: 'auto',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  input: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    fontFamily: fonts.sans,
    fontSize: 17,
    color: colors.ink,
  },
});
