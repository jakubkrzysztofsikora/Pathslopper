import type { SessionBrief } from "@/lib/schemas/session-brief";
import {
  buildGeneratorChain,
  type StageBInput,
  type StageCInput,
  type StageDInput,
  type StageEInput,
  type StageFInput,
} from "@/lib/prompts/session-generator";
import type { ImportedSections } from "./markdown-parser";
import {
  EXTRACT_OR_FILL_PREFIX_PL,
  extendWithSynthesizedPaths,
  formatImportedSections,
} from "./extract-or-fill";

export interface ImportStageInput<Base> {
  brief: SessionBrief;
  sections: ImportedSections;
  base?: Base;
}

export interface ImportStageAInput {
  brief: SessionBrief;
  sections: ImportedSections;
}

export type ImportStageBInput = StageBInput & { sections: ImportedSections };
export type ImportStageCInput = StageCInput & { sections: ImportedSections };
export type ImportStageDInput = StageDInput & { sections: ImportedSections };
export type ImportStageEInput = StageEInput & { sections: ImportedSections };
export type ImportStageFInput = StageFInput & {
  brief: SessionBrief;
  sections: ImportedSections;
};

function wrapPrompt(
  base: { system: string; user: string },
  sections: ImportedSections
): { system: string; user: string } {
  const system = `${EXTRACT_OR_FILL_PREFIX_PL}\n\n${base.system}`;
  const notes = formatImportedSections(sections);
  const frontmatterHints = buildFrontmatterHintLine(sections);
  const user = `${notes}${frontmatterHints}\n\n---\n\n${base.user}\n\nUWAGA: Dołącz pole \"synthesizedPaths\" w odpowiedzi JSON (może być {} jeżeli wszystko wyekstrahowano z NOTATEK).`;
  return { system, user };
}

function buildFrontmatterHintLine(sections: ImportedSections): string {
  const fm = sections.frontmatter;
  const hints: string[] = [];
  if (fm.party_level !== undefined) hints.push(`party_level=${fm.party_level}`);
  if (fm.party_size !== undefined) hints.push(`party_size=${fm.party_size}`);
  if (fm.duration_hours !== undefined) hints.push(`duration_hours=${fm.duration_hours}`);
  if (fm.system) hints.push(`system=${fm.system}`);
  if (hints.length === 0) return "";
  return `\n\nWSKAZÓWKI Z FRONTMATTER: ${hints.join(", ")}`;
}

export interface ImportChain {
  stageA: {
    schema: ReturnType<typeof extendWithSynthesizedPaths<ReturnType<typeof buildGeneratorChain>["stageA"]["schema"]["shape"]>>;
    temperature: number;
    buildPrompt: (input: ImportStageAInput) => { system: string; user: string };
  };
  stageB: {
    schema: ReturnType<typeof extendWithSynthesizedPaths<ReturnType<typeof buildGeneratorChain>["stageB"]["schema"]["shape"]>>;
    temperature: number;
    buildPrompt: (input: ImportStageBInput) => { system: string; user: string };
  };
  stageC: {
    schema: ReturnType<typeof extendWithSynthesizedPaths<ReturnType<typeof buildGeneratorChain>["stageC"]["schema"]["shape"]>>;
    temperature: number;
    buildPrompt: (input: ImportStageCInput) => { system: string; user: string };
  };
  stageD: {
    schema: ReturnType<typeof extendWithSynthesizedPaths<ReturnType<typeof buildGeneratorChain>["stageD"]["schema"]["shape"]>>;
    temperature: number;
    buildPrompt: (input: ImportStageDInput) => { system: string; user: string };
  };
  stageE: {
    schema: ReturnType<typeof extendWithSynthesizedPaths<ReturnType<typeof buildGeneratorChain>["stageE"]["schema"]["shape"]>>;
    temperature: number;
    buildPrompt: (input: ImportStageEInput) => { system: string; user: string };
  };
  stageF: {
    schema: ReturnType<typeof extendWithSynthesizedPaths<ReturnType<typeof buildGeneratorChain>["stageF"]["schema"]["shape"]>>;
    temperature: number;
    buildPrompt: (input: ImportStageFInput) => { system: string; user: string };
  };
}

export function buildImportChain(): ImportChain {
  const gen = buildGeneratorChain();

  return {
    stageA: {
      schema: extendWithSynthesizedPaths(gen.stageA.schema),
      temperature: gen.stageA.temperature,
      buildPrompt: ({ brief, sections }) =>
        wrapPrompt(gen.stageA.buildPrompt(brief), sections),
    },
    stageB: {
      schema: extendWithSynthesizedPaths(gen.stageB.schema),
      temperature: gen.stageB.temperature,
      buildPrompt: ({ sections, ...rest }) =>
        wrapPrompt(gen.stageB.buildPrompt(rest), sections),
    },
    stageC: {
      schema: extendWithSynthesizedPaths(gen.stageC.schema),
      temperature: gen.stageC.temperature,
      buildPrompt: ({ sections, ...rest }) =>
        wrapPrompt(gen.stageC.buildPrompt(rest), sections),
    },
    stageD: {
      schema: extendWithSynthesizedPaths(gen.stageD.schema),
      temperature: gen.stageD.temperature,
      buildPrompt: ({ sections, ...rest }) =>
        wrapPrompt(gen.stageD.buildPrompt(rest), sections),
    },
    stageE: {
      schema: extendWithSynthesizedPaths(gen.stageE.schema),
      temperature: gen.stageE.temperature,
      buildPrompt: ({ sections, ...rest }) =>
        wrapPrompt(gen.stageE.buildPrompt(rest), sections),
    },
    stageF: {
      schema: extendWithSynthesizedPaths(gen.stageF.schema),
      temperature: gen.stageF.temperature,
      buildPrompt: ({ sections, ...rest }) => {
        const base = gen.stageF.buildPrompt(rest);
        const wrapped = wrapPrompt(base, sections);
        // Stage F has a stronger override: never trust user-supplied stat
        // blocks. Inject an additional directive above the generator prompt.
        const statBlockOverride = `STAT BLOKI PF2e — IMPORT MODE
- Nigdy nie kopiuj stat bloków z notatek użytkownika (edycja może być niepoprawna, liczby mogą być błędne).
- Generuj każdy stat blok zgodnie z GMG Table 2-5 dla partyLevel=${rest.partyLevel}.
- Każdy wygenerowany stat blok MUSI być w synthesizedPaths (value=["*"]) — nawet jeżeli notatki zawierały nazwę potwora.`;
        return {
          system: `${wrapped.system}\n\n${statBlockOverride}`,
          user: wrapped.user,
        };
      },
    },
  };
}
