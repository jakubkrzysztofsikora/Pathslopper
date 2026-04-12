import { Annotation } from "@langchain/langgraph";
import type { Story } from "inkjs";
import type { WorldState } from "@/lib/schemas/session";
import type { DirectorInput, DirectorOutput } from "../director";

export const DirectorStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  input: Annotation<DirectorInput>(),
  // story is ephemeral — loaded per-tick, not serialized
  story: Annotation<Story | null>(),
  worldState: Annotation<WorldState>(),
  output: Annotation<DirectorOutput | null>(),
});

export type DirectorState = typeof DirectorStateAnnotation.State;
