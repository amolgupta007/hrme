import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/cron/assistant-insights/route";

describe("assistant-insights cron auth", () => {
  it("rejects requests without the bearer token", async () => {
    const res = await GET(new Request("https://x/api/cron/assistant-insights"));
    expect(res.status).toBe(401);
  });
  it("rejects a wrong token", async () => {
    const res = await GET(
      new Request("https://x/api/cron/assistant-insights", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
