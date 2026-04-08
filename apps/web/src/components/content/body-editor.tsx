import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  Puzzle,
  Youtube,
} from "lucide-react";
import { Button } from "@fumadocs-learning/ui/components/button";
import { Input } from "@fumadocs-learning/ui/components/input";
import { Label } from "@fumadocs-learning/ui/components/label";
import { Field } from "@fumadocs-learning/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@fumadocs-learning/ui/components/popover";

export interface BodyEditorHandle {
  getCursorPosition: () => number;
  insertAtCursor: (text: string) => void;
}

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--color-background)",
      color: "var(--color-foreground)",
      fontSize: "14px",
    },
    ".cm-content": {
      caretColor: "var(--color-foreground)",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      padding: "8px 0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-muted)",
      color: "var(--color-muted-foreground)",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--color-muted)",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--color-foreground)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--color-accent)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  },
  { dark: true },
);

/** Insert text at line start (for headings, lists) */
function insertAtLineStart(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  view.dispatch({
    changes: { from: line.from, insert: prefix },
    selection: { anchor: line.from + prefix.length },
  });
  view.focus();
}

/** Wrap selection with markers (for bold, italic) */
function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = `${before}${selected}${after}`;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  view.focus();
}

/** Insert a link template around selection */
function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = `[${selected}](url)`;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + 1, head: from + 1 + selected.length },
  });
  view.focus();
}

/** Insert a code block around selection */
function insertCodeBlock(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = `\`\`\`\n${selected}\n\`\`\``;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + 4, head: from + 4 + selected.length },
  });
  view.focus();
}

const TOOLBAR_ACTIONS = [
  { label: "H2", icon: Heading2, action: (v: EditorView) => insertAtLineStart(v, "## ") },
  { label: "H3", icon: Heading3, action: (v: EditorView) => insertAtLineStart(v, "### ") },
  { label: "Bold", icon: Bold, action: (v: EditorView) => wrapSelection(v, "**", "**") },
  { label: "Italic", icon: Italic, action: (v: EditorView) => wrapSelection(v, "_", "_") },
  { label: "Link", icon: Link, action: (v: EditorView) => insertLink(v) },
  { label: "List", icon: List, action: (v: EditorView) => insertAtLineStart(v, "- ") },
  { label: "Code", icon: Code, action: (v: EditorView) => insertCodeBlock(v) },
] as const;

function SkillInsertPopover({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [skillId, setSkillId] = useState("");
  const [skillLabel, setSkillLabel] = useState("");

  const handleSubmit = () => {
    if (!skillId.trim() || !skillLabel.trim()) return;
    onInsert(`<Skill id="${skillId.trim()}" label="${skillLabel.trim()}" />`);
    setSkillId("");
    setSkillLabel("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" title="Insert Skill" aria-label="Insert Skill" />}
      >
        <Puzzle />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-2">
          <Field>
            <Label className="text-xs">ID</Label>
            <Input
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              placeholder="e.g. arduino-ide-setup"
            />
          </Field>
          <Field>
            <Label className="text-xs">Label</Label>
            <Input
              value={skillLabel}
              onChange={(e) => setSkillLabel(e.target.value)}
              placeholder="e.g. Set up the Arduino IDE"
            />
          </Field>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!skillId.trim() || !skillLabel.trim()}
            >
              Insert
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function YouTubeInsertPopover({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [youtubeId, setYoutubeId] = useState("");

  const handleSubmit = () => {
    if (!youtubeId.trim()) return;
    onInsert(`<YouTube id="${youtubeId.trim()}" />`);
    setYoutubeId("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" title="Insert YouTube" aria-label="Insert YouTube" />}
      >
        <Youtube />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-2">
          <Field>
            <Label className="text-xs">Video ID</Label>
            <Input
              value={youtubeId}
              onChange={(e) => setYoutubeId(e.target.value)}
              placeholder="e.g. ELUF8m24sEo"
            />
          </Field>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!youtubeId.trim()}
            >
              Insert
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const BodyEditor = forwardRef<
  BodyEditorHandle,
  {
    body: string;
    onChange: (body: string) => void;
  }
>(function BodyEditor({ body, onChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track whether we're dispatching internally to avoid echo loops
  const isInternalUpdate = useRef(false);

  useImperativeHandle(ref, () => ({
    getCursorPosition: () => {
      if (!viewRef.current) return 0;
      return viewRef.current.state.selection.main.head;
    },
    insertAtCursor: (text: string) => {
      const view = viewRef.current;
      if (!view) return;
      const pos = view.state.selection.main.head;
      isInternalUpdate.current = true;
      view.dispatch({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      isInternalUpdate.current = false;
    },
  }));

  // Create the editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newDoc = update.state.doc.toString();
        onChangeRef.current(newDoc);
      }
    });

    const state = EditorState.create({
      doc: body,
      extensions: [
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        darkTheme,
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount — body sync handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external body prop changes into the editor (e.g. from ComponentInserter)
  const syncBody = useCallback((newBody: string) => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === newBody) return;

    isInternalUpdate.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: newBody,
      },
    });
    isInternalUpdate.current = false;
  }, []);

  useEffect(() => {
    syncBody(body);
  }, [body, syncBody]);

  const handleToolbarAction = useCallback(
    (action: (v: EditorView) => void) => {
      if (viewRef.current) {
        action(viewRef.current);
      }
    },
    [],
  );

  const handlePopoverInsert = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
    view.focus();
  }, []);

  return (
    <div className="flex flex-col gap-0 rounded border border-border">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border bg-muted/50 px-2 py-1">
        {TOOLBAR_ACTIONS.map(({ label, icon: Icon, action }) => (
          <Button
            key={label}
            variant="ghost"
            size="icon-xs"
            onClick={() => handleToolbarAction(action)}
            title={label}
            aria-label={label}
          >
            <Icon />
          </Button>
        ))}
        <div className="mx-1 h-4 w-px bg-border" />
        <SkillInsertPopover onInsert={handlePopoverInsert} />
        <YouTubeInsertPopover onInsert={handlePopoverInsert} />
      </div>

      {/* Editor container */}
      <div ref={containerRef} className="min-h-[300px] [&_.cm-editor]:h-full" />
    </div>
  );
});
