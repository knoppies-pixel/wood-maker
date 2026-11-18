import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUi } from "../store/useUi.ts";

const rows: Array<[string, string]> = [
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
  ["Ctrl+Y", "Redo"],
  ["Ctrl+S", "Save in this browser"],
  ["Ctrl+D", "Duplicate the selection"],
  ["Ctrl+C / Ctrl+V", "Copy / paste a piece"],
  ["Delete", "Remove the selection"],
  ["Esc", "Cancel the modal, draft, selection, then the tool"],
  ["V K D T J Y H P M", "Move, saw, drill, router, joint, fasten, hardware, pencil, measure"],
  ["1–9", "The same tools, in toolbar order"],
  ["G / R / S", "Grab, rotate, scale. Then X Y Z locks an axis"],
  ["Type a number, Enter", "150 mm, 45°, or a scale factor"],
  ["Arrows / Shift+arrows", "Nudge 1 mm / 10 mm"],
  ["Numpad 1 / 3 / 7", "Front, side, top"],
  ["Numpad 5", "Flatten the view"],
  ["F or .", "Frame the selection"],
  ["N", "Show or hide properties"],
  ["Enter or click", "Make the saw cut"],
  ["Middle mouse", "Orbit. Shift+middle pans. Right mouse pans. Wheel zooms"],
  ["Ctrl (hold)", "Suspend snapping"],
  ["?", "This sheet"],
];

export function CheatSheet() {
  const open = useUi((state) => state.cheatOpen);
  return (
    <Dialog open={open} onOpenChange={(next) => useUi.getState().setCheatOpen(next)}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shortcuts</DialogTitle>
          <DialogDescription>The same keys are on the tooltips. Typing in a field is left alone.</DialogDescription>
        </DialogHeader>
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map(([key, action]) => (
              <tr key={key} className="border-t border-border/70">
                <td className="nums py-1.5 pr-3 align-top text-xs text-primary">{key}</td>
                <td className="py-1.5 text-muted-foreground">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
