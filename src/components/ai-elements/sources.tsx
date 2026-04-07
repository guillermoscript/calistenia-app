"use client";;
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { cn } from "../../lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";

export const Sources = ({
  className,
  ...props
}: any) => (
  <Collapsible
    className={cn("not-prose mb-4 text-primary text-xs", className)}
    {...props} />
);

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: any) => (
  <CollapsibleTrigger className={cn("flex items-center gap-2", className)} {...props}>
    {children ?? (
      <>
        <p className="font-medium">Used {count} sources</p>
        <ChevronDownIcon className="h-4 w-4" />
      </>
    )}
  </CollapsibleTrigger>
);

export const SourcesContent = ({
  className,
  ...props
}: any) => (
  <CollapsibleContent
    className={cn(
      "mt-3 flex w-fit flex-col gap-2",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props} />
);

export const Source = ({
  href,
  title,
  children,
  ...props
}: any) => (
  <a
    className="flex items-center gap-2"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}>
    {children ?? (
      <>
        <BookIcon className="h-4 w-4" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </a>
);
