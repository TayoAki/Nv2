import type {
  Occasion,
  Outfit,
  OutfitItemRef,
  Product,
  StyleProfile,
  WardrobeCategory,
  WardrobeItem,
} from '../types';

/*
 * A deterministic, rule-based stand-in for the AI stylist (plan section 13/14). It follows the
 * same contract as the real pipeline: read the shopper's available items, apply explicit
 * occasion/budget/"owned only" constraints, rank combinations, write a short explanation and
 * only ever reference items that exist. It never invents owned pieces.
 */

type Formality = 0 | 1 | 2; // relaxed, smart, formal

export type StylistResult =
  | { status: 'ok'; reply: string; outfit: Omit<Outfit, 'id' | 'createdAt'> }
  | { status: 'sparse_closet' | 'no_match'; reply: string; suggestedProductId?: string };

type Slot = 'outer' | 'top' | 'bottom' | 'shoes' | 'accessory';

const SLOT_FOR_CATEGORY: Record<WardrobeCategory, Slot> = {
  jackets: 'outer',
  knitwear: 'outer',
  shirts: 'top',
  trousers: 'bottom',
  shoes: 'shoes',
  accessories: 'accessory',
};

const OCCASIONS: { pattern: RegExp; occasion: Occasion; formality: Formality; label: string }[] = [
  { pattern: /black[\s-]?tie|gala|tux/i, occasion: 'black-tie', formality: 2, label: 'black-tie' },
  { pattern: /wedding/i, occasion: 'wedding', formality: 2, label: 'wedding' },
  { pattern: /dinner|date|evening|restaurant/i, occasion: 'dinner', formality: 1, label: 'dinner' },
  { pattern: /business|work|office|meeting|interview/i, occasion: 'business', formality: 1, label: 'business' },
  { pattern: /weekend|casual|brunch|everyday/i, occasion: 'everyday', formality: 0, label: 'weekend' },
];

const RELAX = /more relaxed|relax|casual|dress (it )?down|less formal/i;
const DRESS_UP = /dress it up|dressier|more formal|sharper|smarter/i;

/** Rough formality of a piece: 0 relaxed … 2.5 formal. */
function pieceFormality(item: WardrobeItem): number {
  const name = item.name.toLowerCase();
  if (/tux|dinner jacket|patent|bow tie/.test(name)) return 2.6;
  if (/sneaker|trainer|sunglass|tee|jean/.test(name)) return 0;
  if (/knit|sweater|cardigan/.test(name)) return 0.5;
  if (/belt/.test(name)) return 1;
  if (/oxford shirt|flannel/.test(name)) return 1.1;
  if (/pocket square|tie/.test(name)) return 2;
  if (/blazer|overcoat|suit|jacket/.test(name)) return 2;
  if (/loafer|derby|oxford|brogue/.test(name)) return 1.6;
  switch (item.category) {
    case 'jackets':
      return 2;
    case 'knitwear':
      return 0.5;
    case 'shoes':
      return 1.5;
    default:
      return 1.5;
  }
}

const TARGET: Record<Formality, number> = { 0: 0.4, 1: 1.6, 2: 2.3 };

function findFocusItem(text: string, items: WardrobeItem[]): WardrobeItem | undefined {
  const lower = text.toLowerCase();
  return items.find((item) =>
    item.name
      .toLowerCase()
      .split(/\s+/)
      .every((word) => lower.includes(word)),
  );
}

function pick(items: WardrobeItem[], slot: Slot, target: number, avoidHex?: string): WardrobeItem | undefined {
  const candidates = items.filter((item) => SLOT_FOR_CATEGORY[item.category] === slot);
  return candidates
    .map((item) => {
      let score = Math.abs(pieceFormality(item) - target);
      // Prefer some tonal contrast between layers.
      if (avoidHex && item.color?.hex.toLowerCase() === avoidHex.toLowerCase()) score += 0.35;
      return { item, score };
    })
    .sort((a, b) => a.score - b.score)[0]?.item;
}

function explain(pieces: WardrobeItem[], formality: Formality): string {
  const [first, second] = pieces.filter((piece) => piece.color).map((piece) => piece.color!.name);
  const tone = formality === 0 ? 'easy' : formality === 1 ? 'polished' : 'sharp';
  if (first && second && first !== second) return `${first} and ${second.toLowerCase()} keep it ${tone}.`;
  if (first) return `Tonal ${first.toLowerCase()} keeps it ${tone}.`;
  return `A ${tone} combination from your closet.`;
}

export function recommend(input: {
  text: string;
  ownedOnly: boolean;
  focusItemId?: string;
  wardrobe: WardrobeItem[];
  products: Product[];
  profile: StyleProfile;
  previous?: Outfit;
}): StylistResult {
  const available = input.wardrobe.filter(
    (item) => !item.archived && item.availability === 'ready' && item.ownership === 'owned',
  );

  const matched = OCCASIONS.find((o) => o.pattern.test(input.text));
  const isFollowUp = !matched && !!input.previous && (RELAX.test(input.text) || DRESS_UP.test(input.text));
  const previousOccasion = OCCASIONS.find((o) => o.occasion === input.previous?.occasion);
  const base =
    matched ??
    (isFollowUp ? previousOccasion : undefined) ??
    OCCASIONS.find((o) => o.occasion === input.profile.occasions[0]) ??
    OCCASIONS[2];

  let formality: Formality = base.formality;
  if (RELAX.test(input.text)) formality = Math.max(0, formality - 1) as Formality;
  if (DRESS_UP.test(input.text)) formality = Math.min(2, formality + 1) as Formality;

  const focus =
    available.find((item) => item.id === input.focusItemId) ??
    findFocusItem(input.text, available) ??
    (isFollowUp ? available.find((item) => item.id === input.previous?.focusItemId) : undefined);

  const mentionedButUnavailable = input.wardrobe.find(
    (item) => item.availability !== 'ready' && findFocusItem(input.text, [item]),
  );

  if (available.length < 3) {
    const focusName = focus?.name.toLowerCase();
    return {
      status: 'sparse_closet',
      reply: `I can only see ${available.length === 0 ? 'no available pieces' : `${available.length} available piece${available.length === 1 ? '' : 's'}`} in your closet. ${
        focusName
          ? `Your ${focusName} would work with a light shirt and dark trousers, but I won't assume you own them. `
          : ''
      }Add a top, trousers and shoes and I'll build complete outfits.`,
    };
  }

  // Black tie needs formal pieces; never pretend a blazer is a dinner jacket.
  const hasFormal = available.some((item) => pieceFormality(item) >= 2.5);
  if (base.occasion === 'black-tie' && !hasFormal) {
    const tux = input.products.find((p) => p.category === 'tuxedos' && !p.discontinued && p.variants.some((v) => v.stock !== 'out_of_stock'));
    return {
      status: 'no_match',
      reply: input.ownedOnly
        ? "I couldn't find black-tie pieces in your closet. Turn off \"Owned items only\" and I can suggest Nyoni pieces."
        : `Your closet doesn't have black-tie pieces yet.${tux ? ` The ${tux.title} from Nyoni would be the place to start.` : ''}`,
      suggestedProductId: input.ownedOnly ? undefined : tux?.id,
    };
  }

  const target = TARGET[formality];
  const chosen: Partial<Record<Slot, WardrobeItem>> = {};
  if (focus) chosen[SLOT_FOR_CATEGORY[focus.category]] = focus;

  // Relaxed looks lead with knitwear; smart and formal looks lead with tailoring.
  if (!chosen.outer) {
    const outerPool = available.filter((item) =>
      formality === 0 ? true : item.category === 'jackets',
    );
    chosen.outer = pick(outerPool.length ? outerPool : available, 'outer', target);
  }
  chosen.top ??= pick(available, 'top', target, chosen.outer?.color?.hex);
  chosen.bottom ??= pick(available, 'bottom', target, chosen.outer?.color?.hex);
  chosen.shoes ??= pick(available, 'shoes', target);
  if (formality === 2) {
    chosen.accessory ??= pick(
      available.filter((item) => pieceFormality(item) >= 1.5),
      'accessory',
      target,
    );
  }

  const pieces = (['outer', 'top', 'bottom', 'shoes', 'accessory'] as Slot[])
    .map((slot) => chosen[slot])
    .filter((item): item is WardrobeItem => !!item);

  if (pieces.length < 3 || !chosen.bottom) {
    return {
      status: 'no_match',
      reply: `I couldn't build a complete ${base.label} look from what's available. Check whether pieces are marked unavailable, or add more clothes.`,
    };
  }

  // Optional store complement: only when allowed, in stock and within the stated budget.
  let complement: Outfit['complement'] = null;
  if (!input.ownedOnly && formality > 0) {
    const budget = input.profile.budget?.amountMinor;
    const accessory = input.products.find(
      (p) =>
        p.kind === 'accessory' &&
        !p.discontinued &&
        p.occasions.includes(base.occasion === 'everyday' ? 'business' : base.occasion) &&
        p.variants.some((v) => v.stock !== 'out_of_stock') &&
        (budget == null || p.price.amountMinor <= budget),
    );
    if (accessory && !chosen.accessory) complement = { productId: accessory.id };
  }

  const items: OutfitItemRef[] = pieces.map((piece) => ({ kind: 'owned', itemId: piece.id }));
  const unavailableNote = mentionedButUnavailable
    ? ` Your ${mentionedButUnavailable.name.toLowerCase()} is marked unavailable, so I left it out.`
    : '';

  return {
    status: 'ok',
    reply: `${formality === 0 && isFollowUp ? 'A more relaxed take, all from your closet.' : formality === 2 && isFollowUp ? 'Dressed up, using your closet.' : 'Try these pieces from your closet.'}${unavailableNote}`,
    outfit: {
      title: `Your ${base.label} look`,
      occasion: base.occasion,
      explanation: explain(pieces, formality),
      items,
      complement,
      saved: false,
      ownedOnly: input.ownedOnly,
      focusItemId: focus?.id,
    },
  };
}

/** Closet items that can replace the piece at `index` in an outfit. */
export function swapCandidates(item: WardrobeItem, wardrobe: WardrobeItem[]): WardrobeItem[] {
  const slot = SLOT_FOR_CATEGORY[item.category];
  return wardrobe.filter(
    (candidate) =>
      candidate.id !== item.id &&
      !candidate.archived &&
      candidate.availability === 'ready' &&
      candidate.ownership === 'owned' &&
      SLOT_FOR_CATEGORY[candidate.category] === slot,
  );
}
