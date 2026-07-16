import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      t<span className="ai-mark">ai</span>ny
    </span>
  );
}

export function Logo({ href = "/", className = "text-2xl" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-1">
      <Wordmark className={className} />
    </Link>
  );
}
