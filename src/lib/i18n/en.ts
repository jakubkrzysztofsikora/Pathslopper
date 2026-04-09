export interface Translations {
  app: {
    title: string;
    subtitle: string;
    footer: string;
  };
  versionPicker: {
    label: string;
    pf1e: string;
    pf2e: string;
  };
  storyDna: {
    title: string;
    sliders: {
      narrativePacing: { label: string; description: string };
      tacticalLethality: { label: string; description: string };
      npcImprov: { label: string; description: string };
    };
    tags: {
      includeLabel: string;
      excludeLabel: string;
      addPlaceholder: string;
    };
  };
  zones: {
    generate: string;
    generating: string;
  };
}

export const en: Translations = {
  app: {
    title: "Pathfinder Nexus — AI Game Master",
    subtitle: "Deterministic state-driven storytelling for Pathfinder 1e and 2e",
    footer: "PF1e: simulation | PF2e: three-action economy",
  },
  versionPicker: {
    label: "Select Pathfinder Edition",
    pf1e: "Pathfinder 1e — Story-Forward Simulation",
    pf2e: "Pathfinder 2e — Three-Action Economy",
  },
  storyDna: {
    title: "Story DNA Configuration",
    sliders: {
      narrativePacing: {
        label: "Narrative Pacing",
        description: "Controls the ratio of story beats to combat encounters.",
      },
      tacticalLethality: {
        label: "Tactical Lethality",
        description: "Higher values increase monster threat and environmental danger.",
      },
      npcImprov: {
        label: "NPC Improv",
        description: "How freely NPCs deviate from scripted behavior.",
      },
    },
    tags: {
      includeLabel: "Include Themes",
      excludeLabel: "Slop Filter (Exclude)",
      addPlaceholder: "Add tag...",
    },
  },
  zones: {
    generate: "Generate Zone",
    generating: "Generating...",
  },
};
