import { getAllDocs } from "@/lib/docs";
import { BookOpen, ArrowRight } from "lucide-react";

export const metadata = { title: "Docs — Mintra" };

export default async function DocsIndexPage() {
  const docs = await getAllDocs();

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <BookOpen className="h-3.5 w-3.5" />
          Documentation
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Mintra Docs</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate">
          Architecture, security model, integration guides, and design decisions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {docs.map((doc) => (
          <a
            key={doc.slug}
            href={`/docs/${doc.slug}`}
            className="group flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4 shadow-sm transition hover:border-ink/20 hover:shadow-md"
          >
            <span className="text-sm font-medium text-ink">{doc.title}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate transition group-hover:translate-x-0.5 group-hover:text-ink" />
          </a>
        ))}
      </div>
    </div>
  );
}
