import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export default function HelpPage() {
  const sections: { title: string; body: string }[] = [
    {
      title: t("help.sectionDnaTitle"),
      body: t("help.sectionDnaBody"),
    },
    {
      title: t("help.sectionDegreesTitle"),
      body: t("help.sectionDegreesBody"),
    },
    {
      title: t("help.sectionMgTitle"),
      body: t("help.sectionMgBody"),
    },
    {
      title: t("help.sectionSessionsTitle"),
      body: t("help.sectionSessionsBody"),
    },
  ];

  return (
    <main
      className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12"
      data-testid="help-page"
    >
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{t("help.title")}</h1>
        <p className="mt-2 text-base text-zinc-300">{t("help.lead")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription className="leading-relaxed">
                {s.body}
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>

      <div>
        <Link href="/">
          <Button variant="ghost">{t("help.back")}</Button>
        </Link>
      </div>
    </main>
  );
}
