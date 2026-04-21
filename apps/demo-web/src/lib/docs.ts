import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";

const DOCS_DIR = path.resolve(process.cwd(), "../../docs");

export interface DocMeta {
  slug: string;
  title: string;
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTitle(content: string, slug: string): string {
  const match = /^#\s+(.+)$/m.exec(content);
  return match?.[1]?.trim() ?? slugToTitle(slug);
}

export async function getAllDocs(): Promise<DocMeta[]> {
  const files = await fs.readdir(DOCS_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
  return mdFiles.map((f) => {
    const slug = f.replace(/\.md$/, "");
    return { slug, title: slugToTitle(slug) };
  });
}

export async function getDoc(slug: string): Promise<{ title: string; html: string } | null> {
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const title = extractTitle(content, slug);
    const html = await marked(content, { gfm: true });
    return { title, html };
  } catch {
    return null;
  }
}
