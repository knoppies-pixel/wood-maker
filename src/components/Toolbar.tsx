import {
  Download,
  FolderOpen,
  Magnet,
  Move3D,
  PanelLeft,
  PanelRight,
  Redo2,
  RotateCw,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DrillIcon, SawIcon, ScrewIcon } from "./icons.tsx";
import { downloadText, parseProject, saveStoredProject } from "../domain/project-io.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type ToolId } from "../store/useUi.ts";
import { cn } from "cn";

const tools: Array<{ id: ToolId; label: string; hint: string; key: string }> = [
  { id: "select", label: "Move", hint: "Select, move and rotate", key: "1" },
  { id: "saw", label: "Saw", hint: "Crosscut or rip, with kerf", key: "2" },
  { id: "drill", label: "Drill", hint: "Bore a hole in a face", key: "3" },
  { id: "screw", label: "Screw", hint: "Join two touching pieces", key: "4" },
];

export function Toolbar() {
  const name = useProject((state) => state.name);
  const tool = useUi((state) => state.tool);
  const setTool = useUi((state) => state.setTool);
  const snapGrid = useUi((state) => state.snapGrid);
  const snapFaces = useUi((state) => state.snapFaces);
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
    <header className="z-30 flex flex-wrap items-center gap-2 border-b bg-card/85 px-3 py-2 backdrop-blur-md">
      <div className="mr-1 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => useUi.getState().setStockOpen(!useUi.getState().stockOpen)} aria-label="Stock library">
          <PanelLeft />
        </Button>
        <div>
          <div className="font-display text-[1.35rem] leading-none tracking-tight">Benchwork</div>
          <div className="text-[11px] text-muted-foreground">Design from the board</div>
        </div>
      </div>

      <div className="mx-auto flex items-center gap-1 rounded-xl border bg-background/80 p-1">
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
        <IconButton label="Undo" disabled={!canUndo} onClick={() => useProject.temporal.getState().undo()}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" disabled={!canRedo} onClick={() => useProject.temporal.getState().redo()}>
          <Redo2 />
        </IconButton>
        <IconButton label={snapGrid ? "Grid snap on" : "Grid snap off"} pressed={snapGrid} onClick={() => useUi.getState().setSnapGrid(!snapGrid)}>
          <Move3D />
        </IconButton>
        <IconButton label={snapFaces ? "Face snap on" : "Face snap off"} pressed={snapFaces} onClick={() => useUi.getState().setSnapFaces(!snapFaces)}>
          <Magnet />
        </IconButton>
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
  if (id === "screw") return <ScrewIcon className="size-4" />;
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

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "benchwork";
}
