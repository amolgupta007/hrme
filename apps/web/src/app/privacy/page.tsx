import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLegalDoc } from "@/lib/legal";

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy",
  description: "How JambaHR collects, uses, and protects your data.",
};

export default async function PrivacyPage() {
  const doc = await getLegalDoc("privacy");
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0f]">
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Image src="/Jamba.png" alt="JambaHR" width={30} height={30} className="rounded-md" />
            <span><span className="text-primary">Jamba</span>HR</span>
          </Link>
        </div>
      </nav>
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective {doc.effective}</p>
        <div
          className="prose prose-neutral dark:prose-invert mt-10 max-w-none"
          dangerouslySetInnerHTML={{ __html: doc.content }}
        />
      </article>
    </main>
  );
}
