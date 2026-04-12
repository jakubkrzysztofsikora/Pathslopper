import { notFound, redirect } from "next/navigation";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { SessionIdSchema } from "@/lib/schemas/session";
import { AuthoringShell } from "@/components/authoring/authoring-shell";

interface Props {
  params: { id: string };
}

export default async function PrzygotowaniePage({ params }: Props) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) notFound();

  const session = await getSessionStore().get(idParse.data);
  if (!session) notFound();

  if (session.phase === "brief" || session.phase === "generating") {
    redirect(`/sesja/${idParse.data}`);
  }

  if (session.phase !== "authoring" && session.phase !== "approved") {
    redirect(`/sesja/${idParse.data}`);
  }

  if (!session.graph) notFound();

  return <AuthoringShell session={session} />;
}
