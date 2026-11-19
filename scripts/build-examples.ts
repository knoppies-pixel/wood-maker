/**
 * Writes the example projects into public/examples.
 * Run with: node --experimental-strip-types scripts/build-examples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { defaultCatalog } from "../src/domain/catalog.ts";
import { buildSawhorse, buildWorkbench, summary } from "../src/domain/example-builds.ts";
import { serializeProject } from "../src/domain/project-io.ts";

const catalog = defaultCatalog();
const sawhorse = buildSawhorse(catalog);
const workbench = buildWorkbench(catalog);
mkdirSync("public/examples", { recursive: true });
writeFileSync("public/examples/stackable-sawhorse.json", serializeProject(sawhorse));
writeFileSync("public/examples/mitre-saw-workbench.json", serializeProject(workbench));
const text = `${summary(sawhorse)}\n\n${summary(workbench)}\n`;
writeFileSync("/tmp/example-summary.txt", text);
console.log(text);
