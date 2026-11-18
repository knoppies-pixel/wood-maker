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
import { CheatSheet } from "./components/CheatSheet.tsx";
import { beginModal, cancelModal, commitModal, nudgeSelection, previewModal } from "./input/modal.ts";
import { useProject } from "./store/useProject.ts";
import { useUi, type ToolId } from "./store/useUi.ts";

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
      <Toaster position="top-center" />
      <CheatSheet />
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
    const consumed = kerfAlong(kerf, ui.sawMitre, ui.sawBevel);
    const max = piece.length - consumed - MIN_PART_MM;
    ui.setSawDistance(clamp(Math.round(piece.length / 2), MIN_PART_MM, Math.max(MIN_PART_MM, max)));
  }, [selection, sawMode]);
}

const toolKeys: Record<string, ToolId> = {
  v: "select",
  k: "saw",
  d: "drill",
  t: "router",
  j: "joint",
  y: "screw",
  h: "hardware",
  p: "pencil",
  m: "measure",
};

function useHotkeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (event.key === "Control") useUi.getState().setCtrlDown(true);
      if (typing) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const ui = useUi.getState();
      if (ui.cheatOpen) {
        if (key === "escape" || key === "?") useUi.getState().setCheatOpen(false);
        return;
      }
      if (ui.modal) {
        event.preventDefault();
        handleModalKey(event);
        return;
      }
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
      if (meta && key === "d") {
        event.preventDefault();
        const id = ui.selection;
        if (!id) return;
        const result = useProject.getState().duplicatePiece(id);
        if (result.ok) {
          if (result.selectId) useUi.getState().select(result.selectId);
          toast.success(result.message ?? "Duplicated");
        } else toast.error(result.message);
        return;
      }
      if (meta && key === "c") {
        const piece = useProject.getState().pieces.find((item) => item.id === ui.selection);
        if (!piece) return;
        event.preventDefault();
        useUi.getState().setClipboard(piece);
        toast.success(`Copied ${piece.name}.`);
        return;
      }
      if (meta && key === "v") {
        const source = useUi.getState().clipboard;
        if (!source) return;
        event.preventDefault();
        const result = useProject.getState().pastePiece(source);
        if (result.ok && result.selectId) useUi.getState().select(result.selectId);
        toast.success(result.ok ? result.message ?? "Pasted" : result.message);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const id = ui.selection;
        if (!id) return;
        event.preventDefault();
        useProject.getState().deletePiece(id);
        useUi.getState().select(null);
        return;
      }
      if (key === "escape") {
        event.preventDefault();
        cancelDraft();
        return;
      }
      if (key === "?" || (event.shiftKey && event.code === "Slash")) {
        event.preventDefault();
        useUi.getState().setCheatOpen(true);
        return;
      }
      if (event.code.startsWith("Digit")) {
        const index = Number(event.code.slice(5)) - 1;
        const order: ToolId[] = ["select", "saw", "drill", "router", "joint", "screw", "hardware", "pencil", "measure"];
        const next = order[index];
        if (next) useUi.getState().setTool(next);
        return;
      }
      if (event.code === "Numpad1") useUi.getState().requestView("front");
      if (event.code === "Numpad3") useUi.getState().requestView("side");
      if (event.code === "Numpad7") useUi.getState().requestView("top");
      if (event.code === "Numpad5") useUi.getState().setOrtho(!useUi.getState().ortho);
      if (event.code === "NumpadDecimal" || key === "f" || key === ".") {
        useUi.getState().requestView("frame");
        return;
      }
      if (key === "n") useUi.getState().setInspectorOpen(!ui.inspectorOpen);
      if (event.key.startsWith("Arrow") && ui.selection) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft") nudgeSelection(0, -step);
        if (event.key === "ArrowRight") nudgeSelection(0, step);
        if (event.key === "ArrowUp") nudgeSelection(2, -step);
        if (event.key === "ArrowDown") nudgeSelection(2, step);
        return;
      }
      if (key === "g") beginModal("grab");
      if (key === "r") beginModal("rotate");
      if (key === "s" && !meta) beginModal("scale");
      if (!meta && key in toolKeys) useUi.getState().setTool(toolKeys[key] as ToolId);
      if (event.key === "Enter" && useUi.getState().tool === "saw") cutSelected();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Control") useUi.getState().setCtrlDown(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => useUi.getState().setCtrlDown(false));
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}

function handleModalKey(event: KeyboardEvent): void {
  const modal = useUi.getState().modal;
  if (!modal) return;
  const key = event.key.toLowerCase();
  if (key === "escape") {
    cancelModal();
    return;
  }
  if (key === "enter") {
    commitModal();
    return;
  }
  if (key === "x" || key === "y" || key === "z") {
    previewModal({ axis: modal.axis === key ? null : key });
    return;
  }
  if (key === "backspace") {
    previewModal({ text: modal.text.slice(0, -1) });
    return;
  }
  if (/^[0-9.-]$/.test(event.key) && modal.text.length < 8) previewModal({ text: modal.text + event.key });
}

function cancelDraft(): void {
  const ui = useUi.getState();
  useUi.getState().setHover(null);
  if (ui.jointFirst) {
    useUi.getState().setJointFirst(null);
    return;
  }
  if (ui.curvePoints.length > 0) {
    useUi.getState().setCurvePoints([]);
    return;
  }
  if (ui.pencilDraft || ui.pencilDrawing) {
    useUi.getState().setPencilDraft(null, null, null);
    useUi.getState().setPencilDrawing(false);
    return;
  }
  if (ui.measureAnchor) {
    useUi.getState().setMeasureAnchor(null);
    return;
  }
  if (ui.selection) {
    useUi.getState().select(null);
    return;
  }
  useUi.getState().setTool("select");
}

function cutSelected(): void {
  const pieceId = useUi.getState().selection;
  const piece = useProject.getState().pieces.find((item) => item.id === pieceId);
  if (!piece) return;
  const ui = useUi.getState();
  const kerf = useProject.getState().kerf;
  if (ui.sawMode === "taper" || ui.sawMode === "curve") return;
  const consumed = ui.sawMode === "crosscut" ? kerfAlong(kerf, ui.sawMitre, ui.sawBevel) : kerf;
  const distance = ui.sawMode === "rip" || ui.sawFrom === "start" ? ui.sawDistance : piece.length - ui.sawDistance - consumed;
  const result = useProject.getState().cutPiece(piece.id, ui.sawMode === "rip" ? "rip" : "crosscut", distance, ui.sawMode === "crosscut" ? ui.sawMitre : 0, ui.sawBevel);
  if (!result.ok) toast.error(result.message);
  else {
    toast.success(result.message ?? "Cut");
    if (result.selectId) useUi.getState().select(result.selectId);
  }
}
