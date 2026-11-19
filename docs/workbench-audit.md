# Mitre-saw workbench geometry audit

Measured from the metric assembly drawings (pages 14–28, 32, 35–40 and 52). Dimensions below are finished millimetres. This file records the model, not the plan’s wording or artwork.

## Axes

The drawings are described here as:

- **X** along the 2400 mm bench. The wing / table-saw end (leg B) is X = 0. The far end (leg A) is X = 2400.
- **Y** across the 1200 mm depth. The mitre-saw face is Y = 0. The back is Y = 1200.
- **Z** up from the floor.

The app uses a different world, and the regression test asserts that world:

- App **X** is depth. The mitre-saw face is −X (outer face −600). The back is +X (outer face +600).
- App **Y** is up.
- App **Z** is the length. The wing end is Z = −1200. The far end is Z = +1200.

Convert with `appZ = X − 1200`, `appX = Y − 600`, `appY = Z`.

“On edge” means the 90 mm face is vertical and the 35 mm face is the thickness in plan. “Flat” means the wide face is horizontal and 17 mm (ply) or 35 mm (pine) is the height.

## What the previous model got wrong

- Leg C sat at X = 1435 (app Z = 235). The floor notches put it at X = 1125 (app Z = −75).
- Every leg stood on the floor and ran up to Z = 863, so it passed through the bottom rail and stopped short of the top rail. The 863 mm length is the leg **above** the 90 mm bottom rail. The ear reaches Z = 953.
- The laminated pair sat entirely inboard. The outer 35 mm board is flush with the side (outer face at Y = 0 and Y = 1200).
- Legs were two plain 863 mm rectangles. The elevation shows a top ear (35×90 on B, E and A; 17×180 on C and D) and a bottom half-lap cheek on the inner board of A, B and E.
- The top end rail was 1200 mm and occupied the same corner as the side rails. It is now cut to 1060 mm so it butts the inner faces of the top side rails.
- Top side rails sat on the outer face, in the same volume as the ears. They now sit on the inner lamination, 35 mm inboard, and the ear stands proud.
- The back-rail notch was the right station (85 mm, centred 682.5 mm from the wing end) but did not cross the top edge. The extra notch on the front rail is gone.
- The mitre opening sat near the middle of the main top. It is 824 × 670, 403 mm from the far end of the main top, and 150 mm back from the front edge.
- The table-saw shelf floated near Z = 250. It is raised so a 330 mm saw meets the benchtop. Cradle members that shared a volume with the top-frame returns now sit 90 mm under them.
- Flip supports were vertical and the right length, but at the wrong stations along the bench. They now sit just inside the opening.
- The drawer was pulled out past the front face. It now sits in the bay under the main top, sides along the bench, opening toward the mitre face.

## Step 1 — bottom frame

All members on edge. Clear bays from the wing end: 650, 410, 565, 600. The 410 mm bay is the one the drawing does not dimension; it is what is left after 650 + 565 + 600 and five 35 mm members.

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| Side ×2 | 35×90 pine | 2400 | on edge | X | Outer faces at Y = 0 and Y = 1200. Z = 0 to 90. |
| End ×2 | 35×90 pine | 1130 | on edge | Y | Between the sides (Y = 35 to 1165). At X = 0–35 and X = 2365–2400. |
| Noggin ×3 | 35×90 pine | 1130 | on edge | Y | Centres at X = 702.5, 1147.5 and 1747.5. |

App centres: sides (±582.5, 45, 0), ends (0, 45, ±1182.5), noggins (0, 45, −497.5 / −52.5 / 547.5). Sizes 35×90×2400 and 1130×90×35.

## Step 2 — legs

Ten posts, five a side. Each post is two 35 mm boards face-laminated to 70 mm across the depth. The 90 mm face runs along the bench. Feet start at Z = 90. Ears reach Z = 953.

Stations from the wing end, outer face to outer face of the 90 mm leg: 0–90, 560–650, 1080–1170, 2000–2090, 2310–2400. Centres: B 45, E 605, C 1125, D 2045, A 2355.

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| Outer board ×10 | 35×90 pine | 863 | on edge, ear up | Z | Flush with the side. Top ear: 35×90 toward the wing end on B and E, 35×90 toward the far end on A, 17 mm wide by 180 tall and centred on C and D. A, B and E also have a 35 mm cheek in the bottom 90 mm. |
| Inner board ×10 | 35×90 pine | 683 | on edge | Z | 35 mm inboard. This is the plain board between the shoulders. On A, B and E it runs Z = 180 to 863. On C and D it runs Z = 90 to 773, stopping under the 180 mm ear. |

App centres: outer X = ±582.5, Y = 521.5 (box 35 × 863 × 90). Inner X = ±547.5. Inner Y = 521.5 on A, B and E, and Y = 431.5 on C and D (box 35 × 683 × 90). Z = −1155, −595, −75, 845, 1155. The ear and the cheek are openings in the outer board, so that stock box does not shrink. Leg ears and the shorter inner boards are cut from the same ten sticks (863 + 683), so the buy stays 22.

## Step 3 — floor

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| Bottom shelf | 17 mm ply | 2400 × 1200 | flat | X | On the rails, Z = 90 to 107. Notches 70 mm in from both long edges and 90 mm along X at each leg station. |

App centre (0, 98.5, 0). The four castors hang under the bottom side rails at the corners, on the floor.

## Step 4 — top frame

Rails on edge, top at Z = 953, so they sit beside the ears. Side rails are on the inner board (Y = 35 to 70 and Y = 1130 to 1165), not on the outer face.

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| Back rail | 35×90 pine | 2400 | on edge | X | Back inner board. Top-edge notch 50 mm deep × 85 mm, centred 682.5 mm from the wing end. |
| Front rail | 35×90 pine | 1170 | on edge | X | Front inner board, from the wing end to X = 1170. |
| End rail | 35×90 pine | 1060 | on edge | Y | Far end. Cut to the clear distance between the inboard side rails (Y = 70 to 1130). The drawing’s bar is 1200; that length overlaps the sides, so it is coped. |
| Wing return | 35×90 pine | 370 | on edge | Y | Wing end, under the wide wing, butted to the back rail. |
| Front return | 35×90 pine | 250 | on edge | Y | Wing end, under the narrow wing, butted to the front rail. |
| Far return | 35×90 pine | 400 | on edge | X | Front, at the far end, butted to the end rail. |

## Step 5 — table-saw shelf

In the wing end, between the end and leg E. Rails on edge. The shelf is high enough that a 330 mm saw reaches the benchtop (shelf top at Z = 657).

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| End rail | 35×90 pine | 1060 | on edge | Y | Wing end of the bay. |
| End rail | 35×90 pine | 990 | on edge | Y | Inner end of the bay. |
| Side ×2 | 35×90 pine | 615 | on edge | X | Joining the two ends. |
| Shelf | 17 mm ply | 990 × 525 | flat | X | On the rails. |
| Lip ×4 | 19×42 DAR | 990, 990, 467, 467 | on edge | around the shelf | On the ply edges. |

## Step 6 — cradle under the wings

Same cut lengths as before. The 370 and 250 rails are a second layer 90 mm under the top-frame returns, not the same boards. The 560 mm sides run along X under each wing. Front legs (312) and plain legs (222) stand on the shelf.

## Step 7 — tops

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| Main top | 17 mm ply | 1840 × 1200 | flat | X | From X = 560 to 2400. Bears on the ears and overhangs the inboard rails by 35 mm. |
| Wide wing | 17 mm ply | 475 × 370 | flat | X | Back corner at the wing end. |
| Narrow wing | 17 mm ply | 475 × 250 | flat | X | Front corner at the wing end. |

The opening in the main top is 824 along X and 670 along Y. Its far edge is 403 mm from the far end of the main top, so it runs X = 1173 to 1997. Its front edge is 150 mm back from the bench front (Y = 150 to 820). The lid is that offcut, set back in the opening.

## Step 8 — flip

| Part | Stock | Length | Face up | Long axis | Position |
| --- | --- | --- | --- | --- | --- |
| Support ×2 | 17 mm ply | 1130 × 180 | vertical | Y | Just inside the opening’s X edges, hung from the underside of the top. Round-ended slot. |
| Pipe | 25 mm | 875 | round | Y | In the slots, centred on the opening. |
| Rear board | 17 mm ply | 830 × 117 | vertical | Y | Across the opening. |
| Platform | 17 mm ply | 824 × 670 | flat | X | In the opening, lowered. |
| Frame ends and rails | 17 mm ply | 670 and 786 | vertical | around the platform | On the opening edges. |

## Step 9 — drawer

Sides along the bench, opening toward the mitre face, in the bay under the main top (not pulled out past the front). Cut sizes are unchanged: sides 988, ends 486, bottom 954 × 486, front 1056 × 350. See the deviations below.

## Shopping list

Unchanged, because every geometric fix kept the same cross-cuts and the same stick order:

- 22 × pine 35×90×2400
- 3 × DAR 19×42×2400
- 4 × formply 17×1200×2400
- 1 × pipe 25×25×1200
- Screws 156×4.5×60, 123×4×30, 38×4×16, 38×4×20, 2×4×40
- Pocket screws 6×4×32 and 12×4×64, roofing screws 4×6.5×60, bolts 32×M10×90
- 38 angle brackets, 4 castors, 6 bumpers, 2 slides, 1 pull, 2 barrel bolts

The top end rail changed from 1200 mm to 1060 mm. It still shares a stick with the 1170 mm front rail (1170 + 3 + 1060 = 2233), so the buy stays three top sticks. Each leg stick is now one 863 mm outer board and one 683 mm inner board. The offcut is sealed out of the pool, so the ten leg sticks are unchanged and nothing else picks up the scrap. Ears and cheeks are plunges on the outer board.

## Remaining deviations

- The fourth bottom-frame bay, 410 mm, is the undimensioned remainder.
- The drawn top end rail is 1200 mm overall. The model cuts it to 1060 mm so it fits between the inboard side rails instead of running through them.
- Top side rails are drawn on the outer face. They are modelled 35 mm inboard so the outer ear can stand proud of the rail. The benchtop stays 1200 mm wide and overhangs them.
- DAR edge pieces are 937, 937, 1267 and a 1130 end. Those are the lengths that nest on three sticks; cutting them back to the round plan figures buys a fourth stick.
- The drawer’s panel sizes are the previous nesting sizes, not the 1050 × 353 / 553 × 353 carcass on the drawer sheet. Resizing them does not fit the fourth ply sheet. Orientation and bay are corrected; the panels are not.
- 4×100 mm temporary bolts, 35 mm nails and the extra castor screws are not in the numbered fastener list.
- The two saws are reference blocks (90 mm base, 330 mm table-saw height, 578 mm width). They are not in the shopping total.
- The sawhorse stands at 761.8 mm against a 760 mm long point.
- Prices are catalogue estimates.
