import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@fumadocs-learning/ui/components/button";
import { Field, FieldDescription, FieldError } from "@fumadocs-learning/ui/components/field";
import { Input } from "@fumadocs-learning/ui/components/input";
import { Label } from "@fumadocs-learning/ui/components/label";
import { Separator } from "@fumadocs-learning/ui/components/separator";

import { trpc } from "@/utils/trpc";

interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roadmaps: string[];
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function NewFileDialog({
  open,
  onOpenChange,
  roadmaps,
}: NewFileDialogProps) {
  const [roadmap, setRoadmap] = useState("");
  const [slug, setSlug] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation(trpc.content.create.mutationOptions());

  const slugValid = slug.length > 0 && SLUG_PATTERN.test(slug);
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

    createMutation.mutate(
      { roadmap: roadmap.trim(), slug: slug.trim() },
      {
        onSuccess: () => {
          toast.success("File created successfully");
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
          const targetRoadmap = roadmap.trim();
          const targetSlug = slug.trim();
          reset();
          onOpenChange(false);
          navigate({
            to: "/admin/content/$roadmap/$slug",
            params: { roadmap: targetRoadmap, slug: targetSlug },
          });
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
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
