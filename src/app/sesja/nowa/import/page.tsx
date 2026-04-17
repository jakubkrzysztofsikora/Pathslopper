import Link from "next/link";
import { ImportStep } from "@/components/sessions/import-step";

export default function ImportSessionPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link
          href="/sesja/nowa"
          className="text-zinc-400 underline decoration-dotted underline-offset-4 hover:text-amber-400"
        >
          ← Wróć do generowania od zera
        </Link>
      </div>
      <ImportStep />
    </main>
  );
}
