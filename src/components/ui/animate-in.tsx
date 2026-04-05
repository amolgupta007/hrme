"use client";

import { useEffect, useRef } from "react";

interface AnimateInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  animation?: "fade-up" | "fade-in" | "scale-in";
}

export function AnimateIn({
  children,
  className = "",
  delay = 0,
  animation = "fade-up",
}: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.style.opacity = "1";
            el.style.transform = "none";
            el.style.filter = "none";
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  const initialStyles: React.CSSProperties = {
    opacity: 0,
    transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)`,
  };

  if (animation === "fade-up") {
    initialStyles.transform = "translateY(28px)";
  } else if (animation === "scale-in") {
    initialStyles.transform = "scale(0.95) translateY(12px)";
  }
  // fade-in: just opacity, no transform

  return (
    <div ref={ref} style={initialStyles} className={className}>
      {children}
    </div>
  );
}
