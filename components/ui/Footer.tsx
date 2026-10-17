"use client";
import { usePathname } from "next/navigation";
import { Credits } from "./Credits";

export function Footer() {
  const path = usePathname();
  if (path === "/rocket" || path.startsWith("/rocket/")) return null;
  return <Credits />;
}
