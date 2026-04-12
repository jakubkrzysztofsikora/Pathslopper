import { notFound, redirect } from "next/navigation";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { SessionIdSchema } from "@/lib/schemas/session";
import { ExpiredSessionScreen } from "@/components/sessions/expired-session-screen";
import { SessionHeader } from "@/components/sessions/session-header";
import { PlayShell } from "@/components/play/play-shell";

interface SessionPageProps {
  params: { id: string };
}

export default async function SessionPage({ params }: SessionPageProps) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    notFound();
  }

  const session = await getSessionStore().get(idParse.data);

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <ExpiredSessionScreen sessionId={idParse.data} />
      </main>
    );
  }

  // Redirect to authoring if in that phase
  if (session.phase === "authoring") {
    redirect(`/sesja/${idParse.data}/przygotowanie`);
  }

  // Play phases
  if (
    session.phase === "approved" ||
    session.phase === "playing" ||
    session.phase === "ended"
  ) {
    return <PlayShell session={session} />;
  }

  // brief / generating — show the waiting UI with header
  return (
    <main
      className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:py-12"
      data-testid="session-page"
    >
      <SessionHeader session={session} />
      <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-6 text-zinc-400">
        Sesja {session.id} — trwa generowanie grafu sesji.
      </section>
    </main>
  );
}
