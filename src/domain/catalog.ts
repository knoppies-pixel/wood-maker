import catalogFile from "../data/stock-catalog.json" with { type: "json" };
import type { StockItem, StockLength } from "./types.ts";

interface RawCatalog {
  items?: unknown;
}

export function defaultCatalog(): StockItem[] {
  const parsed = parseCatalog(catalogFile);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.items;
}

export function parseCatalog(input: unknown): { items: StockItem[] } | { error: string } {
  const rows = unwrap(input);
  if (!rows) return { error: "Catalogue must be a JSON array, or an object with an items array." };
  const items: StockItem[] = [];
  for (const row of rows) {
    const parsed = parseItem(row);
    if ("error" in parsed) return parsed;
    const existing = items.find((item) => item.id === parsed.item.id);
    if (existing) {
      for (const length of parsed.item.lengths) {
        if (!existing.lengths.some((have) => have.length === length.length)) existing.lengths.push(length);
      }
      existing.lengths.sort((a, b) => a.length - b.length);
    } else {
      items.push(parsed.item);
    }
  }
  if (items.length === 0) return { error: "No stock items found in that file." };
  return { items };
}

export function parseCatalogCsv(text: string): { items: StockItem[] } | { error: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { error: "CSV needs a header row and at least one stock row." };
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const index = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const idCol = index(["id"]);
  const nameCol = index(["name"]);
  const speciesCol = index(["species", "material"]);
  const thicknessCol = index(["thickness", "thickness_mm", "t"]);
  const widthCol = index(["width", "width_mm", "w"]);
  const lengthCol = index(["length", "length_mm", "lengths", "lengths_mm"]);
  const priceCol = index(["price", "price_zar", "prices", "prices_zar"]);
  const sheetCol = index(["sheet", "sheet_good"]);
  if ([nameCol, speciesCol, thicknessCol, widthCol, lengthCol, priceCol].some((col) => col < 0)) {
    return {
      error: "CSV headers must include name, species, thickness_mm, width_mm, length_mm (or lengths_mm), and price_zar.",
    };
  }
  const items: StockItem[] = [];
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    if (row.every((cell) => cell.trim() === "")) continue;
    const lengths = pairLengths(row[lengthCol] ?? "", row[priceCol] ?? "");
    if ("error" in lengths) return { error: `Row ${rowIndex + 1}: ${lengths.error}` };
    const thickness = Number(row[thicknessCol]);
    const width = Number(row[widthCol]);
    if (!(thickness > 0) || !(width > 0)) return { error: `Row ${rowIndex + 1}: thickness and width must be millimetres above zero.` };
    const id = (idCol >= 0 ? row[idCol] : "").trim() || slug(`${row[speciesCol]}-${thickness}x${width}`);
    items.push({
      id,
      name: row[nameCol].trim() || `${row[speciesCol]} ${thickness}×${width}`,
      species: row[speciesCol].trim() || "Timber",
      thickness,
      width,
      sheet: sheetCol >= 0 ? /^(1|true|yes|sheet)$/i.test(row[sheetCol].trim()) : width >= 600,
      lengths: lengths.lengths,
    });
  }
  return parseCatalog(items);
}

export function catalogToCsv(items: StockItem[]): string {
  const lines = ["id,name,species,thickness_mm,width_mm,length_mm,price_zar,sheet"];
  for (const item of items) {
    for (const length of item.lengths) {
      lines.push(
        [
          item.id,
          csvCell(item.name),
          csvCell(item.species),
          item.thickness,
          item.width,
          length.length,
          length.price,
          item.sheet ? "true" : "false",
        ].join(","),
      );
    }
  }
  return lines.join("\n");
}

function unwrap(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray((input as RawCatalog).items)) {
    return (input as { items: unknown[] }).items;
  }
  return null;
}

function parseItem(row: unknown): { item: StockItem } | { error: string } {
  if (!row || typeof row !== "object") return { error: "Each stock item must be an object." };
  const record = row as Record<string, unknown>;
  const thickness = numberField(record, ["thickness", "thickness_mm"]);
  const width = numberField(record, ["width", "width_mm"]);
  const name = stringField(record, ["name"]);
  const species = stringField(record, ["species", "material"]);
  if (!name || !species || thickness === null || width === null || thickness <= 0 || width <= 0) {
    return { error: "Each item needs name, species, thickness and width in millimetres." };
  }
  const lengths = parseLengths(record.lengths ?? record.lengths_mm, record.prices ?? record.price ?? record.price_zar);
  if ("error" in lengths) return lengths;
  const id = stringField(record, ["id"]) || slug(`${species}-${thickness}x${width}`);
  const sheetValue = record.sheet;
  return {
    item: {
      id,
      name,
      species,
      thickness,
      width,
      sheet: sheetValue === true || sheetValue === "true" || width >= 600,
      lengths: lengths.lengths,
    },
  };
}

function parseLengths(lengths: unknown, prices: unknown): { lengths: StockLength[] } | { error: string } {
  if (Array.isArray(lengths) && lengths.every((item) => typeof item === "object" && item)) {
    const parsed: StockLength[] = [];
    for (const entry of lengths) {
      const record = entry as Record<string, unknown>;
      const length = Number(record.length ?? record.length_mm);
      const price = Number(record.price ?? record.price_zar ?? 0);
      if (!(length > 0) || price < 0 || Number.isNaN(price)) return { error: "Each length needs a positive length and a price in ZAR." };
      parsed.push({ length, price });
    }
    if (parsed.length === 0) return { error: "Each item needs at least one length." };
    return { lengths: parsed.sort((a, b) => a.length - b.length) };
  }
  if (typeof lengths === "string" || typeof lengths === "number") {
    return pairLengths(String(lengths), prices === undefined ? "" : String(prices));
  }
  if (Array.isArray(lengths) && Array.isArray(prices)) {
    return pairLengths(lengths.join("|"), prices.join("|"));
  }
  return { error: "Lengths must be a list of { length, price } or pipe-separated numbers." };
}

function pairLengths(lengthText: string, priceText: string): { lengths: StockLength[] } | { error: string } {
  const lengths = lengthText.split(/[|;]/).map((part) => Number(part.trim())).filter((n) => !Number.isNaN(n));
  const prices = priceText.split(/[|;]/).map((part) => Number(part.trim())).filter((n) => !Number.isNaN(n));
  if (lengths.length === 0) return { error: "No lengths were given." };
  if (prices.length !== lengths.length) return { error: "Each length needs a matching price." };
  if (lengths.some((length) => length <= 0) || prices.some((price) => price < 0)) {
    return { error: "Lengths must be positive and prices cannot be negative." };
  }
  return {
    lengths: lengths.map((length, index) => ({ length, price: prices[index] ?? 0 })).sort((a, b) => a.length - b.length),
  };
}

function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (record[key] !== undefined) {
      const value = Number(record[key]);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

function stringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stock";
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
