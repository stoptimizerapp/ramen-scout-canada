import type { AnchorHTMLAttributes } from "react";
import { publicPath } from "@/lib/content-publication.js";

type SiteLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export function SiteLink({ href, children, ...props }: SiteLinkProps) {
  return <a href={publicPath(href)} {...props}>{children}</a>;
}
