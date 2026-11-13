import Link from "next/link";
import { formatPriceBrl, salesOpen } from "@/lib/config";

type Props = {
  href?: string;
  className?: string;
  children?: React.ReactNode;
  full?: boolean;
};

const base =
  "inline-flex items-center justify-center border px-4 py-2 text-sm transition-colors";
const enabled =
  "border-ink bg-ink text-paper hover:bg-rust hover:border-rust";
const disabled =
  "border-line bg-paper-2 text-muted cursor-default";

export function BuyButton({ href = "/checkout", className = "", children, full }: Props) {
  const open = salesOpen();
  const cls = `${base} ${open ? enabled : disabled} ${full ? "w-full" : ""} ${className}`;
  if (!open) {
    return (
      <span className={cls} aria-disabled="true" title="A venda abre em instantes.">
        Em breve
      </span>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children ?? `Comprar por ${formatPriceBrl()}`}
    </Link>
  );
}
