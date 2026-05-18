"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RouteEntry } from "@/lib/assistant/route-registry";

export function TakeMeThereButton({ route }: { route: RouteEntry }) {
  const search = route.params ? "?" + new URLSearchParams(route.params).toString() : "";
  return (
    <Link href={`${route.path}${search}`}>
      <Button size="sm" className="gap-1.5">
        Take me there <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </Link>
  );
}
