import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { MdxFrontmatter } from "@fumadocs-learning/api/lib/mdx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@fumadocs-learning/ui/components/collapsible";
import { Field, FieldError } from "@fumadocs-learning/ui/components/field";
import { Input } from "@fumadocs-learning/ui/components/input";
import { Label } from "@fumadocs-learning/ui/components/label";
import { Textarea } from "@fumadocs-learning/ui/components/textarea";

export function FrontmatterForm({
  frontmatter,
  onChange,
  isIndex = false,
}: {
  frontmatter: MdxFrontmatter;
  onChange: (frontmatter: MdxFrontmatter) => void;
  isIndex?: boolean;
}) {
  const update = (patch: Partial<MdxFrontmatter>) => {
    onChange({ ...frontmatter, ...patch });
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    if (value.trim() === "") return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  };

  const hasRoadmapFields =
    frontmatter.roadmap ||
    frontmatter.track ||
    frontmatter.trackTitle ||
    frontmatter.trackOrder !== undefined ||
    frontmatter.topicOrder !== undefined;

  const [roadmapOpen, setRoadmapOpen] = useState(!!hasRoadmapFields);

  const titleEmpty = frontmatter.title.trim() === "";

  return (
    <div className="space-y-4">
      {/* Title — always visible, required */}
      <Field>
        <Label htmlFor="fm-title">Title *</Label>
        <Input
          id="fm-title"
          value={frontmatter.title}
          onChange={(e) => update({ title: e.target.value })}
          aria-invalid={titleEmpty || undefined}
        />
        {titleEmpty && <FieldError>Title is required</FieldError>}
      </Field>

      {/* Description — always visible */}
      <Field>
        <Label htmlFor="fm-description">Description</Label>
        <Textarea
          id="fm-description"
          value={frontmatter.description ?? ""}
          onChange={(e) =>
            update({ description: e.target.value || undefined })
          }
          rows={3}
        />
      </Field>

      {/* Roadmap fields — collapsible section, hidden for index files */}
      {!isIndex && <Collapsible open={roadmapOpen} onOpenChange={setRoadmapOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown
            className="size-3.5 transition-transform duration-200 in-data-open:rotate-0 in-data-closed:-rotate-90"
          />
          Roadmap Settings
          {hasRoadmapFields && (
            <span className="ml-auto size-1.5 rounded-full bg-primary" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-2">
          <Field>
            <Label htmlFor="fm-roadmap">Roadmap</Label>
            <Input
              id="fm-roadmap"
              value={frontmatter.roadmap ?? ""}
              onChange={(e) =>
                update({ roadmap: e.target.value || undefined })
              }
            />
          </Field>

          <Field>
            <Label htmlFor="fm-track">Track</Label>
            <Input
              id="fm-track"
              value={frontmatter.track ?? ""}
              onChange={(e) =>
                update({ track: e.target.value || undefined })
              }
            />
          </Field>

          <Field>
            <Label htmlFor="fm-trackTitle">Track Title</Label>
            <Input
              id="fm-trackTitle"
              value={frontmatter.trackTitle ?? ""}
              onChange={(e) =>
                update({ trackTitle: e.target.value || undefined })
              }
            />
          </Field>

          {/* Number fields side by side — small inputs */}
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label htmlFor="fm-trackOrder">Track Order</Label>
              <Input
                id="fm-trackOrder"
                type="number"
                value={frontmatter.trackOrder ?? ""}
                onChange={(e) =>
                  update({
                    trackOrder: parseOptionalNumber(e.target.value),
                  })
                }
              />
            </Field>

            <Field>
              <Label htmlFor="fm-topicOrder">Topic Order</Label>
              <Input
                id="fm-topicOrder"
                type="number"
                value={frontmatter.topicOrder ?? ""}
                onChange={(e) =>
                  update({
                    topicOrder: parseOptionalNumber(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>}
    </div>
  );
}
