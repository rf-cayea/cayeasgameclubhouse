# Clubhouse artwork

`optimized-assets` holds AVIF encodings of the original WebP files in `public`, at the same dimensions. The Sites build embeds these at the original URLs with `image/avif` MIME types. Source WebP originals remain unchanged and the Node/Vite workflow uses them. The build verifies original source hashes against `optimized-assets/manifest.json` before using each encoding, so a later source-art change cannot silently serve an old image. Re-encode changed images and refresh their source hashes when updating artwork. This saves enough Worker space for the new seasonal collection. No Content-Encoding is used.

`public/collectible-art/harvest-hearth-1.avif` through `10.avif` contain 60 newly generated original paintings, six per image in a 3-column, 2-row grid. Card titles, rarity stars and frames are rendered separately for readable mobile typography. The catalog in `src/lib/collectibles.ts` maps each card to its panel. The paintings were generated for Cayea’s Collectibles in ten coordinated art briefs covering autumn gratitude, harvest food and wildlife, snowy woodland, festive community celebrations and winter fantasy. AVIF files preserve the generated dimensions (1536 × 1024).

The 40 Harvest & Hearth expansion illustrations (cards 61–100, stored as `public/collectible-art/hh-61.webp` through `hh-100.webp`) were generated with OpenAI.
