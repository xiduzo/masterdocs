import type { MdxFrontmatter } from "@masterdocs/api/lib/mdx";
import { Field, FieldError } from "@masterdocs/ui/components/field";
import { Input } from "@masterdocs/ui/components/input";
import { Label } from "@masterdocs/ui/components/label";
import { Textarea } from "@masterdocs/ui/components/textarea";

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
