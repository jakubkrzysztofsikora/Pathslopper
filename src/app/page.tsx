import { VersionPicker } from "@/components/version-picker";
import { StoryDNAConfig } from "@/components/story-dna/story-dna-config";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
          Pathfinder Nexus{" "}
          <span className="text-amber-500">— AI Game Master</span>
        </h1>
        <p className="text-zinc-400 text-base">
          Deterministic state-driven storytelling. Calibrate your DNA, generate
          tactical zones, and parse character sheets with vision AI.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-6">
        <VersionPicker />
      </section>

      <StoryDNAConfig />

      <footer className="border-t border-zinc-800 pt-4 text-xs text-zinc-500 text-center">
        PF1e: simulation | PF2e: three-action economy
      </footer>
    </main>
  );
}
