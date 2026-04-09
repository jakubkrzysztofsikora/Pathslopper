"use client";

import { create } from "zustand";
import type { SafeParseReturnType } from "zod";
import {
  StoryDNASchema,
  VERSION_SLIDER_DEFAULTS,
  type StoryDNA,
} from "@/lib/schemas/story-dna";
import { type PathfinderVersion } from "@/lib/schemas/version";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

const DEFAULT_INCLUDE_TAGS = ["Dark Fantasy", "Political Intrigue"];

export type StoryDNASnapshot = SafeParseReturnType<unknown, StoryDNA>;

interface StoryDNAState extends StoryDNA {
  setVersion: (version: PathfinderVersion) => void;
  setSlider: (key: keyof StoryDNA["sliders"], value: number) => void;
  addIncludeTag: (tag: string) => void;
  removeIncludeTag: (tag: string) => void;
  addExcludeTag: (tag: string) => void;
  removeExcludeTag: (tag: string) => void;
  /**
   * Returns a zod SafeParseReturnType rather than throwing so callers can
   * render-path-safely inspect validity. Use `result.success` to branch.
   */
  getSnapshot: () => StoryDNASnapshot;
}

const initialVersion: PathfinderVersion = "pf2e";

export const useStoryDNAStore = create<StoryDNAState>((set, get) => ({
  version: initialVersion,
  sliders: { ...VERSION_SLIDER_DEFAULTS[initialVersion] },
  tags: {
    include: [...DEFAULT_INCLUDE_TAGS],
    exclude: [...DEFAULT_BANNED_PHRASES],
  },

  setVersion: (version: PathfinderVersion) => {
    set((state) => ({
      version,
      sliders: { ...VERSION_SLIDER_DEFAULTS[version] },
      tags: {
        ...state.tags,
      },
    }));
  },

  setSlider: (key: keyof StoryDNA["sliders"], value: number) => {
    set((state) => ({
      sliders: {
        ...state.sliders,
        [key]: value,
      },
    }));
  },

  addIncludeTag: (tag: string) => {
    set((state) => ({
      tags: {
        ...state.tags,
        include: state.tags.include.includes(tag)
          ? state.tags.include
          : [...state.tags.include, tag],
      },
    }));
  },

  removeIncludeTag: (tag: string) => {
    set((state) => ({
      tags: {
        ...state.tags,
        include: state.tags.include.filter((t) => t !== tag),
      },
    }));
  },

  addExcludeTag: (tag: string) => {
    set((state) => ({
      tags: {
        ...state.tags,
        exclude: state.tags.exclude.includes(tag)
          ? state.tags.exclude
          : [...state.tags.exclude, tag],
      },
    }));
  },

  removeExcludeTag: (tag: string) => {
    set((state) => ({
      tags: {
        ...state.tags,
        exclude: state.tags.exclude.filter((t) => t !== tag),
      },
    }));
  },

  getSnapshot: () => {
    const { version, sliders, tags } = get();
    return StoryDNASchema.safeParse({ version, sliders, tags });
  },
}));
