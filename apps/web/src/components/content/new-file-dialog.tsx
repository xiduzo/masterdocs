import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@masterdocs/ui/components/button";
import { Field, FieldDescription, FieldError } from "@masterdocs/ui/components/field";
import { Input } from "@masterdocs/ui/components/input";
import { Label } from "@masterdocs/ui/components/label";
import { Separator } from "@masterdocs/ui/components/separator";

import { isValidSlug } from "@masterdocs/api/lib/slug";

import { useContentMutation } from "@/hooks/use-content-mutation";
import { trpc } from "@/utils/trpc";

interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roadmaps: string[];
}

export function NewFileDialog({
  open,
  onOpenChange,
  roadmaps,
}: NewFileDialogProps) {
  const [roadmap, setRoadmap] = useState("");
  const [slug, setSlug] = useState("");
  const navigate = useNavigate();

  const createMutation = useContentMutation({
    ...trpc.content.create.mutationOptions(),
    successMessage: "File created successfully",
    errorPrefix: "",
    onSuccess: (_result, input) => {
      reset();
      onOpenChange(false);
      navigate({
        to: "/admin/roadmaps/$roadmap/tracks/$slug",
        params: { roadmap: input.roadmap, slug: input.slug },
      });
    },
  });

  const slugValid = isValidSlug(slug);
  const canSubmit = roadmap.trim().length > 0 && slugValid && !createMutation.isPending;

  const reset = () => {
    setRoadmap("");
    setSlug("");
    createMutation.reset();
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate({ roadmap: roadmap.trim(), slug: slug.trim() });
  };

  if (!open) return null;

  return (
    <div className="p-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field>
          <Label htmlFor="new-file-roadmap">Roadmap</Label>
          <Input
            id="new-file-roadmap"
            value={roadmap}
            onChange={(e) => setRoadmap(e.target.value)}
            placeholder="e.g. arduino"
            list="roadmap-suggestions"
          />
          {roadmaps.length > 0 && (
            <datalist id="roadmap-suggestions">
              {roadmaps.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
        </Field>

        <Field>
          <Label htmlFor="new-file-slug">Slug</Label>
          <Input
            id="new-file-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. getting-started"
            aria-describedby="slug-hint"
          />
          <FieldDescription>
            Lowercase letters, numbers, and hyphens only
          </FieldDescription>
          {slug.length > 0 && !slugValid && (
            <FieldError>Invalid slug format</FieldError>
          )}
        </Field>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleClose}
          >
            Cancel
          </Button>
        </div>
      </form>
      <Separator className="mt-3" />
    </div>
  );
}
