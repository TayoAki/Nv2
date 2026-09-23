import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, radius, space } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Bottom sheet built on React Native's Modal so it works on iOS, Android and web. */
export function Sheet({ visible, onClose, title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <AppText variant="heading" accessibilityRole="header">
                  {title}
                </AppText>
                {subtitle ? (
                  <AppText variant="secondary" color={colors.muted}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
              <IconButton icon="close" accessibilityLabel="Close" onPress={onClose} size={40} />
            </View>
          ) : null}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.ivory,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.xs,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: gutter,
    paddingRight: space.xs,
    gap: space.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.xs,
    gap: space.sm,
  },
});
