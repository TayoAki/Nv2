import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { colors, controlHeight, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Sheet } from './Sheet';

export type SelectOption<T extends string> = { value: T; label: string; description?: string };

type Props<T extends string> = {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** `inline` puts the label to the left of the control, as on the import review screen. */
  layout?: 'inline' | 'stacked';
  /** Highlight fields the AI was unsure about. */
  flagged?: boolean;
  sheetTitle?: string;
  style?: StyleProp<ViewStyle>;
};

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose',
  layout = 'stacked',
  flagged = false,
  sheetTitle,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={[layout === 'inline' ? styles.inline : styles.stacked, style]}>
      <AppText variant="body" style={layout === 'inline' ? styles.inlineLabel : null}>
        {label}
      </AppText>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityHint="Opens a list of options"
        style={({ pressed }) => [
          styles.control,
          flagged && styles.flagged,
          layout === 'inline' && styles.inlineControl,
          pressed && styles.pressed,
        ]}>
        <AppText
          variant="bodyLarge"
          color={selected ? colors.ink : colors.muted}
          numberOfLines={1}
          style={styles.valueText}>
          {selected?.label ?? placeholder}
        </AppText>
        <Icon name="chevronDown" size={20} color={colors.ink} />
      </Pressable>

      <OptionSheet
        visible={open}
        title={sheetTitle ?? label}
        options={options}
        value={value}
        onClose={() => setOpen(false)}
        onSelect={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </View>
  );
}

type OptionSheetProps<T extends string> = {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SelectOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
  emptyMessage?: string;
};

export function OptionSheet<T extends string>({
  visible,
  title,
  subtitle,
  options,
  value,
  onSelect,
  onClose,
  emptyMessage,
}: OptionSheetProps<T>) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {options.length === 0 && emptyMessage ? (
        <AppText variant="body" color={colors.muted} style={styles.empty}>
          {emptyMessage}
        </AppText>
      ) : null}
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
            <View style={styles.optionText}>
              <AppText variant="bodyLarge">{option.label}</AppText>
              {option.description ? (
                <AppText variant="secondary" color={colors.muted}>
                  {option.description}
                </AppText>
              ) : null}
            </View>
            {isSelected ? <Icon name="check" size={22} color={colors.bronze} strokeWidth={2} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stacked: {
    gap: space.xs,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  inlineLabel: {
    width: 116,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: controlHeight.button - 4,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inlineControl: {
    flex: 1,
  },
  flagged: {
    borderColor: colors.champagne,
    borderWidth: 1.5,
    backgroundColor: colors.noticeBg,
  },
  valueText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: space.md,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  empty: {
    paddingVertical: space.lg,
  },
});
