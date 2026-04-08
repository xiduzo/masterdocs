import { forwardRef, type ForwardedRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  type JsxComponentDescriptor,
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
  GenericJsxEditor,
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
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

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
    Editor: GenericJsxEditor,
  },
  {
    name: "YouTube",
    kind: "flow",
    props: [
      { name: "id", type: "string" },
    ],
    hasChildren: false,
    Editor: GenericJsxEditor,
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
}

export const ContentEditor = forwardRef<MDXEditorMethods, ContentEditorProps>(
  function ContentEditor(
    { markdown, className, ...props }: ContentEditorProps,
    ref: ForwardedRef<MDXEditorMethods>,
  ) {
    return (
      <MDXEditor
        ref={ref}
        markdown={markdown}
        className={`dark-theme ${className ?? ""}`}
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
          diffSourcePlugin({ viewMode: "rich-text" }),
          toolbarPlugin({ toolbarContents: () => <ToolbarContents /> }),
        ]}
        {...props}
      />
    );
  },
);
