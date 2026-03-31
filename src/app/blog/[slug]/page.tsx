import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, getAllPosts } from "@/lib/blog";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — JambaHR Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

const CATEGORY_COLORS: Record<string, string> = {
  "Payroll & Compliance": "bg-emerald-100 text-emerald-700",
  "HR Templates": "bg-blue-100 text-blue-700",
  "HR Tips": "bg-violet-100 text-violet-700",
  "Product Updates": "bg-amber-100 text-amber-700",
};

export default async function BlogPostPage({ params }: Props) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">Jamba<span className="text-teal-600">HR</span></span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/blog" className="text-sm font-medium text-gray-600 hover:text-teal-600">← All posts</Link>
            <Link href="/sign-up" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${CATEGORY_COLORS[post.category] ?? "bg-gray-100 text-gray-600"}`}>
            {post.category}
          </span>
          <span className="text-xs text-gray-400">{post.readTime}</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight tracking-tight">
          {post.title}
        </h1>

        <p className="mt-4 text-lg text-gray-500 leading-relaxed">{post.excerpt}</p>

        <div className="mt-6 flex items-center gap-3 pb-8 border-b border-gray-100">
          <div className="h-9 w-9 rounded-full bg-teal-600 flex items-center justify-center text-white text-sm font-bold">
            {post.author.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">{post.author}</p>
            <p className="text-xs text-gray-400">
              {new Date(post.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Content */}
        <div
          className="blog-content mt-8 prose prose-gray prose-lg max-w-none
            prose-headings:font-bold prose-headings:text-gray-900
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-lg prose-h3:mt-7 prose-h3:mb-3
            prose-p:text-gray-600 prose-p:leading-relaxed
            prose-a:text-teal-600 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-gray-900
            prose-ul:text-gray-600 prose-ol:text-gray-600
            prose-li:my-1
            prose-code:bg-gray-100 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-gray-800
            prose-blockquote:border-l-teal-400 prose-blockquote:text-gray-500
            prose-hr:border-gray-200"
          dangerouslySetInnerHTML={{ __html: post.content ?? "" }}
        />
      </article>

      {/* CTA */}
      <section className="bg-gradient-to-br from-teal-50 to-emerald-50 border-t border-teal-100 py-14 px-4 mt-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900">Put this into practice with JambaHR</h2>
          <p className="mt-2 text-gray-500 text-sm">
            Automate leave management, payroll, compliance tracking and more — free for up to 10 employees.
          </p>
          <Link
            href="/sign-up"
            className="mt-6 inline-block rounded-xl bg-teal-600 text-white font-semibold px-6 py-3 text-sm hover:bg-teal-700 transition-colors"
          >
            Start free — no credit card needed →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-gray-400">
          <span>© 2025 JambaHR. All rights reserved.</span>
          <Link href="/blog" className="hover:text-gray-600">← Back to blog</Link>
        </div>
      </footer>
    </div>
  );
}
