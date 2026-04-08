import type { MdxFrontmatter } from "@fumadocs-learning/api/lib/mdx";
import { Card, CardContent, CardHeader, CardTitle } from "@fumadocs-learning/ui/components/card";
import { Field, FieldError } from "@fumadocs-learning/ui/components/field";
import { Input } from "@fumadocs-learning/ui/components/input";
import { Label } from "@fumadocs-learning/ui/components/label";
import { Textarea } from "@fumadocs-learning/ui/components/textarea";

export function FrontmatterForm({
  frontmatter,
  onChange,
}: {
  frontmatter: MdxFrontmatter;
  onChange: (frontmatter: MdxFrontmatter) => void;
}) {
  const update = (patch: Partial<MdxFrontmatter>) => {
    onChange({ ...frontmatter, ...patch });
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    if (value.trim() === "") return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  };

  const titleEmpty = frontmatter.title.trim() === "";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Frontmatter</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Title — full width, required */}
        <Field>
          <Label htmlFor="fm-title">Title *</Label>
          <Input
            id="fm-title"
            value={frontmatter.title}
            onChange={(e) => update({ title: e.target.value })}
            aria-invalid={titleEmpty || undefined}
          />
          {titleEmpty && (
            <FieldError>Title is required</FieldError>
          )}
        </Field>

        {/* Description — full width */}
        <Field>
          <Label htmlFor="fm-description">Description</Label>
          <Textarea
            id="fm-description"
            value={frontmatter.description ?? ""}
            onChange={(e) =>
              update({
                description: e.target.value || undefined,
              })
            }
            rows={3}
          />
        </Field>

        {/* Optional fields — 2-column grid */}
        <div className="grid grid-cols-2 gap-4">
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

          <Field>
            <Label htmlFor="fm-trackOrder">Track Order</Label>
            <Input
              id="fm-trackOrder"
              type="number"
              value={frontmatter.trackOrder ?? ""}
              onChange={(e) =>
                update({ trackOrder: parseOptionalNumber(e.target.value) })
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
                update({ topicOrder: parseOptionalNumber(e.target.value) })
              }
            />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
