# Benchwork

A browser tool for designing woodworking projects the way you would build them. You start from real lumber — a 38×76 pine stick, an 18 mm MDF sheet — and shape it with a saw, a drill and screws. There is no “add box” or boolean cut.

All units are millimetres. Prices are South African rand, as planning estimates rather than a live quote.

## Run it

```bash
npm install
npm run dev
```

The dev server listens on port **4317**. `npm test` checks the cut, kerf and shopping-list maths. `npm run build` typechecks and produces a static build.

## What you can do

- Browse a sample catalogue of planed pine, meranti and saligna, plus 2440×1220 plywood, MDF and Supawood. Click a length to drop that board on the bench at full size.
- Import your own stock list as JSON or CSV, or download the current catalogue in either format.
- Orbit the bench, select a piece, and move or rotate it. Grid snap (1 / 5 / 10 / 50 mm) and face snap butt pieces together and sit them on the floor. Screwed pieces move as one assembly.
- **Saw.** Crosscut at a measured distance from the reference end (the brass dot) or the far end, with an optional mitre. Rip along the width. The cut removes a kerf (default 3 mm, editable) and splits one piece into two real pieces.
- **Drill.** Click a face to bore a hole. Diameter, depth and through-holes are stored on the piece and drawn in the board.
- **Screw.** Click the outside face of two touching pieces. The screw has to be long enough to reach the second piece. Fasteners are listed, and can be removed.
- Read a **cut list** (which purchased length each part came from, finished size, mitre long and short points, holes), a **shopping list** with quantities and estimated cost, and a **fastener list**.
- Undo and redo. The project autosaves in this browser. Export and open it as JSON.

Keyboard: `1` move, `2` saw, `3` drill, `4` screw, `T` / `R` move or rotate, `Enter` cuts, `Delete` removes the selection, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, `Ctrl+S` saves locally, `Esc` returns to move.

## How a cut is measured

Length is the centreline. A crosscut “at 450 mm” keeps a 450 mm piece and takes the kerf out of the offcut, which is how you mark a finished length and cut on the waste side. A mitre tilts the end around the vertical axis (a frame mitre). The kerf is the blade thickness measured square to the blade, so a 45° cut consumes `kerf / cos(45°)` along the board. Both resulting pieces must be at least 5 mm.

A rip splits the width and leaves both pieces sharing the same length of the original board, so the cut list does not count that length twice.

## Stock list format

The sample catalogue lives in `src/data/stock-catalog.json`. Import accepts the same shape, or a bare array.

```json
{
  "items": [
    {
      "id": "pine-38x76",
      "name": "PAR Pine 38×76",
      "species": "SA Pine",
      "thickness": 38,
      "width": 76,
      "sheet": false,
      "lengths": [
        { "length": 1800, "price": 105 },
        { "length": 2400, "price": 138 }
      ]
    }
  ]
}
```

`thickness` and `width` are millimetres. `lengths[].price` is rand for that purchased length. Set `sheet` for sheet goods; a 16 mm plywood sheet is thickness 16, width 1220, length 2440.

CSV, one row per length (rows that share an `id` are combined):

```csv
id,name,species,thickness_mm,width_mm,length_mm,price_zar,sheet
pine-38x76,PAR Pine 38×76,SA Pine,38,76,2400,138,false
pine-38x76,PAR Pine 38×76,SA Pine,38,76,3000,172,false
```

You can also put several lengths in one row with pipes: `lengths_mm` = `1800|2400` and `prices_zar` = `105|138`.

## Project file

Export writes a JSON document:

```json
{
  "format": "benchwork-project",
  "version": 1,
  "name": "Hall table",
  "units": "mm",
  "kerf": 3,
  "catalog": [],
  "boards": [],
  "pieces": [],
  "fasteners": []
}
```

Each piece records its board, centreline length, mitres, pose, holes, and the span it still occupies on the purchased board. Screws are stored in the local space of the piece that holds the head, so they stay put when an assembly moves.

## Where the model lives

Geometry and operations are plain TypeScript under `src/domain`, separate from the React Three Fiber view:

- `types.ts` — stock, boards, pieces, holes, screws
- `geometry.ts` — mitred meshes, face frames, snapping
- `operations.ts` — add stock, crosscut, rip, drill, assemblies
- `reports.ts` — cut list, shopping list, fastener list
- `catalog.ts` — JSON and CSV

That split is where dadoes, rebates, routers, dowels, pocket screws and sheet nesting can land later without rewriting the viewport.
