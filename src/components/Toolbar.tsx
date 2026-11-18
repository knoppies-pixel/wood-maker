import {
  CircleHelp,
  Download,
  FolderOpen,
  Move3D,
  PanelLeft,
  PanelRight,
  Pencil,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DrillIcon, SawIcon, ScrewIcon } from "./icons.tsx";
import { downloadText, parseProject, saveStoredProject } from "../domain/project-io.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type ToolId } from "../store/useUi.ts";
import { cn } from "cn";

const examples = [
  { file: "stackable-sawhorse.json", label: "Stackable sawhorse" },
  { file: "mitre-saw-workbench.json", label: "Mitre saw workbench" },
] as const;

const tools: Array<{ id: ToolId; label: string; hint: string; key: string }> = [
  { id: "select", label: "Move", hint: "Select. G grab, R rotate, S scale", key: "V" },
  { id: "saw", label: "Saw", hint: "Crosscut, rip, taper, curve or plunge. Click the board or press Enter", key: "K" },
  { id: "drill", label: "Drill", hint: "Twist, countersink, Forstner, hole saw", key: "D" },
  { id: "router", label: "Router", hint: "Dado, groove, rebate or the edge under the cursor", key: "T" },
  { id: "joint", label: "Joint", hint: "Mortise and tenon, half-lap, dovetail, dowels", key: "J" },
  { id: "screw", label: "Fasten", hint: "Screws, pocket screws, bolts and glue", key: "Y" },
  { id: "hardware", label: "Hardware", hint: "Hinges, slides, brackets, castors and bolts", key: "H" },
  { id: "pencil", label: "Pencil", hint: "Lines and freehand marks that stay on the face", key: "P" },
  { id: "measure", label: "Measure", hint: "Tape, speed square and combination square", key: "M" },
];

async function loadExample(file: string, label: string): Promise<void> {
  try {
    const response = await fetch(`/examples/${file}`);
    if (!response.ok) {
      toast.error("That example is not in this build.");
      return;
    }
    const parsed = parseProject(await response.json(), useProject.getState().catalog);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    useProject.getState().replaceProject(parsed.project);
    useUi.getState().select(null);
    toast.success(`${label} loaded. Undo puts your previous bench back.`);
  } catch {
    toast.error("Could not load that example.");
  }
}

export function Toolbar() {
  const name = useProject((state) => state.name);
  const tool = useUi((state) => state.tool);
  const setTool = useUi((state) => state.setTool);
  const fileRef = useRef<HTMLInputElement>(null);
  const canUndo = useStore(useProject.temporal, (state) => state.pastStates.length > 0);
  const canRedo = useStore(useProject.temporal, (state) => state.futureStates.length > 0);

  function save() {
    const project = useProject.getState().snapshot();
    downloadText(`${slug(project.name)}.json`, JSON.stringify(project, null, 2));
    toast.success("Project file downloaded. It also stays in this browser.");
  }

  function openFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseProject(JSON.parse(String(reader.result ?? "")), useProject.getState().catalog);
        if ("error" in parsed) {
          toast.error(parsed.error);
          return;
        }
        useProject.getState().replaceProject(parsed.project);
        useUi.getState().select(null);
        toast.success(`Opened ${parsed.project.name}.`);
      } catch {
        toast.error("That file is not a Benchwork project.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <header className="z-30 flex items-center gap-2 overflow-x-auto border-b bg-card px-3 py-1.5">
      <div className="mr-1 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => useUi.getState().setStockOpen(!useUi.getState().stockOpen)} aria-label="Stock library">
          <PanelLeft />
        </Button>
        <span className="grid size-7 place-items-center rounded-md bg-primary text-[12px] font-bold tracking-tight text-primary-foreground">B</span>
        <div>
          <div className="text-[15px] leading-none font-semibold tracking-tight">Benchwork</div>
          <div className="mt-0.5 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Workshop</div>
        </div>
      </div>

      <div className="mx-auto flex items-center gap-0.5 rounded-lg border border-border bg-background/70 p-0.5">
        {tools.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={tool === item.id}
                onClick={() => setTool(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  tool === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <ToolGlyph id={item.id} />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {item.hint} · {item.key}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 hidden max-w-40 truncate text-sm text-muted-foreground xl:inline">{name}</span>
        <IconButton label="Shortcuts (?)" onClick={() => useUi.getState().setCheatOpen(true)}>
          <CircleHelp />
        </IconButton>
        <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useProject.temporal.getState().undo()}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useProject.temporal.getState().redo()}>
          <Redo2 />
        </IconButton>
        <SnapToggles />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">Project</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>This bench</DropdownMenuLabel>
            <DropdownMenuItem onSelect={save}>
              <Download /> Export JSON
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <FolderOpen /> Open JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                saveStoredProject(useProject.getState().snapshot());
                toast.success("Saved in this browser.");
              }}
            >
              <Save /> Save here
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                useProject.getState().loadSample();
                useUi.getState().select(null);
                toast.success("Sample frame loaded. Undo puts your previous bench back.");
              }}
            >
              <RotateCw /> Sample frame
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Examples</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {examples.map((example) => (
                  <DropdownMenuItem key={example.file} onSelect={() => void loadExample(example.file, example.label)}>
                    {example.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                useProject.getState().newProject();
                useUi.getState().select(null);
                toast("Bench cleared.");
              }}
            >
              <Trash2 /> New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => useUi.getState().setInspectorOpen(!useUi.getState().inspectorOpen)} aria-label="Inspector">
          <PanelRight />
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) openFile(file);
        }}
      />
    </header>
  );
}

function ToolGlyph({ id }: { id: ToolId }) {
  if (id === "saw") return <SawIcon className="size-4" />;
  if (id === "drill") return <DrillIcon className="size-4" />;
  if (id === "pencil") return <Pencil className="size-4" />;
  if (id === "measure") return <Ruler className="size-4" />;
  if (id === "screw" || id === "joint" || id === "hardware" || id === "router") return <ScrewIcon className="size-4" />;
  return <Move3D className="size-4" />;
}

function IconButton({
  label,
  children,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={pressed ? "secondary" : "ghost"} size="icon" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SnapToggles() {
  const grid = useUi((state) => state.snapGrid);
  const faces = useUi((state) => state.snapFaces);
  const vertices = useUi((state) => state.snapVertices);
  const midpoints = useUi((state) => state.snapMidpoints);
  const edges = useUi((state) => state.snapEdges);
  const centres = useUi((state) => state.snapCentres);
  const marks = useUi((state) => state.snapMarks);
  const dimensions = useUi((state) => state.snapDimensions);
  const items = [
    ["Vtx", "Vertices", vertices, (on: boolean) => useUi.getState().setSnapVertices(on)],
    ["Mid", "Edge midpoints", midpoints, (on: boolean) => useUi.getState().setSnapMidpoints(on)],
    ["Edge", "Edges", edges, (on: boolean) => useUi.getState().setSnapEdges(on)],
    ["Ctr", "Face centres", centres, (on: boolean) => useUi.getState().setSnapCentres(on)],
    ["Face", "Faces, for butting pieces", faces, (on: boolean) => useUi.getState().setSnapFaces(on)],
    ["Grid", "Grid", grid, (on: boolean) => useUi.getState().setSnapGrid(on)],
    ["Mark", "Pencil marks", marks, (on: boolean) => useUi.getState().setSnapMarks(on)],
    ["Dim", "Dimension points", dimensions, (on: boolean) => useUi.getState().setSnapDimensions(on)],
  ] as const;
  return (
    <div className="hidden items-center gap-0.5 rounded-lg border bg-background/70 p-0.5 lg:flex">
      {items.map(([label, hint, on, set]) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => set(!on)}
              className={cn("rounded-md px-1.5 py-1 text-[10px] font-semibold tracking-wide", on ? "bg-secondary text-foreground ring-1 ring-primary/80" : "text-muted-foreground hover:bg-muted")}
            >
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent>{hint}. Hold Ctrl to suspend snapping.</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "benchwork";
}
