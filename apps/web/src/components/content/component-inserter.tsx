import { useState } from "react";

import { Button } from "@fumadocs-learning/ui/components/button";
import { Card, CardContent } from "@fumadocs-learning/ui/components/card";
import { Field } from "@fumadocs-learning/ui/components/field";
import { Input } from "@fumadocs-learning/ui/components/input";
import { Label } from "@fumadocs-learning/ui/components/label";
import { Toggle } from "@fumadocs-learning/ui/components/toggle";

type ActiveForm = "skill" | "youtube" | null;

export function ComponentInserter({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [skillId, setSkillId] = useState("");
  const [skillLabel, setSkillLabel] = useState("");
  const [youtubeId, setYoutubeId] = useState("");

  const resetAndClose = () => {
    setActiveForm(null);
    setSkillId("");
    setSkillLabel("");
    setYoutubeId("");
  };

  const handleSkillSubmit = () => {
    if (!skillId.trim() || !skillLabel.trim()) return;
    onInsert(`<Skill id="${skillId.trim()}" label="${skillLabel.trim()}" />`);
    resetAndClose();
  };

  const handleYoutubeSubmit = () => {
    if (!youtubeId.trim()) return;
    onInsert(`<YouTube id="${youtubeId.trim()}" />`);
    resetAndClose();
  };

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Toggle
            pressed={activeForm === "skill"}
            onPressedChange={(pressed) => setActiveForm(pressed ? "skill" : null)}
            variant="outline"
            size="sm"
          >
            Insert Skill
          </Toggle>
          <Toggle
            pressed={activeForm === "youtube"}
            onPressedChange={(pressed) => setActiveForm(pressed ? "youtube" : null)}
            variant="outline"
            size="sm"
          >
            Insert YouTube
          </Toggle>
        </div>

        {activeForm === "skill" && (
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <Label className="text-xs">ID</Label>
              <Input
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                placeholder="e.g. arduino-ide-setup"
              />
            </Field>
            <Field className="flex-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={skillLabel}
                onChange={(e) => setSkillLabel(e.target.value)}
                placeholder="e.g. Set up the Arduino IDE"
              />
            </Field>
            <Button
              size="sm"
              onClick={handleSkillSubmit}
              disabled={!skillId.trim() || !skillLabel.trim()}
            >
              Insert
            </Button>
            <Button size="sm" variant="ghost" onClick={resetAndClose}>
              Cancel
            </Button>
          </div>
        )}

        {activeForm === "youtube" && (
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <Label className="text-xs">Video ID</Label>
              <Input
                value={youtubeId}
                onChange={(e) => setYoutubeId(e.target.value)}
                placeholder="e.g. ELUF8m24sEo"
              />
            </Field>
            <Button
              size="sm"
              onClick={handleYoutubeSubmit}
              disabled={!youtubeId.trim()}
            >
              Insert
            </Button>
            <Button size="sm" variant="ghost" onClick={resetAndClose}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
