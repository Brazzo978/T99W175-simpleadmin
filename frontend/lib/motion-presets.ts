import type { Variants } from "motion/react";

// Stagger container — fades-and-rises children with a 60ms cascade.
// Pair with `staggerItem` on direct children, and trigger with
// `initial="hidden" animate="visible"` on the container.
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

// Stagger item — slides up 8px and fades in over 250ms easeOut.
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};
