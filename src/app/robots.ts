import type { MetadataRoute } from "next";

const BASE_URL = "https://jambahr.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [
        "/dashboard",
        "/onboarding",
        "/api",
        "/sign-in",
        "/sign-up",
        "/offers",
        "/hire",
        "/superadmin",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
