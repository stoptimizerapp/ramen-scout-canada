import Image from "next/image";
import { SiteLink as Link } from "@/components/SiteLink";

export function Logo() {
  return (
    <Link className="brand" href="/" aria-label="Ramen Scout home">
      <Image className="brand-image" src="/logo-mark.svg" width={44} height={44} alt="" aria-hidden="true" priority />
      <span>Ramen <strong>Scout</strong></span>
    </Link>
  );
}
