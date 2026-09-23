# Capsule photos

Put one photo per capsule piece here, named after its `key` in
`src/api/catalog/nyoni-capsule.json`:

- `<key>.webp` (or `.jpg`): the house's product photo
- `<key>.png`: the transparent cut-out, once the cut-out pass has run (preferred when both exist)

Then run `npm run collection` to regenerate `src/api/catalog/capsuleImages.ts`.
Pieces without a photo show a tinted garment illustration in the piece's colour.
