# Adapted interaction mechanisms — 01.11.2026

## Motion 14.7.1

Existing local runtime, unchanged. Actual Motion.animate calls drive hero choreography, navigation highlight, numeric carousel phase, service/step transitions and FAQ height. No framework or second runtime added.

## Magic UI — Shine Border (MIT)

Source: https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/shine-border.tsx

The layered radial-gradient background, transparent centre via paired masks and animated background-position are adapted in .contact-form-container[data-shine-border]::after. React props become CSS variables/rules. Animation runs on hover/focus, not forever, and respects reduced motion. Copyright notice retained in MAGIC-UI-LICENSE.md. The former Text Animate adaptation has been removed.

## Motion Primitives — Accordion (MIT)

Source: https://github.com/ibelick/motion-primitives/blob/main/components/core/accordion.tsx

Expanded/collapsed height and opacity variants are adapted in initConsultationIndex(). Native details/summary retain keyboard and no-JS behavior; vanilla Motion replaces AnimatePresence and React state. Interrupted transitions use a revision guard. Copyright notice retained in MOTION-PRIMITIVES-LICENSE.md.

## Aceternity UI — Tabs interaction study

Source: https://ui.aceternity.com/components/tabs
Registry inspected: https://ui.aceternity.com/registry/tabs.json

The selected-background movement and active-panel depth informed the original vanilla implementation in initServiceScenes(): an independently written moving marker and restrained translate/scale/rotateX transition. No React source, package, paid asset or dependency is copied into this project.

## Custom work

Category carousel: one numeric phase produces sin/cos position, rotation, depth and scale. Pointer drag, horizontal trackpad input, autoplay scheduling and reduced-motion fallback are native JavaScript. Hero, surfaces, layouts and photography framing are project-specific CSS.
