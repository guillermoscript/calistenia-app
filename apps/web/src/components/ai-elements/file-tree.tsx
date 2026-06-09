"use client";;
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { cn } from "../../lib/utils";
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// Default noop for context default value
// oxlint-disable-next-line eslint(no-empty-function)
const noop = () => {};

const FileTreeContext = createContext<any>({
  // oxlint-disable-next-line eslint-plugin-unicorn(no-new-builtin)
  expandedPaths: new Set(),
  togglePath: noop,
});

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onSelect,
  onExpandedChange,
  className,
  children,
  ...props
}: any) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expandedPaths = controlledExpanded ?? internalExpanded;

  const togglePath = useCallback((path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setInternalExpanded(newExpanded);
    onExpandedChange?.(newExpanded);
  }, [expandedPaths, onExpandedChange]);

  const contextValue = useMemo(
    () => ({ expandedPaths, onSelect, selectedPath, togglePath }),
    [expandedPaths, onSelect, selectedPath, togglePath]
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div
        className={cn("rounded-lg border bg-background font-mono text-sm", className)}
        role="tree"
        {...props}>
        <div className="p-2">{children}</div>
      </div>
    </FileTreeContext.Provider>
  );
};

export const FileTreeIcon = ({
  className,
  children,
  ...props
}: any) => (
  <span className={cn("shrink-0", className)} {...props}>
    {children}
  </span>
);

export const FileTreeName = ({
  className,
  children,
  ...props
}: any) => (
  <span className={cn("truncate", className)} {...props}>
    {children}
  </span>
);

const FileTreeFolderContext = createContext({
  isExpanded: false,
  name: "",
  path: "",
});

export const FileTreeFolder = ({
  path,
  name,
  className,
  children,
  ...props
}: any) => {
  const { expandedPaths, togglePath, selectedPath, onSelect } =
    useContext(FileTreeContext);
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;

  const handleOpenChange = useCallback(() => {
    togglePath(path);
  }, [togglePath, path]);

  const handleSelect = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const folderContextValue = useMemo(() => ({ isExpanded, name, path }), [isExpanded, name, path]);

  return (
    <FileTreeFolderContext.Provider value={folderContextValue}>
      <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
        <div className={cn("", className)} role="treeitem" tabIndex={0} {...props}>
          <div
            className={cn(
              "flex w-full items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50",
              isSelected && "bg-muted"
            )}>
            <CollapsibleTrigger asChild>
              <button
                className="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-0"
                type="button">
                <ChevronRightIcon
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isExpanded && "rotate-90"
                  )} />
              </button>
            </CollapsibleTrigger>
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-left"
              onClick={handleSelect}
              type="button">
              <FileTreeIcon>
                {isExpanded ? (
                  <FolderOpenIcon className="size-4 text-blue-500" />
                ) : (
                  <FolderIcon className="size-4 text-blue-500" />
                )}
              </FileTreeIcon>
              <FileTreeName>{name}</FileTreeName>
            </button>
          </div>
          <CollapsibleContent>
            <div className="ml-4 border-l pl-2">{children}</div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  );
};

const FileTreeFileContext = createContext({
  name: "",
  path: "",
});

export const FileTreeFile = ({
  path,
  name,
  icon,
  className,
  children,
  ...props
}: any) => {
  const { selectedPath, onSelect } = useContext(FileTreeContext);
  const isSelected = selectedPath === path;

  const handleClick = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      onSelect?.(path);
    }
  }, [onSelect, path]);

  const fileContextValue = useMemo(() => ({ name, path }), [name, path]);

  return (
    <FileTreeFileContext.Provider value={fileContextValue}>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/50",
          isSelected && "bg-muted",
          className
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        tabIndex={0}
        {...props}>
        {children ?? (
          <>
            {/* Spacer for alignment */}
            <span className="size-4 shrink-0" />
            <FileTreeIcon>
              {icon ?? <FileIcon className="size-4 text-muted-foreground" />}
            </FileTreeIcon>
            <FileTreeName>{name}</FileTreeName>
          </>
        )}
      </div>
    </FileTreeFileContext.Provider>
  );
};

const stopPropagation = (e) => e.stopPropagation();

export const FileTreeActions = ({
  className,
  children,
  ...props
}: any) => (
  <div
    className={cn("ml-auto flex items-center gap-1", className)}
    onClick={stopPropagation}
    onKeyDown={stopPropagation}
    role="group"
    {...props}>
    {children}
  </div>
);
