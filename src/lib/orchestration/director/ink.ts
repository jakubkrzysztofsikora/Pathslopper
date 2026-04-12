// inkjs/full provides both Story and Compiler via ESM.
// The default `inkjs` export only ships Story + InkList (no Compiler).
// We import from `inkjs/full` which is the complete bundle.
// compileGraph lazy-imports via dynamic import so vitest (jsdom env) loads
// the ESM module correctly — per Amendment C footgun note.
import { Story } from "inkjs";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { renderInkSource } from "./render-ink";

export { Story };

// ---------------------------------------------------------------------------
// compileGraph — render graph to Ink source and compile to JSON
// Uses dynamic import for Compiler (inkjs/full) to avoid ESM issues in vitest.
// On any compiler or serialisation error, returns compiledJson:"" with the
// error surfaced in warnings so callers can treat it as a soft failure.
// ---------------------------------------------------------------------------
export async function compileGraph(graph: SessionGraph): Promise<{
  compiledJson: string;
  warnings: string[];
}> {
  const { Compiler } = await import("inkjs/full");
  const source = renderInkSource(graph);

  let compiledJson: string;
  let warnings: string[];
  try {
    const compiler = new Compiler(source);
    compiler.Compile();

    if (compiler.errors.length > 0) {
      const errorMsg = `Ink compilation errors:\n${compiler.errors.join("\n")}`;
      return { compiledJson: "", warnings: [errorMsg] };
    }

    const story = compiler.runtimeStory;
    if (!story) {
      return {
        compiledJson: "",
        warnings: [
          `Ink compiler produced no runtimeStory. Source excerpt:\n${source.slice(0, 500)}`,
        ],
      };
    }

    const json = story.ToJson() as string | null | undefined;
    if (!json) {
      return {
        compiledJson: "",
        warnings: [
          `Ink compiler ToJson() returned empty result. Source excerpt:\n${source.slice(0, 500)}`,
        ],
      };
    }

    // Validate the JSON has expected top-level keys before handing to Story
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (parseErr) {
      return {
        compiledJson: "",
        warnings: [
          `Ink compiled JSON is not valid JSON: ${String(parseErr)}. Source excerpt:\n${source.slice(0, 500)}`,
        ],
      };
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("inkVersion" in parsed) ||
      !("root" in parsed)
    ) {
      return {
        compiledJson: "",
        warnings: [
          `Ink compiled JSON missing required keys (inkVersion, root). Source excerpt:\n${source.slice(0, 500)}`,
        ],
      };
    }

    compiledJson = json;
    warnings = [...compiler.warnings];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      compiledJson: "",
      warnings: [
        `Ink compilation threw unexpectedly: ${message}. Source excerpt:\n${source.slice(0, 500)}`,
      ],
    };
  }

  return { compiledJson, warnings };
}

// ---------------------------------------------------------------------------
// compileInkSource — compile raw .ink source (no graph rendering step)
// Helper used in tests and inline compilation paths.
// Throws on compiler errors (unlike compileGraph which returns soft failures).
// ---------------------------------------------------------------------------
export async function compileInkSource(source: string): Promise<{
  compiledJson: string;
  warnings: string[];
}> {
  const { Compiler } = await import("inkjs/full");
  const compiler = new Compiler(source);

  try {
    compiler.Compile();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Ink compiler threw unexpectedly: ${message}`);
  }

  if (compiler.errors.length > 0) {
    throw new Error(
      `Ink compilation errors:\n${compiler.errors.join("\n")}`
    );
  }

  const story = compiler.runtimeStory;
  if (!story) {
    throw new Error("Ink compiler produced no runtimeStory");
  }

  const compiledJson = story.ToJson() as string;
  return { compiledJson, warnings: [...compiler.warnings] };
}

// ---------------------------------------------------------------------------
// createStory — instantiate a Story from compiled JSON
// Wraps the Story constructor so a corrupt JSON string (e.g. missing root
// pointers that cause inkjs JsonSerialisation to throw) surfaces as a
// structured error rather than an unhandled TypeError crashing the server.
// ---------------------------------------------------------------------------
export function createStory(compiledJson: string): Story {
  // Validate JSON structure before handing to the Story constructor.
  // inkjs can throw TypeError: Cannot read properties of null (reading '^->')
  // when the compiled JSON has a corrupt container/pointer structure.
  let parsed: unknown;
  try {
    parsed = JSON.parse(compiledJson);
  } catch (err) {
    throw new Error(
      `createStory: compiledJson is not valid JSON. ${String(err)}`
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("inkVersion" in parsed) ||
    !("root" in parsed)
  ) {
    throw new Error(
      "createStory: compiledJson missing required inkVersion or root keys. " +
        "This usually means the Ink source contained syntax that compiled to corrupt JSON. " +
        "Check render-ink.ts escaping."
    );
  }

  try {
    return new Story(compiledJson);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `inkjs failed to load compiled story: ${message}. ` +
        "This usually means the Ink source contained syntax that compiled to corrupt JSON. " +
        "Check render-ink.ts escaping."
    );
  }
}

// ---------------------------------------------------------------------------
// InkContinueResult
// ---------------------------------------------------------------------------
export interface InkContinueResult {
  narration: string;
  choices: { index: number; label: string }[];
  ended: boolean;
}

// ---------------------------------------------------------------------------
// continueMaximally — run story until it stops and collect output
// ---------------------------------------------------------------------------
export function continueMaximally(story: Story): InkContinueResult {
  const narration = story.canContinue ? story.ContinueMaximally() ?? "" : "";
  const choices = story.currentChoices.map((c, i) => ({
    index: i,
    label: c.text ?? "",
  }));
  const ended = !story.canContinue && choices.length === 0;
  return { narration, choices, ended };
}

// ---------------------------------------------------------------------------
// choose — pick a choice by index
// ---------------------------------------------------------------------------
export function choose(story: Story, choiceIndex: number): void {
  story.ChooseChoiceIndex(choiceIndex);
}

// ---------------------------------------------------------------------------
// saveState / loadState — serialise and restore story state
// ---------------------------------------------------------------------------
export function saveState(story: Story): string {
  return story.state.ToJson();
}

export function loadState(story: Story, json: string): void {
  story.state.LoadJson(json);
}

// ---------------------------------------------------------------------------
// bindExternalFunction — register an external Ink function implementation
// ---------------------------------------------------------------------------
export function bindExternalFunction(
  story: Story,
  name: string,
  fn: (...args: unknown[]) => unknown
): void {
  story.BindExternalFunction(
    name,
    fn as Story.ExternalFunction,
    false
  );
}

// ---------------------------------------------------------------------------
// currentKnot — read the current path string from story state
// ---------------------------------------------------------------------------
export function currentKnot(story: Story): string | undefined {
  return story.state.currentPathString ?? undefined;
}

// ---------------------------------------------------------------------------
// getVariable / setVariable — read and write Ink global variables
// ---------------------------------------------------------------------------
export function getVariable(story: Story, name: string): unknown {
  return story.variablesState.$(name);
}

export function setVariable(story: Story, name: string, value: unknown): void {
  story.variablesState.$(name, value as Parameters<typeof story.variablesState.$>[1]);
}
