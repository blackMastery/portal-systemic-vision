import type { Variants } from "framer-motion";

const easing = [0, 0, 0.2, 1] as const;
const duration = 0.25;

/** Fade up: items enter from 8px below with opacity */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration, ease: easing } },
};

/** Stagger container: wraps a list of fadeUp children */
export const staggerList: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04 },
  },
};

/** Slide in from left: used for sidebar panels */
export const slideIn: Variants = {
  hidden: { opacity: 0, x: -8 },
  show:   { opacity: 1, x: 0, transition: { duration, ease: easing } },
};

/** Scale in: used for modals and dropdowns */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show:   { opacity: 1, scale: 1, transition: { duration, ease: easing } },
};
