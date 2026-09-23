import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type WardrobeCategory, type WardrobeItem } from '@/api';
import { COLOR_OPTIONS, PATTERN_OPTIONS } from '@/api/mock/fixtures';
import { ownershipLabel } from '@/components/closet/ClosetItemCard';
import { AppHeader, goBack } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Banner, StateView } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { SelectField } from '@/components/ui/SelectField';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { ToggleRow } from '@/components/ui/Toggle';
import { useDeleteWardrobeItem, useUpdateWardrobeItem, useWardrobeItem } from '@/data/closet';
import { confirm, notify } from '@/lib/confirm';
import { pluralize } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

const CATEGORY_OPTIONS: { value: WardrobeCategory; label: string }[] = [
  { value: 'jackets', label: 'Jacket' },
  { value: 'shirts', label: 'Shirt' },
  { value: 'knitwear', label: 'Knitwear' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'accessories', label: 'Accessory' },
];

const categoryLabel = (category: WardrobeCategory) => CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;

/** 09 · Closet item detail — /closet/items/:id */
export default function ClosetItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: item, isPending, isError, error, refetch } = useWardrobeItem(id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const header = (
    <AppHeader
      left="back"
      fallbackHref="/closet"
      right={item ? <IconButton icon="moreVertical" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} /> : null}
    />
  );

  if (isPending) {
    return (
      <Screen header={header}>
        <StateView kind="loading" title="Opening your piece" />
      </Screen>
    );
  }
  if (isError || !item) {
    const missing = isApiError(error) && error.code === 'not_found';
    return (
      <Screen header={header}>
        <StateView
          kind={isNetworkError(error) ? 'offline' : missing ? 'empty' : 'error'}
          title={missing ? 'This item is no longer in your closet' : undefined}
          actionLabel={missing ? 'Back to closet' : 'Try again'}
          onAction={missing ? () => goBack('/closet') : () => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <ItemDetails item={item} onEdit={() => setEditOpen(true)} />
      <ItemMenu item={item} visible={menuOpen} onClose={() => setMenuOpen(false)} onEdit={() => setEditOpen(true)} />
      <EditSheet item={item} visible={editOpen} onClose={() => setEditOpen(false)} />
    </Screen>
  );
}

function ItemDetails({ item, onEdit }: { item: WardrobeItem; onEdit: () => void }) {
  const update = useUpdateWardrobeItem();
  const remove = useDeleteWardrobeItem();
  const [field, setField] = useState<'size' | 'brand' | null>(null);

  const patch = (changes: Parameters<typeof update.mutate>[0]['patch'], message?: string) =>
    update.mutate(
      { id: item.id, patch: changes },
      {
        onSuccess: () => message && showToast(message),
        onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
      },
    );

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      message: 'The piece and its photos are removed from your closet. Saved outfits that use it will ask you to swap it.',
      confirmLabel: 'Delete item',
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(item.id, {
      onSuccess: ({ affectedOutfitIds }) => {
        showToast(
          affectedOutfitIds.length > 0
            ? `Deleted. ${pluralize(affectedOutfitIds.length, 'outfit')} will ask for a replacement.`
            : 'Deleted from your closet',
        );
        goBack('/closet');
      },
      onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
    });
  };

  const tryOn = () => {
    if (!item.tryOnEligible) {
      notify(
        "This piece can't be previewed yet",
        'Try-on supports jackets, shirts, knitwear and trousers. Shoes and accessories stay in outfit collages.',
      );
      return;
    }
    router.push({ pathname: '/photo', params: { closetItemId: item.id } });
  };

  const ready = item.availability === 'ready';

  return (
    <View style={styles.body}>
      <GarmentImage
        image={item.image}
        kind={item.kind}
        colorHex={item.color?.hex}
        aspectRatio={1.1}
        illustrationScale={0.78}
        bare={!item.image}
        accessibilityLabel={item.name}>
        <Badge label={ownershipLabel(item)} tone="neutral" size="md" style={styles.ownedBadge} />
      </GarmentImage>

      <AppText variant="display" accessibilityRole="header">
        {item.name}
      </AppText>
      <View style={styles.tags}>
        <Chip label={categoryLabel(item.category)} onPress={onEdit} style={styles.tag} />
        <Chip label={item.color?.name ?? 'Add color'} onPress={onEdit} style={styles.tag} />
        <Chip label={item.pattern ?? 'Add pattern'} onPress={onEdit} style={styles.tag} />
      </View>

      {item.ownership === 'ordered' ? (
        <Banner
          tone="info"
          icon="package"
          title="Ordered from Nyoni"
          message="This piece is on its way. Mark it as received when it arrives to add it to outfit suggestions."
          actionLabel="Mark as received"
          onAction={() => patch({ ownership: 'owned' }, 'Marked as owned')}
        />
      ) : null}

      <Divider />
      <ToggleRow
        label="Availability"
        labelVariant="body"
        value={ready}
        stateLabel={ready ? 'Ready to wear' : 'In laundry / unavailable'}
        accessibilityLabel={ready ? 'Ready to wear' : 'Unavailable'}
        onValueChange={(value) => patch({ availability: value ? 'ready' : 'unavailable' })}
        description={ready ? undefined : "Unavailable pieces aren't used in outfit suggestions."}
      />
      <Divider />
      <ListRow title="Size" value={item.size ?? 'Not added'} onPress={() => setField('size')} />
      <Divider />
      <ListRow title="Brand" value={item.brand ?? 'Not added'} onPress={() => setField('brand')} />
      <Divider />

      <View style={styles.actions}>
        <Button
          title="Style this piece"
          variant="gold"
          onPress={() =>
            router.navigate({
              pathname: '/stylist',
              params: { focusItemId: item.id, prompt: `Style my ${item.name.toLowerCase()}.` },
            })
          }
        />
        <Button title="Try this piece on" variant="outline" onPress={tryOn} />
        <View style={styles.inlineActions}>
          <Button title="Edit" icon="moreHorizontal" variant="link" tone="ink" onPress={onEdit} />
          <View style={styles.inlineDivider} />
          <Button
            title={item.archived ? 'Restore' : 'Archive'}
            icon="archive"
            variant="link"
            tone="ink"
            onPress={() => patch({ archived: !item.archived }, item.archived ? 'Restored to your closet' : 'Archived')}
          />
        </View>
        <Divider />
        <Button title="Delete item" icon="trash" variant="destructive" onPress={onDelete} loading={remove.isPending} />
      </View>

      <TextPromptSheet
        visible={field !== null}
        title={field === 'size' ? 'Size' : 'Brand'}
        initialValue={(field === 'size' ? item.size : item.brand) ?? ''}
        placeholder={field === 'size' ? 'e.g. 42 US / 52 EU' : 'e.g. Nyoni Couture'}
        onClose={() => setField(null)}
        onSave={(value) => {
          if (field === 'size') patch({ size: value || null }, 'Size saved');
          if (field === 'brand') patch({ brand: value || null }, 'Brand saved');
          setField(null);
        }}
      />
    </View>
  );
}

function ItemMenu({
  item,
  visible,
  onClose,
  onEdit,
}: {
  item: WardrobeItem;
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const update = useUpdateWardrobeItem();
  return (
    <Sheet visible={visible} onClose={onClose} title={item.name}>
      <ListRow
        icon="sliders"
        title="Edit details"
        onPress={() => {
          onClose();
          onEdit();
        }}
      />
      <ListRow
        icon="archive"
        title={item.archived ? 'Restore from archive' : 'Archive'}
        subtitle="Archived pieces are hidden and not used in outfits"
        onPress={() => {
          onClose();
          update.mutate({ id: item.id, patch: { archived: !item.archived } }, { onSuccess: () => showToast(item.archived ? 'Restored' : 'Archived') });
        }}
      />
    </Sheet>
  );
}

function EditSheet({ item, visible, onClose }: { item: WardrobeItem; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Edit details" subtitle="Your edits are kept even if suggestions change.">
      {visible ? <EditBody key={item.updatedAt} item={item} onDone={onClose} /> : null}
    </Sheet>
  );
}

function EditBody({ item, onDone }: { item: WardrobeItem; onDone: () => void }) {
  const update = useUpdateWardrobeItem();
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<WardrobeCategory>(item.category);
  const [color, setColor] = useState<string | null>(item.color?.name ?? null);
  const [pattern, setPattern] = useState<string | null>(item.pattern);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    update.mutate(
      {
        id: item.id,
        patch: {
          name,
          category,
          color: COLOR_OPTIONS.find((c) => c.name === color) ?? item.color,
          pattern,
        },
      },
      {
        onSuccess: () => {
          showToast('Details saved');
          onDone();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <View style={styles.editFields}>
      <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" error={error} />
      <SelectField label="Category" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
      <SelectField
        label="Color"
        value={color}
        placeholder="Not added"
        options={COLOR_OPTIONS.map((c) => ({ value: c.name, label: c.name }))}
        onChange={setColor}
      />
      <SelectField
        label="Pattern"
        value={pattern}
        placeholder="Not added"
        options={PATTERN_OPTIONS.map((p) => ({ value: p, label: p }))}
        onChange={setPattern}
      />
      <Button title="Save details" onPress={save} loading={update.isPending} />
    </View>
  );
}

function TextPromptSheet({
  visible,
  title,
  initialValue,
  placeholder,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {visible ? <TextPromptBody key={title} initialValue={initialValue} placeholder={placeholder} onSave={onSave} /> : null}
    </Sheet>
  );
}

function TextPromptBody({
  initialValue,
  placeholder,
  onSave,
}: {
  initialValue: string;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <View style={styles.editFields}>
      <TextField value={value} onChangeText={setValue} placeholder={placeholder} autoFocus onSubmitEditing={() => onSave(value.trim())} />
      <Button title="Save" onPress={() => onSave(value.trim())} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
  ownedBadge: {
    position: 'absolute',
    top: space.sm,
    left: space.xs,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  tag: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.surfaceSunken,
  },
  actions: {
    gap: space.sm,
    marginTop: space.xs,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    minHeight: 48,
  },
  inlineDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.hairline,
  },
  editFields: {
    gap: space.md,
  },
});
