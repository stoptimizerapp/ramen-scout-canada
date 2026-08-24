export function FactBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "positive" | "neutral" | "caution" }) {
  return <span className={`fact-badge badge-${tone}`}>{children}</span>;
}
