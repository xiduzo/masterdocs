"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProgressState {
  /** Map of skillId → true for completed skills */
  completedSkills: Record<string, boolean>;
  /** Toggle a skill's completion state */
  toggleSkill: (skillId: string, completed: boolean) => void;
  /** Get completed skill IDs from a given set */
  getCompletedFrom: (skillIds: string[]) => string[];
  /** Check if a specific skill is completed */
  isCompleted: (skillId: string) => boolean;
  /** Bulk set skills (used after sync resolution) */
  bulkSet: (skillIds: string[], completed: boolean) => void;
  /** Clear all local progress (used after successful sync) */
  clearAll: () => void;
  /** Check if there's any local progress stored */
  hasLocalProgress: () => boolean;
  /** Get all completed skill IDs */
  getAllCompletedIds: () => string[];
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      completedSkills: {},

      toggleSkill: (skillId, completed) =>
        set((state) => {
          const next = { ...state.completedSkills };
          if (completed) {
            next[skillId] = true;
          } else {
            delete next[skillId];
          }
          return { completedSkills: next };
        }),

      getCompletedFrom: (skillIds) => {
        const { completedSkills } = get();
        return skillIds.filter((id) => completedSkills[id]);
      },

      isCompleted: (skillId) => !!get().completedSkills[skillId],

      bulkSet: (skillIds, completed) =>
        set((state) => {
          const next = { ...state.completedSkills };
          for (const id of skillIds) {
            if (completed) {
              next[id] = true;
            } else {
              delete next[id];
            }
          }
          return { completedSkills: next };
        }),

      clearAll: () => set({ completedSkills: {} }),

      hasLocalProgress: () => Object.keys(get().completedSkills).length > 0,

      getAllCompletedIds: () => Object.keys(get().completedSkills),
    }),
    {
      name: "skill-progress",
    },
  ),
);
