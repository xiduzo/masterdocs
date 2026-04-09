import { forwardRef, useEffect, useMemo, useState, useSyncExternalStore, type ForwardedRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  type JsxComponentDescriptor,
  type JsxEditorProps,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  toolbarPlugin,
  jsxPlugin,
  diffSourcePlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  Separator,
  DiffSourceToggleWrapper,
  Button,
  usePublisher,
  insertJsx$,
  useMdastNodeUpdater,
  useLexicalNodeRemove,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { slashCommandPlugin } from "./slash-command-plugin";

// ── Skill ID Registry (uniqueness tracking across editor instances) ────────

const _skillIds = new Map<number, string>();
const _listeners = new Set<() => void>();
let _nextInstanceId = 0;
let _version = 0;

function _notifySkillRegistry() {
  _version++;
  _listeners.forEach((l) => l());
}

function useSkillIdDuplicate(skillId: string): boolean {
  const [instanceId] = useState(() => _nextInstanceId++);

  useEffect(() => {
    _skillIds.set(instanceId, skillId);
    _notifySkillRegistry();
    return () => {
      _skillIds.delete(instanceId);
      _notifySkillRegistry();
    };
  }, [instanceId, skillId]);

  const version = useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => _listeners.delete(cb); },
    () => _version,
  );

  return useMemo(() => {
    if (!skillId.trim()) return false;
    for (const [key, value] of _skillIds) {
      if (key !== instanceId && value === skillId.trim()) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, instanceId, skillId]);
}

// ── Inline JSX Editors ─────────────────────────────────────────────────────

function SkillEditor({ mdastNode }: JsxEditorProps) {
  const updateNode = useMdastNodeUpdater();
  const removeNode = useLexicalNodeRemove();

  const attrs = Object.fromEntries(
    (mdastNode.attributes ?? []).map((a) => [
      a.type === "mdxJsxAttribute" ? a.name : "",
      a.type === "mdxJsxAttribute" ? String(a.value ?? "") : "",
    ]),
  );

  const [id, setId] = useState(attrs.id ?? "");
  const [label, setLabel] = useState(attrs.label ?? "");
  const isDuplicate = useSkillIdDuplicate(id);

  const save = () => {
    updateNode({
      attributes: [
        { type: "mdxJsxAttribute", name: "id", value: id },
        { type: "mdxJsxAttribute", name: "label", value: label },
      ],
    } as any);
  };

  return (
    <div className="jsx-editor-inline" onKeyDown={(e) => e.stopPropagation()}>
      <div className="jsx-editor-header">
        <span className="jsx-editor-icon">🎯</span>
        <span className="jsx-editor-title">Skill</span>
        {isDuplicate && <span className="jsx-editor-warning">⚠ duplicate id</span>}
        <button className="jsx-editor-remove" onClick={removeNode} title="Remove">
          ✕
        </button>
      </div>
      <div className="jsx-editor-fields jsx-editor-fields--vertical">
        <label>
          <span>id</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            onBlur={save}
            placeholder="skill-id"
            className={isDuplicate ? "jsx-editor-input-error" : undefined}
          />
        </label>
        <label>
          <span>label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={save} placeholder="Skill Label" />
        </label>
      </div>
    </div>
  );
}

function YouTubeEditor({ mdastNode }: JsxEditorProps) {
  const updateNode = useMdastNodeUpdater();
  const removeNode = useLexicalNodeRemove();

  const attrs = Object.fromEntries(
    (mdastNode.attributes ?? []).map((a) => [
      a.type === "mdxJsxAttribute" ? a.name : "",
      a.type === "mdxJsxAttribute" ? String(a.value ?? "") : "",
    ]),
  );

  const [id, setId] = useState(attrs.id ?? "");

  const save = () => {
    updateNode({
      attributes: [{ type: "mdxJsxAttribute", name: "id", value: id }],
    } as any);
  };

  return (
    <div className="jsx-editor-inline" onKeyDown={(e) => e.stopPropagation()}>
      <div className="jsx-editor-header">
        <span className="jsx-editor-icon">▶️</span>
        <span className="jsx-editor-title">YouTube</span>
        <button className="jsx-editor-remove" onClick={removeNode} title="Remove">
          ✕
        </button>
      </div>
      {id && (
        <img
          src={`https://img.youtube.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`}
          alt="YouTube thumbnail"
          style={{ width: "100%", borderRadius: 6, marginTop: 8 }}
        />
      )}
      <div className="jsx-editor-fields">
        <label>
          <span>id</span>
          <input value={id} onChange={(e) => setId(e.target.value)} onBlur={save} placeholder="video-id" />
        </label>
      </div>
    </div>
  );
}

// ── JSX Component Descriptors ──────────────────────────────────────────────

const jsxComponentDescriptors: JsxComponentDescriptor[] = [
  {
    name: "Skill",
    kind: "flow",
    props: [
      { name: "id", type: "string" },
      { name: "label", type: "string" },
    ],
    hasChildren: false,
    Editor: SkillEditor,
  },
  {
    name: "YouTube",
    kind: "flow",
    props: [
      { name: "id", type: "string" },
    ],
    hasChildren: false,
    Editor: YouTubeEditor,
  },
];

// ── Custom Toolbar Buttons ─────────────────────────────────────────────────

function InsertSkillButton() {
  const insertJsx = usePublisher(insertJsx$);
  return (
    <Button
      onClick={() =>
        insertJsx({
          name: "Skill",
          kind: "flow",
          props: { id: "", label: "" },
        })
      }
      title="Insert Skill"
    >
      🎯 Skill
    </Button>
  );
}

function InsertYouTubeButton() {
  const insertJsx = usePublisher(insertJsx$);
  return (
    <Button
      onClick={() =>
        insertJsx({
          name: "YouTube",
          kind: "flow",
          props: { id: "" },
        })
      }
      title="Insert YouTube"
    >
      ▶️ YouTube
    </Button>
  );
}

// ── Toolbar Layout ─────────────────────────────────────────────────────────

function ToolbarContents() {
  return (
    <DiffSourceToggleWrapper>
      <UndoRedo />
      <Separator />
      <BlockTypeSelect />
      <Separator />
      <BoldItalicUnderlineToggles />
      <Separator />
      <CreateLink />
      <Separator />
      <ListsToggle />
      <Separator />
      <InsertTable />
      <InsertThematicBreak />
      <Separator />
      <InsertSkillButton />
      <InsertYouTubeButton />
    </DiffSourceToggleWrapper>
  );
}

// ── Editor Component ───────────────────────────────────────────────────────

interface ContentEditorProps extends Omit<MDXEditorProps, "markdown" | "plugins"> {
  markdown: string;
  diffMarkdown?: string;
}

export const ContentEditor = forwardRef<MDXEditorMethods, ContentEditorProps>(
  function ContentEditor(
    { markdown, diffMarkdown, className, ...props }: ContentEditorProps,
    ref: ForwardedRef<MDXEditorMethods>,
  ) {
    return (
      <MDXEditor
        ref={ref}
        markdown={markdown}
        className={`dark-theme h-full ${className ?? ""}`}
        contentEditableClassName="prose prose-invert max-w-none"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          jsxPlugin({ jsxComponentDescriptors }),
          diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: diffMarkdown ?? "" }),
          toolbarPlugin({ toolbarContents: () => <ToolbarContents /> }),
          slashCommandPlugin(),
        ]}
        {...props}
      />
    );
  },
);
