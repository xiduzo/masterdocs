import { useEffect, useRef, useState, useCallback } from "react";
import {
  realmPlugin,
  addComposerChild$,
  rootEditor$,
  insertThematicBreak$,
  insertTable$,
  insertJsx$,
} from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/editor";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  TextNode,
  type LexicalEditor,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $createListNode, $createListItemNode } from "@lexical/list";

// ── Command definitions ────────────────────────────────────────────────

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  execute: (ctx: CommandContext) => void;
}

interface CommandContext {
  insertThematicBreak: () => void;
  insertTable: () => void;
  insertJsx: (params: { name: string; kind: "flow"; props: Record<string, string> }) => void;
  rootEditor: LexicalEditor;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "h1",
    label: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    keywords: ["h1", "heading", "title", "large"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const heading = $createHeadingNode("h1");
            block.replace(heading);
            heading.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "h2",
    label: "Heading 2",
    description: "Use this for key sections",
    icon: "H2",
    keywords: ["h2", "heading", "subtitle", "section"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const heading = $createHeadingNode("h2");
            block.replace(heading);
            heading.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "h3",
    label: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    keywords: ["h3", "heading", "small"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const heading = $createHeadingNode("h3");
            block.replace(heading);
            heading.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "paragraph",
    label: "Paragraph",
    description: "Plain text block",
    icon: "¶",
    keywords: ["paragraph", "text", "plain", "normal"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const p = $createParagraphNode();
            block.replace(p);
            p.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "bullet-list",
    label: "Bullet List",
    description: "Unordered list with bullets",
    icon: "•",
    keywords: ["bullet", "list", "unordered", "ul"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const list = $createListNode("bullet");
            const item = $createListItemNode();
            list.append(item);
            block.replace(list);
            item.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "numbered-list",
    label: "Numbered List",
    description: "Ordered list with numbers",
    icon: "1.",
    keywords: ["numbered", "list", "ordered", "ol", "number"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const list = $createListNode("number");
            const item = $createListItemNode();
            list.append(item);
            block.replace(list);
            item.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "quote",
    label: "Quote",
    description: "Block quote for callouts",
    icon: "❝",
    keywords: ["quote", "blockquote", "callout"],
    execute: (ctx) => {
      ctx.rootEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const block = anchor.getTopLevelElement();
          if (block) {
            const quote = $createQuoteNode();
            block.replace(quote);
            quote.selectEnd();
          }
        }
      });
    },
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal rule separator",
    icon: "—",
    keywords: ["divider", "hr", "rule", "separator", "line"],
    execute: (ctx) => {
      ctx.insertThematicBreak();
    },
  },
  {
    id: "table",
    label: "Table",
    description: "Insert a table",
    icon: "⊞",
    keywords: ["table", "grid", "columns", "rows"],
    execute: (ctx) => {
      ctx.insertTable();
    },
  },
  {
    id: "skill",
    label: "Skill",
    description: "Insert a skill component",
    icon: "🎯",
    keywords: ["skill", "component", "jsx"],
    execute: (ctx) => {
      ctx.insertJsx({
        name: "Skill",
        kind: "flow",
        props: { id: "", label: "" },
      });
    },
  },
  {
    id: "youtube",
    label: "YouTube",
    description: "Embed a YouTube video",
    icon: "▶️",
    keywords: ["youtube", "video", "embed"],
    execute: (ctx) => {
      ctx.insertJsx({
        name: "YouTube",
        kind: "flow",
        props: { id: "" },
      });
    },
  },
];

// ── Slash Menu UI ──────────────────────────────────────────────────────

function SlashCommandMenu() {
  const rootEditor = useCellValue(rootEditor$);
  const insertThematicBreak = usePublisher(insertThematicBreak$);
  const insertTable = usePublisher(insertTable$);
  const insertJsx = usePublisher(insertJsx$);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const slashNodeRef = useRef<{ key: string; offset: number } | null>(null);

  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q))
    );
  });

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    slashNodeRef.current = null;
  }, []);

  // Remove the slash + query text from the editor
  const removeSlashText = useCallback(() => {
    if (!rootEditor || !slashNodeRef.current) return;
    rootEditor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const anchorNode = selection.anchor.getNode();
      if (anchorNode instanceof TextNode) {
        const text = anchorNode.getTextContent();
        const slashIdx = text.lastIndexOf("/");
        if (slashIdx !== -1) {
          // Remove from slash to end of current text at that position
          const before = text.substring(0, slashIdx);
          if (before) {
            anchorNode.setTextContent(before);
            anchorNode.select(before.length, before.length);
          } else {
            // The slash is the entire content — clear node
            anchorNode.setTextContent("");
            anchorNode.select(0, 0);
          }
        }
      }
    });
  }, [rootEditor]);

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      if (!rootEditor) return;
      removeSlashText();

      // Small delay to let the text removal settle before applying block transform
      setTimeout(() => {
        cmd.execute({
          insertThematicBreak: () => insertThematicBreak(),
          insertTable: () => insertTable({ rows: 3, columns: 3 }),
          insertJsx: (params) => insertJsx(params),
          rootEditor,
        });
      }, 10);

      closeMenu();
    },
    [rootEditor, insertThematicBreak, insertTable, insertJsx, closeMenu, removeSlashText],
  );

  // Listen for text changes to detect "/" trigger
  useEffect(() => {
    const editor = rootEditor;
    if (!editor) return;

    const removeTextListener = editor.registerTextContentListener(() => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchor = selection.anchor;
        const node = anchor.getNode();

        if (node instanceof TextNode) {
          const text = node.getTextContent();
          const cursorOffset = anchor.offset;
          const textBeforeCursor = text.substring(0, cursorOffset);

          // Find the last "/" in text before cursor
          const slashIdx = textBeforeCursor.lastIndexOf("/");

          if (slashIdx !== -1) {
            // Check the slash is at start of line or preceded by whitespace
            const charBefore = slashIdx > 0 ? textBeforeCursor[slashIdx - 1] : null;
            if (slashIdx === 0 || charBefore === " " || charBefore === "\n") {
              const queryText = textBeforeCursor.substring(slashIdx + 1);
              // Only keep menu open if query doesn't contain spaces (single word command)
              if (!queryText.includes(" ")) {
                slashNodeRef.current = { key: node.getKey(), offset: slashIdx };
                setQuery(queryText);
                setOpen(true);
                setSelectedIndex(0);

                // Position the menu near the cursor
                const domSelection = window.getSelection();
                if (domSelection && domSelection.rangeCount > 0) {
                  const range = domSelection.getRangeAt(0);
                  const rect = range.getBoundingClientRect();
                  const editorElement = editor.getRootElement();
                  if (editorElement) {
                    const editorRect = editorElement.getBoundingClientRect();
                    setPosition({
                      top: rect.bottom - editorRect.top + 4,
                      left: rect.left - editorRect.left,
                    });
                  }
                }
                return;
              }
            }
          }
        }

        // If we get here, no valid slash context
        if (open) {
          closeMenu();
        }
      });
    });

    return () => {
      removeTextListener();
    };
  }, [rootEditor, open, closeMenu]);

  // Register keyboard commands for navigation
  useEffect(() => {
    const editor = rootEditor;
    if (!editor || !open) return;

    const removers = [
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!open) return false;
          event?.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!open) return false;
          event?.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!open || filteredCommands.length === 0) return false;
          event?.preventDefault();
          executeCommand(filteredCommands[selectedIndex]);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (!open) return false;
          event?.preventDefault();
          closeMenu();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    ];

    return () => {
      removers.forEach((r) => r());
    };
  }, [rootEditor, open, filteredCommands, selectedIndex, executeCommand, closeMenu]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeMenu]);

  // Scroll selected item into view
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const item = menuRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);

  if (!open || filteredCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 1000,
      }}
      className="slash-command-menu"
    >
      {filteredCommands.map((cmd, i) => (
        <button
          key={cmd.id}
          data-index={i}
          className={`slash-command-item ${i === selectedIndex ? "slash-command-item-selected" : ""}`}
          onMouseEnter={() => setSelectedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent editor blur
            executeCommand(cmd);
          }}
        >
          <span className="slash-command-icon">{cmd.icon}</span>
          <span className="slash-command-text">
            <span className="slash-command-label">{cmd.label}</span>
            <span className="slash-command-desc">{cmd.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Plugin ─────────────────────────────────────────────────────────────

export const slashCommandPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: SlashCommandMenu,
    });
  },
});
