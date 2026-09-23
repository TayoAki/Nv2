/**
 * Prompts are where the real work is. Each render gets a fresh prompt built from the actual
 * references, so the model knows exactly what every image is and what must not change.
 */

export type RenderGarment = {
  name: string;
  /** jacket, suit, waistcoat, shirt, trousers, shoes, knitwear, accessory */
  kind: string;
  /** Extra detail: colour, pattern, fabric. */
  description?: string;
  /** Suits: which parts are shown, e.g. "a matched jacket and trousers". */
  wornAs?: string;
  /** False when there's no photo and the garment is described in words only. */
  hasImage: boolean;
};

export type RenderOptions = {
  framing: 'full' | 'cropped';
  /** Member preference: slim, regular or relaxed. */
  fit?: string;
  /** Member preference, e.g. "menswear tailoring". */
  presentation?: string;
};

const LAYER_ORDER = ['shirt', 'knitwear', 'waistcoat', 'trousers', 'suit', 'jacket', 'shoes', 'accessory'];

export function renderPrompt(garments: RenderGarment[], options: RenderOptions): string {
  const lines: string[] = [];
  const kinds = new Set(garments.map((g) => g.kind));

  lines.push('Image 1 is the member. Redress this same person in the garments shown in the other images.');

  let imageNumber = 1;
  for (const garment of garments) {
    const detail = [garment.wornAs ? `worn as ${garment.wornAs}` : null, garment.description].filter(Boolean).join('; ');
    if (garment.hasImage) {
      imageNumber += 1;
      lines.push(`Image ${imageNumber} is the ${garment.name}${detail ? ` — ${detail}` : ''}.`);
    } else {
      lines.push(`Also wearing: the ${garment.name}${detail ? ` — ${detail}` : ''} (no photo; follow this description).`);
    }
  }

  const layers = [...garments]
    .sort((a, b) => LAYER_ORDER.indexOf(a.kind) - LAYER_ORDER.indexOf(b.kind))
    .map((g) => (g.kind === 'jacket' || g.kind === 'suit' ? `${g.name} (jacket open over the top)` : g.name));
  if (layers.length > 1) lines.push(`Layering, from the inside out: ${layers.join(', then ')}.`);

  // Fill gaps so the figure is never half dressed.
  const hasSuit = kinds.has('suit');
  const hasJacket = hasSuit || kinds.has('jacket');
  if (!kinds.has('shirt') && !kinds.has('knitwear') && (hasJacket || kinds.has('waistcoat') || kinds.has('trousers'))) {
    lines.push('No shirt is provided: add a plain white dress shirt with no tie.');
  }
  if (!kinds.has('trousers') && !hasSuit) {
    lines.push(
      kinds.has('jacket')
        ? 'No trousers are provided: add plain charcoal tailored trousers that suit the jacket.'
        : 'No trousers are provided: add plain charcoal tailored trousers.',
    );
  }
  if (!kinds.has('shoes')) lines.push('No shoes are provided: add plain black leather dress shoes.');

  lines.push(
    "Keep the same person: preserve their face, hair, skin tone, body proportions and pose exactly. Change only the clothes. Do not change the person's identity, age, body shape or build.",
  );

  if (options.framing === 'cropped') {
    lines.push(
      'Image 1 is cropped (a headshot or half-length photo). Use it for identity only, never for face-to-frame scale. Infer a naturally proportioned standing body — the head is roughly one seventh to one eighth of total height — and pull the camera back for a full-length, head-to-toe shot.',
    );
  } else {
    lines.push('Show the full body, head to toe, with the whole outfit visible.');
  }

  lines.push(
    "Reproduce each garment's colour, pattern, fabric texture, lapels, buttons and details exactly as in its reference image. Add no logos, text or extra accessories.",
  );
  if (options.fit) {
    lines.push(
      `Fit preference: ${options.fit}. Adjust fabric drape and ease only, never anatomy — do not slim, lengthen or reshape the body.`,
    );
  }
  if (options.presentation) lines.push(`Presentation: ${options.presentation}.`);
  lines.push('Plain light grey studio background, soft even light, natural shadows, photographic realism, no props, no text.');

  return lines.join('\n');
}

export function cutoutPrompt(name: string, transparent: boolean): string {
  return [
    `Isolate only the ${name} from this photo as a clean product cut-out.`,
    'Remove the person, hanger, mannequin and everything else. Keep the garment shape natural, front view, centred.',
    "Preserve the garment's exact colour, pattern, fabric texture and details.",
    transparent ? 'Transparent background.' : 'Plain pure white background.',
  ].join(' ');
}

export const DETECT_INSTRUCTIONS = `You catalogue clothing in photos for a menswear wardrobe app.
Return every wearable item that is clearly visible (up to 6): jackets, suits, waistcoats, shirts, knitwear, trousers, shoes and accessories.
For each item give a short name (colour + garment, e.g. "Navy wool blazer"), its category, colour name, pattern, likely material, formality, how confident you are (0-1),
and a bounding box as fractions of the image (x, y, width, height from the top-left).
Only describe what you can see. If the photo shows no clothing, return an empty list.`;
