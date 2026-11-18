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

- Browse a sample catalogue of planed pine, meranti and saligna, construction pine, dressed pine, round pipe, plus plywood (including 17 mm), MDF and Supawood. Click a length to drop that board on the bench at full size.
- Import your own stock list as JSON or CSV, or download the current catalogue in either format.
- Orbit the bench, select a piece, and move or rotate it. Grid snap (1 / 5 / 10 / 50 mm) and face snap butt pieces together and sit them on the floor. Screwed pieces move as one assembly.
- **Saw.** Crosscut from the reference end (the brass dot) or the far end, with mitre and bevel. The dock shows the long point as well as the centreline; turn on Long point to type the long point directly. Rip along the width. Taper one or both ends. Draw a bandsaw or jigsaw path on the top face and keep one side of it. Plunge cuts a rectangular opening, or a notch when the rectangle crosses an edge, and keeps the offcut. A splitting cut removes a kerf (default 3 mm) and becomes two real pieces. Round stock can be crosscut, not ripped.
- **Drill.** Twist bits, countersinks, Forstner bits and hole saws. A hole saw cuts through and leaves the plug as its own piece.
- **Router.** Dados across the grain, grooves with the grain, rebates on an edge, and round-over, chamfer or cove profiles.
- **Joinery.** Mortise and tenon, half-lap, a dovetail tail and pin, and paired dowels. Each feature is stored on both pieces so they fit.
- **Fasteners.** Screws, 15° pocket screws, bolts and glue. Joined pieces move together.
- **Hardware.** Butt hinges, drawer slides, angle brackets, castors, barrel bolts and pulls from a small catalogue. They are priced on the shopping list.
- **Finish.** Per piece: grain along or across the length, plus bare wood, stain or paint.
- Read a **cut list** (stock length, finished size, mitres, and notes for tapers, curves, holes, router cuts and joints), a **shopping list** with timber and hardware, and a **fastener list**.
- Undo and redo. The project autosaves in this browser. Export and open it as JSON. Project → Examples loads a stackable sawhorse and a mitre-saw workbench built in the app.

Keyboard: `V` move, `K` saw, `D` drill, `T` router, `J` joint, `Y` fasten, `H` hardware, `P` pencil, `M` measure. `G` / `R` / `S` grab, rotate and scale, then `X` `Y` `Z` and a typed value. Numpad `1` `3` `7` are front, side and top, numpad `5` is orthographic, `F` or `.` frames the selection. Arrows nudge, `Ctrl+D` duplicates, `Ctrl+C` / `Ctrl+V` copy and paste, `?` opens the cheat sheet. `Enter` cuts, `Delete` removes the selection, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, `Ctrl+S` saves locally, `Esc` cancels.

## How a cut is measured

Length is the centreline. A crosscut “at 450 mm” keeps a 450 mm piece and takes the kerf out of the offcut. A mitre tilts the end across the width. A bevel tilts it through the thickness. Together they consume `kerf × √(1 + tan² mitre + tan² bevel)` along the board. Both resulting pieces must be at least 5 mm.

A rip splits the width and leaves both pieces sharing the same length of the original board, so the cut list does not count that length twice. A taper changes the width at each end without splitting the board. A curve cut replaces the rectangular outline with the path you draw; start and finish on an edge, and choose which side is waste.

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
- `features.ts` — bevel, taper, curve cuts, router, joinery, hardware, finish
- `reports.ts` — cut list, shopping list, fastener list
- `catalog.ts` — JSON and CSV

That split is where dadoes, rebates, routers, dowels, pocket screws and sheet nesting can land later without rewriting the viewport.
