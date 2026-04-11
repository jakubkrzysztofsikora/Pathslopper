import { notFound } from "next/navigation";
import { PlayerInputConsole } from "@/components/interaction/player-input-console";
import { ExpiredSessionScreen } from "@/components/sessions/expired-session-screen";
import { SessionHeader } from "@/components/sessions/session-header";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { SessionIdSchema } from "@/lib/schemas/session";

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

  return (
    <main
      className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:py-12"
      data-testid="session-page"
    >
      <SessionHeader session={session} />
      <PlayerInputConsole sessionId={session.id} initialSession={session} />
    </main>
  );
}
