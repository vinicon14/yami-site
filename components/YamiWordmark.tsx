import Link from "next/link";

export function YamiWordmark({
  href = "/",
  size = 28,
  className = "",
}: {
  href?: string | null;
  size?: number;
  className?: string;
}) {
  const mark = (
    <>
      {/* Official YAMI mark: rounded square + inward chevrons */}
      <img
        src="/yami-logo.svg"
        alt=""
        width={size}
        height={size}
        className="shrink-0"
        style={{ borderRadius: "20%" }}
      />
      <span className="text-[1.05rem] font-semibold tracking-tight">YAMI</span>
    </>
  );

  const cls = `inline-flex min-h-11 items-center gap-2.5 text-ink ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls} aria-label="YAMI, página inicial">
        {mark}
      </Link>
    );
  }
  return <span className={cls}>{mark}</span>;
}
