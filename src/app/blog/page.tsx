import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — JambaHR | HR Tips, Payroll Guides & Compliance for Indian Businesses",
  description: "Practical guides on Indian payroll, leave policies, compliance, and HR management for small and medium businesses.",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Payroll & Compliance": "bg-emerald-100 text-emerald-700",
  "HR Templates": "bg-blue-100 text-blue-700",
  "HR Tips": "bg-violet-100 text-violet-700",
  "Product Updates": "bg-amber-100 text-amber-700",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">Jamba<span className="text-teal-600">HR</span></span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/blog" className="text-sm font-medium text-teal-600">Blog</Link>
            <Link href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link href="/sign-up" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-50 via-white to-emerald-50 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">HR Insights for Indian Businesses</h1>
          <p className="mt-4 text-lg text-gray-500">
            Plain-English guides on payroll, compliance, leave policies, and people management — written for founders and operators, not HR professionals.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-14">
        {posts.length === 0 ? (
          <p className="text-center text-gray-400">No posts yet. Check back soon.</p>
        ) : (
          <div className="space-y-8">
            {posts.map((post) => (
              <article key={post.slug} className="group rounded-2xl border border-gray-100 bg-white hover:border-teal-200 hover:shadow-md transition-all p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${CATEGORY_COLORS[post.category] ?? "bg-gray-100 text-gray-600"}`}>
                    {post.category}
                  </span>
                  <span className="text-xs text-gray-400">{post.readTime}</span>
                </div>
                <Link href={`/blog/${post.slug}`}>
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-teal-700 transition-colors leading-snug">
                    {post.title}
                  </h2>
                </Link>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">{post.excerpt}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">
                      {post.author.charAt(0)}
                    </div>
                    <span className="text-xs text-gray-500">{post.author}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {new Date(post.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <Link href={`/blog/${post.slug}`} className="text-sm font-medium text-teal-600 hover:text-teal-700 group-hover:underline">
                    Read more →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="bg-teal-600 py-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white">Stop managing HR in spreadsheets</h2>
          <p className="mt-2 text-teal-100 text-sm">JambaHR handles leave, payroll, reviews, and compliance — free for up to 10 employees.</p>
          <Link
            href="/sign-up"
            className="mt-6 inline-block rounded-xl bg-white text-teal-700 font-semibold px-6 py-3 text-sm hover:bg-teal-50 transition-colors"
          >
            Get started free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-gray-400">
          <span>© 2025 JambaHR. All rights reserved.</span>
          <Link href="/" className="hover:text-gray-600">← Back to JambaHR</Link>
        </div>
      </footer>
    </div>
  );
}
