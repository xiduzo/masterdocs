import { Card } from "@fumadocs-learning/ui/components/card";
import { ScrollArea } from "@fumadocs-learning/ui/components/scroll-area";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Pre-process MDX body to replace custom components with readable placeholders.
 * react-markdown only handles standard Markdown, so we convert JSX components
 * to bracketed text before rendering.
 */
function preprocessMdx(body: string): string {
  let result = body;

  // Replace <Skill id="..." label="..." /> with placeholder
  result = result.replace(
    /<Skill\s+[^>]*?label="([^"]*)"[^>]*?\/>/g,
    "\n\n🎯 **Skill:** $1\n\n",
  );
  // Handle alternate attribute order (label before id)
  result = result.replace(
    /<Skill\s+[^>]*?\/>/g,
    "\n\n🎯 **Skill**\n\n",
  );

  // Replace <YouTube id="..." /> with placeholder
  result = result.replace(
    /<YouTube\s+id="([^"]*)"[^>]*?\/>/g,
    "\n\n▶️ **YouTube:** `$1`\n\n",
  );

  return result;
}

export function PreviewPanel({
  body,
  visible,
}: {
  body: string;
  visible: boolean;
}) {
  const [debouncedBody, setDebouncedBody] = useState(body);

  // Debounce preview updates to 300ms after input pause
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBody(body);
    }, 300);
    return () => clearTimeout(timer);
  }, [body]);

  if (!visible) return null;

  const processed = preprocessMdx(debouncedBody);

  return (
    <Card className="flex-1 overflow-hidden p-0">
      <ScrollArea className="h-full">
        <div className="prose prose-sm dark:prose-invert max-w-none p-6">
          <Markdown remarkPlugins={[remarkGfm]}>{processed}</Markdown>
        </div>
      </ScrollArea>
    </Card>
  );
}
