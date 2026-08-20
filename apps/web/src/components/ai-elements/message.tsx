"use client";;
import { Button } from "../ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "../ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Streamdown, type PluginConfig } from "streamdown";

export type MessageRole = "user" | "assistant" | "system";

export const Message = ({
  className,
  from,
  ...props
}: ComponentProps<"div"> & { from: MessageRole }) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props} />
);

export const MessageContent = ({
  children,
  className,
  ...props
}: ComponentProps<"div">) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}>
    {children}
  </div>
);

export const MessageActions = ({
  className,
  children,
  ...props
}: ComponentProps<"div">) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: ComponentProps<typeof Button> & { tooltip?: ReactNode; label?: string }) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

type MessageBranchContextValue = {
  branches: ReactNode[];
  currentBranch: number;
  goToNext: () => void;
  goToPrevious: () => void;
  setBranches: Dispatch<SetStateAction<ReactNode[]>>;
  totalBranches: number;
};

const MessageBranchContext = createContext<MessageBranchContextValue | null>(null);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error("MessageBranch components must be used within MessageBranch");
  }

  return context;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: ComponentProps<"div"> & {
  defaultBranch?: number;
  onBranchChange?: (branch: number) => void;
}) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactNode[]>([]);

  const handleBranchChange = useCallback((newBranch: number) => {
    setCurrentBranch(newBranch);
    onBranchChange?.(newBranch);
  }, [onBranchChange]);

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo(() => ({
    branches,
    currentBranch,
    goToNext,
    goToPrevious,
    setBranches,
    totalBranches: branches.length,
  }), [branches, currentBranch, goToNext, goToPrevious]);

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div className={cn("grid w-full gap-2 [&>div]:pb-0", className)} {...props} />
    </MessageBranchContext.Provider>
  );
};

export const MessageBranchContent = ({
  children,
  ...props
}: ComponentProps<"div">) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(() => (Array.isArray(children) ? children : [children]), [children]);

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return (childrenArray as ReactElement[]).map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}>
      {branch}
    </div>
  ));
};

export const MessageBranchSelector = ({
  className,
  ...props
}: ComponentProps<typeof ButtonGroup>) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props} />
  );
};

export const MessageBranchPrevious = ({
  children,
  ...props
}: ComponentProps<typeof Button>) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}>
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export const MessageBranchNext = ({
  children,
  ...props
}: ComponentProps<typeof Button>) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}>
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export const MessageBranchPage = ({
  className,
  ...props
}: ComponentProps<typeof ButtonGroupText>) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn("border-none bg-transparent text-muted-foreground shadow-none", className)}
      {...props}>
      {currentBranch + 1}of {totalBranches}
    </ButtonGroupText>
  );
};

// `@streamdown/code@1.1.1` resuelve shiki@3 mientras `streamdown@2.5.0` resuelve shiki@4, así
// que sus `BundledLanguage` no son el mismo tipo aunque el plugin sea correcto en runtime. El
// cast acota esa duplicación de shiki al único punto donde se nota; el arreglo de verdad es
// deduplicar shiki en el grafo de dependencias.
const streamdownPlugins = { cjk, code, math, mermaid } as PluginConfig;

type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  isAnimating?: boolean;
};

export const MessageResponse = memo(({
  className,
  ...props
}: MessageResponseProps) => (
  <Streamdown
    className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
    plugins={streamdownPlugins}
    {...props} />
), (prevProps: MessageResponseProps, nextProps: MessageResponseProps) =>
  prevProps.children === nextProps.children &&
  nextProps.isAnimating === prevProps.isAnimating);

MessageResponse.displayName = "MessageResponse";

export const MessageToolbar = ({
  className,
  children,
  ...props
}: ComponentProps<"div">) => (
  <div
    className={cn("mt-4 flex w-full items-center justify-between gap-4", className)}
    {...props}>
    {children}
  </div>
);
