import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, controlHeight, fonts, radius, space } from '@/theme';

import { AppText } from './AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  prefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  hint,
  error,
  icon,
  prefix,
  containerStyle,
  onFocus,
  onBlur,
  editable = true,
  ...inputProps
}: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.ink : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View
        style={[
          styles.field,
          { borderColor },
          !editable && styles.disabled,
        ]}>
        {icon ? <Icon name={icon} size={22} color={colors.muted} /> : null}
        {prefix ? (
          <AppText variant="bodyLarge" color={colors.ink}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          {...inputProps}
          editable={editable}
          accessibilityLabel={inputProps.accessibilityLabel ?? label ?? inputProps.placeholder}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.muted}
          selectionColor={colors.bronze}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={styles.input}
        />
      </View>
      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Icon name="alert" size={16} color={colors.error} />
          <AppText variant="secondary" color={colors.error} style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : hint ? (
        <AppText variant="secondary" color={colors.muted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: controlHeight.button,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: fonts.sans,
    fontSize: 17,
    color: colors.ink,
    paddingVertical: space.sm,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs + 2,
  },
  flex: {
    flex: 1,
  },
});
