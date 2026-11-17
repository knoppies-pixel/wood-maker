import { Download, RotateCcw, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { catalogToCsv, parseCatalog, parseCatalogCsv } from "../domain/catalog.ts";
import { formatZar } from "../domain/math.ts";
import { downloadText } from "../domain/project-io.ts";
import type { StockItem } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi } from "../store/useUi.ts";
import { cn } from "cn";

export function StockPanel() {
  const catalog = useProject((state) => state.catalog);
  const addStock = useProject((state) => state.addStock);
  const setCatalog = useProject((state) => state.setCatalog);
  const resetCatalog = useProject((state) => state.resetCatalog);
  const open = useUi((state) => state.stockOpen);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupCatalog(catalog, query), [catalog, query]);

  function add(item: StockItem, length: number) {
    const result = addStock(item.id, length);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (result.selectId) useUi.getState().select(result.selectId);
    toast.success(result.message ?? "Stock added");
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = readCatalog(text, file.name);
      if ("error" in parsed) {
        toast.error(parsed.error);
        return;
      }
      setCatalog(parsed.items);
      toast.success(`Catalogue replaced with ${parsed.items.length} stock lines.`);
    };
    reader.readAsText(file);
  }

  return (
    <aside
      className={cn(
        "z-20 w-[300px] shrink-0 flex-col border-r border-border/80 bg-card/90 backdrop-blur-sm",
        open ? "flex" : "hidden lg:flex",
        "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-2xl",
      )}
    >
      <div className="border-b px-4 py-3">
        <div className="font-display text-lg leading-none">Stock</div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">Pick a length. It lands on the bench full size, in millimetres.</p>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pine, 38×76, plywood…"
          className="mt-3"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-3 py-3">
          {groups.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">Nothing in the catalogue matches that.</p>
          ) : (
            groups.map((group) => (
              <section key={group.species}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="size-2.5 rounded-full" style={{ background: swatch(group.species) }} />
                  <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.species}</h2>
                </div>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <article key={item.id} className="rounded-xl border bg-background/70 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{item.name}</div>
                          <div className="nums text-xs text-muted-foreground">
                            {item.thickness} × {item.width} mm
                          </div>
                        </div>
                        {item.sheet ? <Badge variant="secondary">Sheet</Badge> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.lengths.map((length) => (
                          <button
                            key={length.length}
                            type="button"
                            onClick={() => add(item, length.length)}
                            className="nums rounded-lg border bg-card px-2 py-1 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                          >
                            <div className="text-xs font-semibold">{length.length} mm</div>
                            <div className="text-[11px] text-muted-foreground">{formatZar(length.price)}</div>
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </ScrollArea>
      <div className="flex flex-col gap-2 border-t px-3 py-3">
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">Prices are planning estimates in rand, not a live quote.</p>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadText("benchwork-stock.json", JSON.stringify({ items: catalog }, null, 2))}>
            <Download /> JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => downloadText("benchwork-stock.csv", catalogToCsv(catalog), "text/csv")}>
            CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { resetCatalog(); toast.success("Sample catalogue restored."); }}>
            <RotateCcw /> Reset
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) importFile(file);
          }}
        />
      </div>
    </aside>
  );
}

function groupCatalog(catalog: StockItem[], query: string): Array<{ species: string; items: StockItem[] }> {
  const needle = query.trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, "");
  const filtered = catalog.filter((item) => {
    if (!needle) return true;
    const hay = `${item.name} ${item.species} ${item.thickness}x${item.width} ${item.width}x${item.thickness} ${item.lengths.map((length) => length.length).join(" ")}`
      .toLowerCase()
      .replace(/×/g, "x")
      .replace(/\s+/g, "");
    return hay.includes(needle);
  });
  const order: string[] = [];
  const map = new Map<string, StockItem[]>();
  for (const item of filtered) {
    if (!map.has(item.species)) {
      map.set(item.species, []);
      order.push(item.species);
    }
    map.get(item.species)?.push(item);
  }
  return order.map((species) => ({ species, items: map.get(species) ?? [] }));
}

function swatch(species: string): string {
  const key = species.toLowerCase();
  if (key.includes("meranti")) return "#c4623e";
  if (key.includes("ply")) return "#d7b98a";
  if (key.includes("mdf")) return "#cbb89a";
  if (key.includes("supa")) return "#f4f1ea";
  if (key.includes("saligna")) return "#d19b4c";
  return "#e7c88c";
}

function readCatalog(text: string, filename: string): { items: StockItem[] } | { error: string } {
  const looksCsv = filename.toLowerCase().endsWith(".csv") || text.trim().toLowerCase().startsWith("name,") || text.includes("thickness_mm");
  if (looksCsv) return parseCatalogCsv(text);
  try {
    return parseCatalog(JSON.parse(text));
  } catch {
    return parseCatalogCsv(text);
  }
}
