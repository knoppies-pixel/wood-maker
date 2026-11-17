import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import * as THREE from "three";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommitNumber } from "./fields.tsx";
import { DEG, formatMm, formatZar } from "../domain/math.ts";
import { connectedIds } from "../domain/operations.ts";
import { cutList, fastenerList, profileLabel, shoppingList } from "../domain/reports.ts";
import type { Piece, Vec3Tuple } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi } from "../store/useUi.ts";
import { cn } from "cn";

export function Inspector() {
  const open = useUi((state) => state.inspectorOpen);
  const tab = useUi((state) => state.tab);
  const selection = useUi((state) => state.selection);
  const pieces = useProject((state) => state.pieces);
  const boards = useProject((state) => state.boards);
  const fasteners = useProject((state) => state.fasteners);
  const piece = pieces.find((item) => item.id === selection) ?? null;
  const cuts = cutList(boards, pieces);
  const shop = shoppingList(boards);
  const screws = fastenerList(fasteners, pieces);

  return (
    <aside
      className={cn(
        "z-20 w-[340px] shrink-0 flex-col border-l bg-card/92 backdrop-blur-sm",
        open ? "flex" : "hidden lg:flex",
        "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:shadow-2xl",
      )}
    >
      <Tabs value={tab} onValueChange={(value) => useUi.getState().setTab(value as typeof tab)} className="min-h-0 flex-1 gap-0">
        <div className="border-b px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="piece">Piece</TabsTrigger>
            <TabsTrigger value="cuts">Cuts</TabsTrigger>
            <TabsTrigger value="shop">Shop</TabsTrigger>
            <TabsTrigger value="screws">Screws</TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="piece" className="px-4 py-3">
            {piece ? <PiecePane piece={piece} joined={connectedIds(fasteners, piece.id).length > 1} /> : <ProjectPane />}
          </TabsContent>
          <TabsContent value="cuts" className="px-4 py-3">
            <CutPane rows={cuts} />
          </TabsContent>
          <TabsContent value="shop" className="px-4 py-3">
            <ShopPane lines={shop.lines} total={shop.total} />
          </TabsContent>
          <TabsContent value="screws" className="px-4 py-3">
            <ScrewPane lines={screws} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

function ProjectPane() {
  const name = useProject((state) => state.name);
  const kerf = useProject((state) => state.kerf);
  const count = useProject((state) => state.pieces.length);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-display text-xl leading-tight">Nothing selected</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {count === 0 ? "Add a length from the stock library, then saw, drill and screw it the way you would at the bench." : "Click a piece to inspect it, or open the cut and shopping lists."}
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Project</span>
        <Input value={name} onChange={(event) => useProject.getState().renameProject(event.target.value)} />
      </label>
      <CommitNumber label="Saw kerf" value={kerf} min={0.5} max={12} suffix="mm" onCommit={(value) => useProject.getState().setKerf(value)} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        A crosscut keeps the measured length and takes the kerf out of the offcut. At 45° the kerf uses a little more of the board, because the blade is tilted.
      </p>
    </div>
  );
}

function PiecePane({ piece, joined }: { piece: Piece; joined: boolean }) {
  const board = useProject((state) => state.boards.find((item) => item.id === piece.boardId));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Input
          value={piece.name}
          onChange={(event) => useProject.getState().renamePiece(piece.id, event.target.value)}
          className="font-display h-9 text-base"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{piece.species}</Badge>
          <Badge variant="outline" className="nums">
            {formatMm(piece.length)} × {formatMm(piece.width)} × {formatMm(piece.thickness)}
          </Badge>
          {joined ? <Badge>Assembly</Badge> : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          From {board?.name ?? piece.profileName}
          {board ? `, ${formatMm(board.length)} mm stick` : ""}. Length is the centreline.
          {(piece.mitreStart !== 0 || piece.mitreEnd !== 0) && " Long and short points are on the cut list."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <AxisField label="X" value={piece.position[0]} onCommit={(value) => move(piece, 0, value)} />
        <AxisField label="Y" value={piece.position[1]} onCommit={(value) => move(piece, 1, value)} />
        <AxisField label="Z" value={piece.position[2]} onCommit={(value) => move(piece, 2, value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <AxisField label="Rot X" suffix="°" value={piece.rotation[0] / DEG} onCommit={(value) => turn(piece, 0, value * DEG)} />
        <AxisField label="Rot Y" suffix="°" value={piece.rotation[1] / DEG} onCommit={(value) => turn(piece, 1, value * DEG)} />
        <AxisField label="Rot Z" suffix="°" value={piece.rotation[2] / DEG} onCommit={(value) => turn(piece, 2, value * DEG)} />
      </div>

      <div>
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Holes</div>
        {piece.holes.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Choose Drill and click a face.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {piece.holes.map((hole) => (
              <li key={hole.id} className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm">
                <span className="nums">
                  {hole.face} · ⌀{formatMm(hole.diameter)} · {hole.through ? "through" : `${formatMm(hole.depth)} deep`}
                </span>
                <Button variant="ghost" size="icon-xs" aria-label="Remove hole" onClick={() => useProject.getState().removeHole(piece.id, hole.id)}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        variant="destructive"
        onClick={() => {
          useProject.getState().deletePiece(piece.id);
          useUi.getState().select(null);
          toast("Piece removed. The board drops off the shopping list if nothing else came from it.");
        }}
      >
        <Trash2 /> Remove piece
      </Button>
    </div>
  );
}

function AxisField({ label, value, onCommit, suffix = "mm" }: { label: string; value: number; onCommit: (value: number) => void; suffix?: string }) {
  return <CommitNumber label={label} value={value} suffix={suffix} onCommit={onCommit} />;
}

function move(piece: Piece, axis: 0 | 1 | 2, value: number) {
  const delta = value - piece.position[axis];
  const ids = connectedIds(useProject.getState().fasteners, piece.id);
  const updates = ids.map((id) => {
    const member = useProject.getState().pieces.find((item) => item.id === id);
    if (!member) return null;
    const position = [...member.position] as Vec3Tuple;
    position[axis] += delta;
    return { id, position, rotation: member.rotation };
  }).filter((item): item is { id: string; position: Vec3Tuple; rotation: Vec3Tuple } => item !== null);
  useProject.getState().setTransforms(updates);
}

function turn(piece: Piece, axis: 0 | 1 | 2, radians: number) {
  const next = [...piece.rotation] as Vec3Tuple;
  next[axis] = radians;
  const before = new THREE.Quaternion().setFromEuler(new THREE.Euler(...piece.rotation, "XYZ"));
  const after = new THREE.Quaternion().setFromEuler(new THREE.Euler(...next, "XYZ"));
  const delta = after.multiply(before.invert());
  const origin = new THREE.Vector3(...piece.position);
  const ids = connectedIds(useProject.getState().fasteners, piece.id);
  const updates = ids.map((id) => {
    const member = useProject.getState().pieces.find((item) => item.id === id);
    if (!member) return null;
    if (id === piece.id) return { id, position: piece.position, rotation: next };
    const position = new THREE.Vector3(...member.position).sub(origin).applyQuaternion(delta).add(origin);
    const quaternion = delta.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...member.rotation, "XYZ")));
    const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
    return {
      id,
      position: [position.x, position.y, position.z] as Vec3Tuple,
      rotation: [euler.x, euler.y, euler.z] as Vec3Tuple,
    };
  }).filter((item): item is { id: string; position: Vec3Tuple; rotation: Vec3Tuple } => item !== null);
  useProject.getState().setTransforms(updates);
}

function CutPane({ rows }: { rows: ReturnType<typeof cutList> }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">The cut list fills in as soon as a board is on the bench. Each part remembers which purchased length it came from.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {rows.map((board) => (
        <article key={board.boardId} className="rounded-xl border bg-background/60 p-3">
          <div className="text-sm font-semibold">{board.stockName}</div>
          <div className="nums text-xs text-muted-foreground">
            {profileLabel(board.thickness, board.width)} · bought {formatMm(board.boardLength)} mm · {formatZar(board.price)}
          </div>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="py-1 font-medium">Part</th>
                <th className="py-1 font-medium">Finished</th>
              </tr>
            </thead>
            <tbody>
              {board.parts.map((part) => (
                <tr key={part.pieceId} className="border-t align-top">
                  <td className="py-1.5 pr-2">{part.name}</td>
                  <td className="nums py-1.5">
                    {formatMm(part.length)} × {formatMm(part.width)} × {formatMm(part.thickness)}
                    {(part.mitreStart !== 0 || part.mitreEnd !== 0) && (
                      <div className="text-[11px] text-muted-foreground">
                        mitre {formatMm(part.mitreStart, 0)}° / {formatMm(part.mitreEnd, 0)}° · long {formatMm(part.longPoint)} · short {formatMm(part.shortPoint)}
                      </div>
                    )}
                    {part.holes > 0 && <div className="text-[11px] text-muted-foreground">{part.holes} hole{part.holes === 1 ? "" : "s"}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Kerf and discarded length: {formatMm(board.discarded)} mm</p>
        </article>
      ))}
    </div>
  );
}

function ShopPane({ lines, total }: { lines: ReturnType<typeof shoppingList>["lines"]; total: number }) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">The shopping list counts boards you pulled from the catalogue, not the offcuts you sawed off them.</p>;
  }
  return (
    <div>
      <div className="font-display nums text-3xl leading-none">{formatZar(total)}</div>
      <p className="mt-1 text-xs text-muted-foreground">Estimated timber, from the catalogue. Screws are listed separately and not priced.</p>
      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="py-1 font-medium">Buy</th>
            <th className="py-1 font-medium">Qty</th>
            <th className="py-1 text-right font-medium">Line</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className="border-t">
              <td className="py-1.5 pr-2">
                <div>{line.name}</div>
                <div className="nums text-[11px] text-muted-foreground">{formatMm(line.length)} mm · {formatZar(line.unitPrice)} each</div>
              </td>
              <td className="nums py-1.5">{line.quantity}</td>
              <td className="nums py-1.5 text-right">{formatZar(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScrewPane({ lines }: { lines: ReturnType<typeof fastenerList> }) {
  const fasteners = useProject((state) => state.fasteners);
  if (fasteners.length === 0) {
    return <p className="text-sm text-muted-foreground">Butt two pieces, choose Screw, and click the outside face. The screw has to be long enough to reach the second piece.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line) => (
        <article key={line.key} className="rounded-xl border p-3">
          <div className="flex items-baseline justify-between">
            <div className="font-semibold">{line.label} mm</div>
            <div className="nums text-sm">{line.quantity}</div>
          </div>
          <ul className="mt-1 text-xs text-muted-foreground">
            {line.joints.map((joint, index) => (
              <li key={`${joint}-${index}`}>{joint}</li>
            ))}
          </ul>
        </article>
      ))}
      <ul className="flex flex-col gap-1">
        {fasteners.map((fastener) => (
          <li key={fastener.id} className="flex items-center justify-between text-sm">
            <span className="nums text-muted-foreground">⌀{formatMm(fastener.diameter)} × {formatMm(fastener.length)}</span>
            <Button variant="ghost" size="xs" onClick={() => useProject.getState().removeFastener(fastener.id)}>
              Unscrew
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
