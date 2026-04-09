import type { Translations } from "./en";

export const pl: Translations = {
  app: {
    title: "Pathfinder Nexus — Mistrz Gry AI",
    subtitle: "Deterministyczne narracje oparte na stanie dla Pathfinder 1e i 2e",
    footer: "PF1e: symulacja | PF2e: ekonomia trzech akcji",
  },
  versionPicker: {
    label: "Wybierz edycję Pathfindera",
    pf1e: "Pathfinder 1e — Symulacja narracyjna",
    pf2e: "Pathfinder 2e — Ekonomia trzech akcji",
  },
  storyDna: {
    title: "Konfiguracja Story DNA",
    sliders: {
      narrativePacing: {
        label: "Tempo narracji",
        description: "Kontroluje stosunek wątków fabularnych do walk.",
      },
      tacticalLethality: {
        label: "Śmiertelność taktyczna",
        description: "Wyższe wartości zwiększają zagrożenie ze strony potworów i środowiska.",
      },
      npcImprov: {
        label: "Improwizacja BN",
        description: "Jak często bohaterowie niezależni odchodzą od zaplanowanego skryptu.",
      },
    },
    tags: {
      includeLabel: "Uwzględnij motywy",
      excludeLabel: "Filtr slopu (wyklucz)",
      addPlaceholder: "Dodaj tag...",
    },
  },
  zones: {
    generate: "Generuj strefę",
    generating: "Generowanie...",
  },
};
