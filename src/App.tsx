import { useEffect } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Inspector } from "./components/Inspector.tsx";
import { StockPanel } from "./components/StockPanel.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { Viewport } from "./components/Viewport.tsx";
import { clamp } from "./domain/math.ts";
import { kerfAlong } from "./domain/operations.ts";
import { saveStoredProject } from "./domain/project-io.ts";
import { MIN_PART_MM } from "./domain/types.ts";
import { useProject } from "./store/useProject.ts";
import { useUi } from "./store/useUi.ts";

export default function App() {
  useAutosave();
  useHotkeys();
  useSawDefaults();

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <Toolbar />
        <div className="relative flex min-h-0 flex-1">
          <StockPanel />
          <Viewport />
          <Inspector />
        </div>
      </div>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}

function useAutosave() {
  useEffect(() => {
    let timer = 0;
    const unsubscribe = useProject.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        saveStoredProject(useProject.getState().snapshot());
      }, 350);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);
}

function useSawDefaults() {
  const selection = useUi((state) => state.selection);
  const sawMode = useUi((state) => state.sawMode);
  const sawBevel = useUi((state) => state.sawBevel);
  useEffect(() => {
    const piece = useProject.getState().pieces.find((item) => item.id === selection);
    if (!piece) return;
    const kerf = useProject.getState().kerf;
    const ui = useUi.getState();
    if (sawMode === "rip") {
      const max = piece.width - kerf - MIN_PART_MM;
      ui.setSawDistance(clamp(Math.round(piece.width / 2), MIN_PART_MM, Math.max(MIN_PART_MM, max)));
      return;
    }
    const consumed = kerfAlong(kerf, ui.sawMitre, sawBevel);
    const max = piece.length - consumed - MIN_PART_MM;
    ui.setSawDistance(clamp(Math.round(piece.length / 2), MIN_PART_MM, Math.max(MIN_PART_MM, max)));
  }, [selection, sawMode, sawBevel]);
}

function useHotkeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) useProject.temporal.getState().redo();
        else useProject.temporal.getState().undo();
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        useProject.temporal.getState().redo();
        return;
      }
      if (meta && key === "s") {
        event.preventDefault();
        saveStoredProject(useProject.getState().snapshot());
        toast.success("Saved in this browser.");
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const id = useUi.getState().selection;
        if (!id) return;
        event.preventDefault();
        useProject.getState().deletePiece(id);
        useUi.getState().select(null);
        return;
      }
      if (event.key === "Enter" && useUi.getState().tool === "saw") {
        const pieceId = useUi.getState().selection;
        const piece = useProject.getState().pieces.find((item) => item.id === pieceId);
        if (!piece) return;
        const ui = useUi.getState();
        const kerf = useProject.getState().kerf;
        if (ui.sawMode === "taper" || ui.sawMode === "curve") return;
        const consumed = ui.sawMode === "crosscut" ? kerfAlong(kerf, ui.sawMitre, ui.sawBevel) : kerf;
        const distance = ui.sawMode === "rip" || ui.sawFrom === "start" ? ui.sawDistance : piece.length - ui.sawDistance - consumed;
        const result = useProject.getState().cutPiece(piece.id, ui.sawMode, distance, ui.sawMode === "crosscut" ? ui.sawMitre : 0, ui.sawBevel);
        if (!result.ok) toast.error(result.message);
        else {
          toast.success(result.message ?? "Cut");
          if (result.selectId) useUi.getState().select(result.selectId);
        }
        return;
      }
      const tools = { "1": "select", "2": "saw", "3": "drill", "4": "screw", "5": "router", "6": "joint", "7": "hardware" } as const;
      if (key in tools) useUi.getState().setTool(tools[key as keyof typeof tools]);
      if (key === "escape") useUi.getState().setTool("select");
      if (key === "t") useUi.getState().setTransformMode("translate");
      if (key === "r") useUi.getState().setTransformMode("rotate");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
