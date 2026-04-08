import type { MdxFrontmatter } from "@fumadocs-learning/api/lib/mdx";
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
  isIndex?: boolean;
}) {
  const update = (patch: Partial<MdxFrontmatter>) => {
    onChange({ ...frontmatter, ...patch });
  };

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


    </div>
  );
}
