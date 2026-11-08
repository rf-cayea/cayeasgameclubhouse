# Faith 3 illustrated collections

The ten existing traditions each have ten distinct illustrated faces (100 total).
Artwork is hosted locally under public/faith-art/ as five optimized WebP atlases.
Each atlas has five columns and four rows. The first two rows contain the first
tradition in the filename; the last two contain the second. FaithTileArtwork uses
an SVG crop, so artwork does not depend on emoji fonts or an external image CDN.

The motif labels and atlas mapping live in src/lib/faith-art.ts. Collection selection
changes artwork on the board and in the tray together, while the matching rules,
level layouts, blocking rules and assists keep using the original tile types.
The default follows the original level's tradition. The selector also allows any
collection at any level.

Tiles have a 2:3 portrait shape. Board coordinates scale vertically by 1.5 and use
bounds from the initial level layout, so removing a tile cannot move its neighbors.
The ten-illustration preview lets players inspect a collection before playing it.

Run tests/faith_tiles_browser.py against a local preview to check every collection
at desktop and phone widths, image loading, distinct crops, portrait dimensions,
matching, theme changes with a partially filled tray, undo and layered boards.
