import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  errorMessage,
  type ColorInfo,
  type ImportDraft,
  type WardrobeCategory,
  type WardrobeImport,
} from '@/api';
import { COLOR_OPTIONS, PATTERN_OPTIONS } from '@/api/mock/fixtures';
import { Icon } from '@/components/icons/Icon';
import { AppHeader, goBack } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { SelectField } from '@/components/ui/SelectField';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import {
  useAddImportPhoto,
  useConfirmImportDraft,
  useCreateWardrobeImport,
  useDiscardImportDraft,
  useWardrobe,
  useWardrobeImport,
} from '@/data/closet';
import { track } from '@/lib/analytics';
import { pluralize } from '@/lib/format';
import { explainDeniedPermission, pickFromLibrary } from '@/lib/photos';
import { showToast } from '@/state/toast';
import { usePendingImport } from '@/state/tryOnSession';
import { colors, radius, space } from '@/theme';

const CATEGORY_OPTIONS: { value: WardrobeCategory; label: string }[] = [
  { value: 'jackets', label: 'Jacket' },
  { value: 'waistcoats', label: 'Waistcoat' },
  { value: 'shirts', label: 'Shirt' },
  { value: 'knitwear', label: 'Knitwear' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'accessories', label: 'Accessory' },
];

const CATEGORY_NOUN: Record<WardrobeCategory, string> = {
  jackets: 'Jacket',
  waistcoats: 'Waistcoat',
  shirts: 'Shirt',
  knitwear: 'Knit',
  trousers: 'Trousers',
  shoes: 'Shoes',
  accessories: 'Accessory',
};

/** 08 · Review imported clothes — /closet/import. Focused step with back, no tab bar. */
export default function ClosetImportScreen() {
  const pendingPhotos = usePendingImport((state) => state.photos);
  const pendingManual = usePendingImport((state) => state.manual);
  const clearPending = usePendingImport((state) => state.clearPending);
  const create = useCreateWardrobeImport();
  const [importId, setImportId] = useState<string | null>(null);
  const imp = useWardrobeImport(importId ?? undefined);

  // Start the import once with the photos the shopper chose on the closet screen.
  const hasPending = pendingPhotos.length > 0 || pendingManual;
  const { mutate: createImport, isIdle } = create;
  useEffect(() => {
    if (!hasPending || !isIdle) return;
    createImport(
      { photos: pendingPhotos, manual: pendingManual },
      {
        onSuccess: (created) => {
          setImportId(created.id);
          clearPending();
        },
      },
    );
  }, [hasPending, isIdle, createImport, pendingPhotos, pendingManual, clearPending]);

  const header = (
    <AppHeader
      left="back"
      fallbackHref="/closet"
      title="Review your clothes"
      subtitle="AI suggestions — check before saving"
    />
  );

  if (!importId) {
    if (create.isError) {
      return (
        <Screen header={header} bottomInset>
          <StateView
            kind="error"
            title="We couldn't check your photos"
            message={errorMessage(create.error)}
            actionLabel="Try again"
            onAction={() => create.reset()}
            secondaryLabel="Back to closet"
            onSecondary={() => goBack('/closet')}
          />
        </Screen>
      );
    }
    if (!hasPending && create.isIdle) {
      return (
        <Screen header={header} bottomInset>
          <StateView
            kind="empty"
            icon="images"
            title="No photos to review"
            message="Add clothes from your closet to start."
            actionLabel="Back to closet"
            onAction={() => goBack('/closet')}
          />
        </Screen>
      );
    }
    return (
      <Screen header={header} bottomInset>
        <StateView
          kind="loading"
          title={pendingManual ? 'Preparing your item' : 'Checking your photos'}
          message="Finding each garment, cutting it out and reading its colours. This can take a minute or two."
        />
      </Screen>
    );
  }

  if (!imp.data) {
    return (
      <Screen header={header} bottomInset>
        {imp.isError ? (
          <StateView kind="error" message={errorMessage(imp.error)} actionLabel="Try again" onAction={() => imp.refetch()} />
        ) : (
          <StateView kind="loading" title="Checking your photos" />
        )}
      </Screen>
    );
  }

  return <Review header={header} imp={imp.data} />;
}

function Review({ header, imp }: { header: React.ReactNode; imp: WardrobeImport }) {
  const ready = imp.drafts.filter((d) => d.status === 'ready');
  const saved = imp.drafts.filter((d) => d.status === 'saved');
  const draft = ready[0];

  if (!draft) {
    if (saved.length > 0) {
      return (
        <Screen header={header} bottomInset>
          <StateView
            kind="empty"
            icon="checkCircle"
            title={`${pluralize(saved.length, 'piece')} saved to your closet`}
            actionLabel="Back to closet"
            onAction={() => goBack('/closet')}
          />
        </Screen>
      );
    }
    if (imp.drafts.some((d) => d.status === 'discarded')) {
      return (
        <Screen header={header} bottomInset>
          <StateView
            kind="empty"
            icon="closet"
            title="Nothing new was saved"
            message="You skipped every item in this batch."
            actionLabel="Back to closet"
            onAction={() => goBack('/closet')}
          />
        </Screen>
      );
    }
    return (
      <Screen header={header} bottomInset>
        <StateView
          kind="error"
          title="We couldn't read these photos"
          message="Try clearer photos of one garment at a time, or add the piece yourself."
          actionLabel="Back to closet"
          onAction={() => goBack('/closet')}
        />
      </Screen>
    );
  }

  // Keyed by draft so each item starts from its own suggestions.
  return <DraftReview key={draft.id} header={header} imp={imp} draft={draft} readyCount={ready.length} />;
}

function DraftReview({
  header,
  imp,
  draft,
  readyCount,
}: {
  header: React.ReactNode;
  imp: WardrobeImport;
  draft: ImportDraft;
  readyCount: number;
}) {
  const wardrobe = useWardrobe();
  const confirmDraft = useConfirmImportDraft();
  const discard = useDiscardImportDraft();
  const addPhoto = useAddImportPhoto();

  const [category, setCategory] = useState<WardrobeCategory | null>(draft.suggestion.category);
  const [color, setColor] = useState<ColorInfo | null>(draft.suggestion.color);
  const [pattern, setPattern] = useState<string | null>(draft.suggestion.pattern);
  const [bestIndex, setBestIndex] = useState(draft.bestPhotoIndex);
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [name, setName] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicate = wardrobe.data?.find((item) => item.id === draft.duplicateOfItemId);
  const lowConfidence = draft.confidence === 'low';
  const derivedName = [color?.name, category ? CATEGORY_NOUN[category] : null].filter(Boolean).join(' ');
  const finalName = name.trim() || derivedName;
  const photo = draft.photos[bestIndex] ?? draft.photos[0];

  const save = () => {
    if (!category) {
      setError('Choose a category before saving.');
      return;
    }
    setError(null);
    confirmDraft.mutate(
      {
        importId: imp.id,
        draftId: draft.id,
        input: {
          name: finalName || 'Untitled piece',
          category,
          color,
          pattern,
          brand: brand || null,
          size: size || null,
          bestPhotoIndex: bestIndex,
        },
      },
      {
        onSuccess: (item) => {
          track('closet_item_saved', { itemId: item.id, category: item.category, provenance: item.provenance });
          if (readyCount <= 1) {
            showToast('Saved to your closet');
            goBack('/closet');
          } else {
            showToast(`${item.name} saved. ${pluralize(readyCount - 1, 'item')} left to review.`);
          }
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const choosePhoto = async () => {
    const result = await pickFromLibrary();
    if (result.status === 'denied') {
      explainDeniedPermission(result.source);
      return;
    }
    if (result.status !== 'picked') return;
    addPhoto.mutate(
      { importId: imp.id, draftId: draft.id, photo: result.photos[0] },
      { onSuccess: (updated) => setBestIndex((updated.drafts.find((d) => d.id === draft.id)?.photos.length ?? 1) - 1) },
    );
  };

  return (
    <Screen
      header={header}
      bottomInset
      footer={
        <>
          <Button title="Save to closet" variant="gold" shape="pill" onPress={save} loading={confirmDraft.isPending} />
          <Button
            title={draft.photos.length === 0 ? 'Add a photo' : 'Choose another photo'}
            variant="outline"
            shape="pill"
            onPress={choosePhoto}
            loading={addPhoto.isPending}
          />
        </>
      }>
      {imp.simulated ? (
        <Banner
          tone="notice"
          title="Simulated import"
          message="AI photo reading isn't connected yet. Choose the category and check every detail yourself."
          style={styles.banner}
        />
      ) : null}
      {imp.failedPhotoCount > 0 ? (
        <Banner
          tone="notice"
          title={`${pluralize(imp.failedPhotoCount, 'photo')} couldn't be read`}
          message="Try a clearer photo of one garment, or add the piece without a photo."
          style={styles.banner}
        />
      ) : null}
      {duplicate ? (
        <Banner
          tone="notice"
          title="This may already be in your closet"
          message={`This photo matches your ${duplicate.name}. Save it only if it's a different piece.`}
          actionLabel="Skip this one"
          onAction={() => discard.mutate({ importId: imp.id, draftId: draft.id })}
          style={styles.banner}
        />
      ) : null}
      {lowConfidence ? (
        <Banner
          tone="notice"
          title="Please check these details"
          message="We're not sure about the highlighted suggestions. Correct anything that's wrong."
          style={styles.banner}
        />
      ) : null}

      <GarmentImage
        image={photo}
        kind={category ? kindFor(category) : 'jacket'}
        colorHex={color?.hex}
        aspectRatio={1.35}
        // Cut-outs and whole-garment photos stay uncropped.
        contentFit="contain"
        accessibilityLabel={photo ? 'Selected garment photo' : 'No photo yet'}
        style={styles.hero}>
        {draft.photos.length > 1 ? (
          <Badge label="Best photo selected" tone="success" icon="check" size="md" style={styles.bestBadge} />
        ) : null}
        {draft.photos.length === 0 ? (
          <View style={styles.noPhoto}>
            <AppText variant="caption" color={colors.muted}>
              No photo — optional for closet items
            </AppText>
          </View>
        ) : null}
      </GarmentImage>

      {draft.photos.length > 1 ? (
        <View style={styles.thumbs} accessibilityRole="radiogroup" accessibilityLabel="Choose the photo to use">
          {draft.photos.map((p, index) => (
            <Pressable
              key={`${p.uri}-${index}`}
              onPress={() => setBestIndex(index)}
              accessibilityRole="radio"
              accessibilityState={{ checked: index === bestIndex }}
              accessibilityLabel={`Photo ${index + 1}`}
              style={[styles.thumb, index === bestIndex && styles.thumbSelected]}>
              <GarmentImage image={p} kind="jacket" aspectRatio={1.2} rounded={8} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.fields}>
        <SelectField
          label="Category"
          layout="inline"
          value={category}
          placeholder="Choose"
          flagged={lowConfidence || !category}
          options={CATEGORY_OPTIONS}
          onChange={setCategory}
        />
        <SelectField
          label="Color"
          layout="inline"
          value={color?.name ?? null}
          placeholder="Choose"
          flagged={lowConfidence}
          options={COLOR_OPTIONS.map((c) => ({ value: c.name, label: c.name }))}
          onChange={(value) => setColor(COLOR_OPTIONS.find((c) => c.name === value) ?? null)}
        />
        <SelectField
          label="Pattern"
          layout="inline"
          value={pattern}
          placeholder="Choose"
          flagged={lowConfidence}
          options={PATTERN_OPTIONS.map((p) => ({ value: p, label: p }))}
          onChange={setPattern}
        />
        <Divider spacing={space.xxs} />
        <Pressable
          onPress={() => setDetailsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Brand and size: ${brand || size ? [brand, size].filter(Boolean).join(', ') : 'add yourself'}`}
          style={styles.inlineRow}>
          <AppText variant="body" style={styles.inlineLabel}>
            Brand and size
          </AppText>
          <View style={styles.fakeSelect}>
            <AppText variant="bodyLarge" color={brand || size ? colors.ink : colors.muted} numberOfLines={1} style={styles.flex}>
              {brand || size ? [brand, size].filter(Boolean).join(' · ') : 'Add yourself'}
            </AppText>
            <Icon name="chevronDown" size={20} color={colors.ink} />
          </View>
        </Pressable>
      </View>

      <View style={styles.readyRow}>
        <Icon name="closet" size={28} color={colors.bronze} />
        <AppText variant="bodyLarge">
          {pluralize(readyCount, 'item')} ready to save
          {finalName ? <AppText variant="bodyLarge" color={colors.muted}>{` · ${finalName}`}</AppText> : null}
        </AppText>
      </View>
      {error ? <Banner tone="error" message={error} style={styles.banner} /> : null}
      {readyCount > 1 ? (
        <Button
          title="Skip this item"
          variant="link"
          tone="muted"
          onPress={() => discard.mutate({ importId: imp.id, draftId: draft.id })}
        />
      ) : null}

      <Sheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Add details"
        subtitle="Brand, size and name are never guessed from photos."
        footer={<Button title="Done" onPress={() => setDetailsOpen(false)} />}>
        <View style={styles.sheetFields}>
          <TextField label="Name" placeholder={derivedName || 'e.g. Navy blazer'} value={name} onChangeText={setName} autoCapitalize="words" />
          <TextField label="Brand" placeholder="e.g. Nyoni Couture" value={brand} onChangeText={setBrand} autoCapitalize="words" />
          <TextField label="Size" placeholder="e.g. 42 US / 52 EU" value={size} onChangeText={setSize} />
        </View>
      </Sheet>
    </Screen>
  );
}

function kindFor(category: WardrobeCategory) {
  return (
    {
      jackets: 'jacket',
      waistcoats: 'waistcoat',
      shirts: 'shirt',
      knitwear: 'knitwear',
      trousers: 'trousers',
      shoes: 'shoes',
      accessories: 'accessory',
    } as const
  )[category];
}

const styles = StyleSheet.create({
  banner: {
    marginTop: space.sm,
  },
  hero: {
    marginTop: space.md,
  },
  bestBadge: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
  },
  noPhoto: {
    position: 'absolute',
    bottom: space.sm,
    alignSelf: 'center',
    backgroundColor: 'rgba(251, 249, 245, 0.9)',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  thumbs: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  thumb: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 2,
  },
  thumbSelected: {
    borderColor: colors.champagne,
  },
  fields: {
    gap: space.sm,
    marginTop: space.lg,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  inlineLabel: {
    width: 116,
  },
  fakeSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
  },
  sheetFields: {
    gap: space.md,
  },
});
