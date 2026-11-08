# Faith 3 difficulty progression

All 280 levels have seeded layouts and an unassisted winning path. The generator
assigns motifs along a legal covering order, interleaves triples within the tray
budget, then places obstacles that can be released along that path. The path
validates starting boards; the player still has to choose a route and can lose.

- Levels 1–10 introduce triples and covering layers.
- Frost begins at 11. Collecting a tile melts one layer from ice touching its
  footprint, including nearby floors. Frozen tiles cannot be picked.
- Wax seals begin at 31. Their number is the remaining triples needed to open
  them. The engine releases them atomically with the completed match.
- Veils begin at 61. A legal first tap reveals the artwork; a second collects it.
  Revealing does not put a tile in the tray or melt ice.
- Level 101 adds double frost and limits the tray to six open slots.
- Level 221 adds triple frost and limits the tray to five open slots.
- Seven-layer Grandmaster layouts begin at 241. Tile counts and obstacle density
  grow with level, with up to 168 tiles and ten motifs in the final stages.

Undo restores the entire previous board, including frost, seals, veils and match
counts. Shuffle preserves motif counts and positions while clearing obstacle
locks and revealing remaining faces. Magic consumes a complete triple and applies
its collection effects. Existing assistance allowances and replay limits remain.

`tests/faith-obstacles.test.ts` replays a full unassisted solution through the real
engine for every level and checks obstacle, undo, assist and tray-limit behavior.
The browser regression checks the rendered milestones and completes the final
Grandmaster board on desktop and mobile.
