"use client";;
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { BookmarkIcon } from "lucide-react";

export const Checkpoint = ({
  className,
  children,
  ...props
}: any) => (
  <div
    className={cn(
      "flex items-center gap-0.5 overflow-hidden text-muted-foreground",
      className
    )}
    {...props}>
    {children}
    <Separator />
  </div>
);

export const CheckpointIcon = ({
  className,
  children,
  ...props
}: any) =>
  children ?? (
    <BookmarkIcon className={cn("size-4 shrink-0", className)} {...props} />
  );

export const CheckpointTrigger = ({
  children,
  variant = "ghost",
  size = "sm",
  tooltip,
  ...props
}: any) =>
  tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} type="button" variant={variant} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
    </Button>
  );
