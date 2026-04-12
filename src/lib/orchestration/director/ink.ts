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
// ---------------------------------------------------------------------------
export async function compileGraph(graph: SessionGraph): Promise<{
  compiledJson: string;
  warnings: string[];
}> {
  const { Compiler } = await import("inkjs/full");
  const source = renderInkSource(graph);
  const compiler = new Compiler(source);
  compiler.Compile();

  if (compiler.errors.length > 0) {
    throw new Error(
      `Ink compilation errors:\n${compiler.errors.join("\n")}`
    );
  }

  const story = compiler.runtimeStory;
  const compiledJson = story.ToJson() as string;

  return { compiledJson, warnings: [...compiler.warnings] };
}

// ---------------------------------------------------------------------------
// compileInkSource — compile raw .ink source (no graph rendering step)
// Helper used in tests and inline compilation paths.
// ---------------------------------------------------------------------------
export async function compileInkSource(source: string): Promise<{
  compiledJson: string;
  warnings: string[];
}> {
  const { Compiler } = await import("inkjs/full");
  const compiler = new Compiler(source);
  compiler.Compile();

  if (compiler.errors.length > 0) {
    throw new Error(
      `Ink compilation errors:\n${compiler.errors.join("\n")}`
    );
  }

  const story = compiler.runtimeStory;
  const compiledJson = story.ToJson() as string;

  return { compiledJson, warnings: [...compiler.warnings] };
}

// ---------------------------------------------------------------------------
// createStory — instantiate a Story from compiled JSON
// ---------------------------------------------------------------------------
export function createStory(compiledJson: string): Story {
  return new Story(compiledJson);
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
