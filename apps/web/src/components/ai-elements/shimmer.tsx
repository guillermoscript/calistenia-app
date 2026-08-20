"use client";;
import { cn } from "../../lib/utils";
import { motion, type DOMMotionComponents } from "motion/react";
import { memo, useMemo, type CSSProperties, type ReactNode } from "react";

type ShimmerTag = keyof DOMMotionComponents;

// Cache motion components at module level to avoid creating during render
const motionComponentCache = new Map<ShimmerTag, DOMMotionComponents[ShimmerTag]>();

// El componente se expone con la forma de `motion.p`: `DOMMotionComponents[ShimmerTag]` es la
// union de todos los tags y el JSX no puede resolver props contra una union. Las props de motion
// (`className`, `style`, `animate`, `transition`) son las mismas para todos los tags HTML, así
// que el único punto que el cast tapa es el juego de atributos propios del elemento, que este
// componente no usa.
const getMotionComponent = (element: ShimmerTag): typeof motion.p => {
  let component = motionComponentCache.get(element);
  if (!component) {
    component = motion.create(element);
    motionComponentCache.set(element, component);
  }
  return component as typeof motion.p;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2
}: {
  children?: ReactNode;
  as?: ShimmerTag;
  className?: string;
  duration?: number;
  spread?: number;
}) => {
  const MotionComponent = getMotionComponent(Component);

  const dynamicSpread = useMemo(() => {
    // Equivalente al `children?.length ?? 0` original: string y array tienen `length`,
    // cualquier otro ReactNode cuenta como 0.
    const length =
      typeof children === "string" || Array.isArray(children) ? children.length : 0;
    return length * spread;
  }, [children, spread]);

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,

          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))"
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}>
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
