import { getAllDocs, getDoc } from "@/lib/docs";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowLeft } from "lucide-react";

export async function generateStaticParams() {
  const docs = await getAllDocs();
  return docs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getDoc(slug);
  return { title: doc ? `${doc.title} — Mintra Docs` : "Not Found" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [doc, allDocs] = await Promise.all([getDoc(slug), getAllDocs()]);

  if (!doc) notFound();

  return (
    <div className="flex gap-10">
      {/* Sidebar */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <div className="sticky top-6">
          <Link
            href="/docs"
            className="mb-5 flex items-center gap-1.5 text-xs font-medium text-slate transition hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All docs
          </Link>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate/60">
            Pages
          </p>
          <nav className="flex flex-col gap-0.5">
            {allDocs.map((d) => (
              <a
                key={d.slug}
                href={`/docs/${d.slug}`}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  d.slug === slug
                    ? "bg-fog font-medium text-ink"
                    : "text-slate hover:bg-fog/60 hover:text-ink"
                }`}
              >
                {d.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <article className="min-w-0 flex-1">
        {/* Mobile breadcrumb */}
        <Link
          href="/docs"
          className="mb-6 flex items-center gap-1.5 text-xs font-medium text-slate transition hover:text-ink lg:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All docs
        </Link>

        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <BookOpen className="h-3.5 w-3.5" />
          Documentation
        </div>

        <div
          className="prose prose-sm prose-slate max-w-none
            prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-ink
            prose-h1:text-3xl prose-h2:mt-10 prose-h2:text-xl prose-h3:text-base
            prose-p:leading-7 prose-p:text-slate
            prose-a:text-ink prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-slate
            prose-code:rounded prose-code:bg-fog prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.8em] prose-code:font-normal prose-code:text-ink prose-code:before:content-none prose-code:after:content-none
            prose-pre:rounded-2xl prose-pre:border prose-pre:border-line prose-pre:bg-fog/60 prose-pre:text-sm
            prose-blockquote:border-line prose-blockquote:text-slate
            prose-li:text-slate prose-li:leading-7
            prose-hr:border-line
            prose-strong:text-ink prose-strong:font-semibold"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered markdown
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      </article>
    </div>
  );
}
