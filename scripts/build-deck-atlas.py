#!/usr/bin/env python3
"""Slice a painted 4x5 card sheet into the theme atlas the card renderer expects.

The sheets that come out of the artwork pipeline hold twenty cells in four
columns and five rows: the four aces, then the jack, queen and king rows, then
two jokers, an empty frame and the back. Number cards are not painted — the
renderer draws their indices and pips over the frame — so twenty cells are the
whole face set.

    python3 scripts/build-deck-atlas.py sheet.webp --name stellar-dominion
    python3 scripts/build-deck-atlas.py sheet.webp --name stellar-dominion --atlas
    python3 scripts/build-deck-atlas.py sheet.webp --name stellar-dominion --check
    python3 scripts/build-deck-atlas.py tiles.webp --faith christianity-islam
    python3 scripts/build-deck-atlas.py felt.png --table burgundy

The default form writes public/decks/<name>/*.webp plus manifest.json. `--atlas`
writes the whole sheet to public/card-art/<name>.webp, the single painted atlas
the store and the hand renderers load, upscaling when it is smaller than the
600x900 the deck preview requires. `--check` only reports the grid geometry,
which is the quick way to confirm a new sheet lines up before anything is
written.

`--faith` handles the 5x4 tilesheet the Faith 3 board crops from instead: the
first two rows belong to the first tradition, the last two to the second, and
every cell has to be 2:3 portrait and distinct from the other nineteen.
`--frames` splits a wide strip of named ornate tile frames into one portrait
WebP each. `--table` encodes a landscape table surface as table-<name>.webp.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

COLUMNS, ROWS = 4, 5
ATLAS_MIN = (600, 900)
# The eight painted decks the store and both hand renderers load from
# /card-art/<key>.webp; their entitlement ids are card-deck-<key>.
THEMES = {
    "standard": "Everyday Standard",
    "fantasy": "Realms of Legend",
    "scifi": "Stellar Dominion",
    "sultanate": "Sultan's Court",
    "four-color": "Four-Suit Regalia",
    "chinese": "Chinese Imperial Courts",
    "egypt": "Pharaoh's Court",
    "merfolk": "Merfolk Kingdoms",
}

# Faith 3 draws 100 faces from five atlases of two traditions each.
FAITH_THEMES = ("christianity", "islam", "hinduism", "buddhism", "judaism",
                "sikhism", "taoism", "shinto", "jainism", "bahai")
FAITH_COLUMNS, FAITH_ROWS = 5, 4
TILE_ASPECT = (1.44, 1.56)  # the portrait bound the browser suite asserts
# The four purchasable surfaces, as the collection headings name them; the
# browser suite only pins the file names, table-<key>.webp.
TABLES = {"classic": "Clubhouse Green", "riviera": "Riviera Teal",
          "sapphire": "Midnight Sapphire", "burgundy": "Royal Burgundy"}
TABLE_ASPECT = (1.4, 1.6)  # landscape felt
SUITS = ("spades", "hearts", "diamonds", "clubs")
CELLS = [dict(row=0, rank="ace", suit=suit) for suit in SUITS]
for row, rank in ((1, "jack"), (2, "queen"), (3, "king")):
    CELLS += [dict(row=row, rank=rank, suit=suit) for suit in SUITS]
CELLS += [dict(row=4, rank="joker", suit=None), dict(row=4, rank="joker", suit=None),
          dict(row=4, rank="frame", suit=None), dict(row=4, rank="back", suit=None)]
for index, cell in enumerate(CELLS):
    cell["index"] = index
    cell["column"] = index % COLUMNS
    unique = cell["rank"] if cell["rank"] != "joker" else f"joker-{index - 15}"
    cell["name"] = f"{unique}-{cell['suit']}" if cell["suit"] else unique


def slice_sheet(sheet: Image.Image, inset: int):
    width, height = sheet.size
    if width < COLUMNS or height < ROWS:
        raise SystemExit(f"A {width}x{height} sheet is too small for a {COLUMNS}x{ROWS} grid.")
    for cell in CELLS:
        left = cell["column"] * width // COLUMNS + inset
        top = cell["row"] * height // ROWS + inset
        right = (cell["column"] + 1) * width // COLUMNS - inset
        bottom = (cell["row"] + 1) * height // ROWS - inset
        if right <= left or bottom <= top:
            raise SystemExit(f"Cell {cell['name']} is empty; --inset {inset} is too large.")
        yield cell, sheet.crop((left, top, right, bottom))


def faith_faces(sheet: Image.Image):
    width, height = sheet.size
    for index in range(FAITH_COLUMNS * FAITH_ROWS):
        row, column = divmod(index, FAITH_COLUMNS)
        yield index, row, column, sheet.crop(
            (column * width // FAITH_COLUMNS, row * height // FAITH_ROWS,
             (column + 1) * width // FAITH_COLUMNS, (row + 1) * height // FAITH_ROWS))


def build_faith(args, sheet: Image.Image, digest: str):
    names = args.faith.strip().lower().replace("_", "-").split("-")
    if len(names) != 2 or any(name not in FAITH_THEMES for name in names):
        raise SystemExit(f"--faith takes two traditions, e.g. christianity-islam."
                         f" Known: {', '.join(FAITH_THEMES)}.")
    faces = list(faith_faces(sheet))
    face = faces[0][3]
    aspect = face.height / face.width
    portraits = TILE_ASPECT[0] < aspect < TILE_ASPECT[1]
    distinct = len({hashlib.sha256(f.tobytes()).hexdigest() for _, _, _, f in faces})
    print(f"{args.sheet.name}: {sheet.width}x{sheet.height}, sha256 {digest[:16]}")
    print(f"{FAITH_COLUMNS}x{FAITH_ROWS} atlas of {face.width}x{face.height} faces, "
          f"aspect {aspect:.2f} (needs {TILE_ASPECT[0]}-{TILE_ASPECT[1]}: {'ok' if portraits else 'not portrait'})")
    print(f"rows 0-1 {names[0]} 0-9, rows 2-3 {names[1]} 0-9, {distinct}/{len(faces)} distinct")
    problems = []
    if not portraits:
        problems.append("cells are not 2:3 portrait")
    if distinct != len(faces):
        problems.append(f"only {distinct} of {len(faces)} faces differ")
    if args.check:
        for index, row, column, _ in faces:
            print(f"  [{index:2}] r{row}c{column}  {names[0] if row < 2 else names[1]}-{index % 10}")
        for problem in problems:
            print(f"  problem: {problem}")
        return 0
    if problems and not args.force:
        for problem in problems:
            print(f"  problem: {problem}")
        return 1
    path = args.out or Path("public/faith-art") / f"{names[0]}-{names[1]}.webp"
    if path.suffix != ".webp":
        raise SystemExit("Faith atlases are .webp paths.")
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, "WEBP", quality=args.quality, method=6)
    print(f"wrote {path}")
    return 0


def build_frames(args, sheet: Image.Image, digest: str):
    names = [part.strip().lower().replace(" ", "-") for part in args.frames.split(",") if part.strip()]
    if not names:
        raise SystemExit("--frames needs at least one name, e.g. --frames moon,lotus,rose.")
    frames = [(name, sheet.crop((index * sheet.width // len(names), 0,
                                 (index + 1) * sheet.width // len(names), sheet.height)))
              for index, name in enumerate(names)]
    first = frames[0][1]
    aspect = first.height / first.width
    portraits = TILE_ASPECT[0] < aspect < TILE_ASPECT[1]
    distinct = len({hashlib.sha256(f.tobytes()).hexdigest() for _, f in frames})
    print(f"{args.sheet.name}: {sheet.width}x{sheet.height}, sha256 {digest[:16]}")
    print(f"{len(frames)} frame(s) of {first.width}x{first.height}, aspect {aspect:.2f} "
          f"(needs {TILE_ASPECT[0]}-{TILE_ASPECT[1]}: {'ok' if portraits else 'not portrait'})")
    problems = []
    if not portraits:
        problems.append("frames are not 2:3 portrait")
    if distinct != len(frames):
        problems.append(f"only {distinct} of {len(frames)} frames differ")
    if args.check:
        for name, _ in frames:
            print(f"  {name}")
        for problem in problems:
            print(f"  problem: {problem}")
        return 0
    if problems and not args.force:
        for problem in problems:
            print(f"  problem: {problem}")
        return 1
    out = args.out or Path("public/faith-art/frames")
    if out.suffix == ".webp":
        raise SystemExit("--out is a directory for --frames, one file per name.")
    out.mkdir(parents=True, exist_ok=True)
    for name, frame in frames:
        frame.save(out / f"{name}.webp", "WEBP", quality=args.quality, method=6)
    print(f"wrote {len(frames)} frames to {out}: {', '.join(name for name, _ in frames)}")
    return 0


def build_table(args, sheet: Image.Image, digest: str):
    name = args.table.strip().lower().replace("_", "-")
    if name not in TABLES:
        raise SystemExit(f"--table takes one of {', '.join(TABLES)}; got {name!r}.")
    aspect = sheet.width / sheet.height
    landscape = TABLE_ASPECT[0] < aspect < TABLE_ASPECT[1]
    print(f"{args.sheet.name}: {sheet.width}x{sheet.height}, sha256 {digest[:16]}")
    print(f"table {name}: {TABLES[name]} · rummy-table-{name} · table-{name}.webp")
    print(f"aspect {aspect:.2f} (needs {TABLE_ASPECT[0]}-{TABLE_ASPECT[1]} landscape: "
          f"{'ok' if landscape else 'not landscape'})")
    if args.check:
        if not landscape:
            print("  problem: surface is not landscape")
        return 0
    if not landscape and not args.force:
        print("  problem: surface is not landscape")
        return 1
    path = args.out or Path("public/rummy-art") / f"table-{name}.webp"
    if path.suffix != ".webp":
        raise SystemExit("Table surfaces are .webp paths.")
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, "WEBP", quality=args.quality, method=6)
    with Image.open(path) as written:
        print(f"wrote {path} {written.width}x{written.height}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("sheet", type=Path, help="painted 4x5 contact sheet")
    parser.add_argument("--name", help="deck theme key, e.g. egypt (default: the sheet's file name)")
    parser.add_argument("--out", type=Path, help="output directory (default public/decks/<name>)")
    parser.add_argument("--inset", type=int, default=0, help="pixels trimmed from every cell edge")
    parser.add_argument("--quality", type=int, default=88, help="WebP quality for each face")
    parser.add_argument("--check", action="store_true", help="report geometry without writing")
    parser.add_argument("--atlas", action="store_true", help="write the sheet as public/card-art/<name>.webp")
    parser.add_argument("--faith", help="write a 5x4 tradition atlas, e.g. christianity-islam")
    parser.add_argument("--frames", help="split a frame strip, e.g. moon,lotus,rose")
    parser.add_argument("--table", help="encode a table surface, e.g. burgundy")
    parser.add_argument("--force", action="store_true", help="allow an atlas below the required size")
    args = parser.parse_args(argv)
    args.name = (args.name or args.sheet.stem).strip().lower().replace("_", "-")
    theme = THEMES.get(args.name)

    if not args.sheet.is_file():
        raise SystemExit(f"No sheet at {args.sheet}.")
    digest = hashlib.sha256(args.sheet.read_bytes()).hexdigest()
    with Image.open(args.sheet) as opened:
        sheet = opened.convert("RGB")
        if args.faith:
            return build_faith(args, sheet, digest)
        if args.frames:
            return build_frames(args, sheet, digest)
        if args.table:
            return build_table(args, sheet, digest)
        cells = list(slice_sheet(sheet, args.inset))
        print(f"{args.sheet.name}: {sheet.width}x{sheet.height}, sha256 {digest[:16]}")
        print(f"cell size {cells[0][1].width}x{cells[0][1].height}, {len(cells)} cells")
        print(f"deck {args.name}: " + (f"{theme} · card-deck-{args.name}" if theme else "not one of the eight painted themes"))
        if args.check:
            for cell, _ in cells:
                print(f"  [{cell['index']:2}] r{cell['row']}c{cell['column']}  {cell['name']}")
            if not theme:
                print(f"  note: known themes are {', '.join(THEMES)}")
            return 0
        if not theme and not args.force:
            raise SystemExit(f"{args.name} is not a painted deck theme. Known themes: {', '.join(THEMES)}. Use --force for other art.")

        if args.atlas:
            path = args.out or Path("public/card-art") / f"{args.name}.webp"
            if path.suffix != ".webp":
                raise SystemExit("--atlas writes a .webp atlas path.")
            target = sheet
            if sheet.width < ATLAS_MIN[0] or sheet.height < ATLAS_MIN[1]:
                scale = max(ATLAS_MIN[0] / sheet.width, ATLAS_MIN[1] / sheet.height)
                target = sheet.resize((round(sheet.width * scale), round(sheet.height * scale)), Image.LANCZOS)
            path.parent.mkdir(parents=True, exist_ok=True)
            target.save(path, "WEBP", quality=args.quality, method=6)
            with Image.open(path) as written:
                fits = written.width >= ATLAS_MIN[0] and written.height >= ATLAS_MIN[1]
                print(f"wrote {path} {written.width}x{written.height} (needs {ATLAS_MIN[0]}x{ATLAS_MIN[1]}: {'ok' if fits else 'too small'})")
            return 0 if fits or args.force else 1

        out = args.out or Path("public/decks") / args.name
        out.mkdir(parents=True, exist_ok=True)
        manifest = {"deck": args.name, "sheet": args.sheet.name, "sha256": digest,
                    "columns": COLUMNS, "rows": ROWS, "cells": []}
        for cell, face in cells:
            file = f"{cell['name']}.webp"
            face.save(out / file, "WEBP", quality=args.quality, method=6)
            manifest["cells"].append({**{k: cell[k] for k in ("index", "row", "column", "name", "rank", "suit")},
                                      "file": file, "width": face.width, "height": face.height})
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {len(cells)} faces + manifest.json to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
