---
date: 2026-04-12
commit: 18e2c95
branch: main
ticket: n/a
status: draft
---

# Plan: UI Redesign — Dark Fantasy PF2e Aesthetic

## Summary

Transform all 5 Pathfinder Nexus frontend pages from functional-but-plain Tailwind to an immersive dark fantasy TTRPG aesthetic with animations, using `motion` (framer-motion), enhanced Tailwind config, and the existing component primitives. No backend/schema/orchestration changes.

## Research References

- Handover: `.claude/HANDOVER.md` (2026-04-12)
- Existing plan: `thoughts/shared/plans/2026-04-11-session-graph-autonomous-gm.md`
- Skills: `frontend-design`, `motion-framer`, `shadcnblocks`, `animated-component-libraries`, `ui-ux-pro-max`, `ux-designer`, `modern-web-design`

## Key Observations

- **No animation library installed** — `framer-motion`/`motion` must be added to `dependencies`
- **Tailwind config is minimal** — no custom animations, no extended keyframes, no fantasy fonts
- **CSS variables already defined** in `globals.css` — good foundation to extend
- **All components use `t()` i18n** — text stays untouched
- **All components have `data-testid`** — must preserve
- **React Flow v11** for authoring canvas — custom `SessionNodeComponent` and `ActGroupNode`
- **No Google Fonts imported** — can add a serif/display font for headings

## Phase 0: Foundation — Animation Library + Tailwind Theme

### Changes

#### File: `package.json`
- **What**: Add `motion` (modern framer-motion) dependency
- **Where**: `dependencies` section
- **Rationale**: All 5 pages need entrance/exit animations, hover effects, layout transitions. `motion` is the React animation standard.
- **Code sketch**:
  ```bash
  npm install motion
  ```

#### File: `tailwind.config.ts`
- **What**: Extend theme with dark fantasy palette, custom keyframe animations, and optional display font
- **Where**: `theme.extend` section
- **Rationale**: Centralizes the aesthetic so all pages share the same visual language
- **Code sketch**:
  ```ts
  // After
  extend: {
    colors: {
      // existing amber/zinc preserved
      blood: { 500: "#8b0000", 600: "#6b0000" },
      parchment: { 100: "#f5e6c8", 200: "#e8d5a3" },
      ember: { 400: "#ff6b35", 500: "#e85d26" },
    },
    fontFamily: {
      display: ["'Cinzel'", "serif"],  // Fantasy heading font
      sans: [/* existing stack */],
    },
    keyframes: {
      "fade-in-up": {
        "0%": { opacity: "0", transform: "translateY(12px)" },
        "100%": { opacity: "1", transform: "translateY(0)" },
      },
      "pulse-glow": {
        "0%, 100%": { boxShadow: "0 0 8px rgba(245, 158, 11, 0.3)" },
        "50%": { boxShadow: "0 0 20px rgba(245, 158, 11, 0.6)" },
      },
      "typewriter": {
        "from": { width: "0" },
        "to": { width: "100%" },
      },
      "clock-tick": {
        "0%, 100%": { transform: "scale(1)" },
        "50%": { transform: "scale(1.15)" },
      },
    },
    animation: {
      "fade-in-up": "fade-in-up 0.5s ease-out",
      "pulse-glow": "pulse-glow 2s infinite",
      "typewriter": "typewriter 2s steps(40) forwards",
      "clock-tick": "clock-tick 0.3s ease-in-out",
    },
    backgroundImage: {
      "dark-vignette": "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.8) 100%)",
    },
  },
  ```

#### File: `src/app/globals.css`
- **What**: Add Google Font import for Cinzel, extend CSS variables, add subtle texture/grain overlay
- **Where**: Top of file + `:root` block
- **Code sketch**:
  ```css
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap');

  :root {
    /* existing vars preserved */
    --glow-amber: 0 0 20px rgba(245, 158, 11, 0.4);
    --glow-red: 0 0 20px rgba(220, 38, 38, 0.4);
    --glow-emerald: 0 0 20px rgba(16, 185, 129, 0.4);
  }

  /* Subtle noise texture overlay for depth */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,…"); /* tiny noise SVG */
    z-index: 9999;
  }
  ```

#### File: `src/app/layout.tsx`
- **What**: Add `font-display` class availability (Cinzel for headings)
- **Where**: `<body>` className
- **Rationale**: Makes `font-display` available via Tailwind utility classes

### Success Criteria

#### Automated Verification
- [ ] `npm install` succeeds with `motion` added
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] All 437 tests pass: `npm run test`

#### Manual Verification
- [ ] `font-display` class renders Cinzel in browser
- [ ] Noise texture overlay visible but subtle
- [ ] Existing pages look the same (no regressions from palette additions)

### Dependencies
- Requires: nothing
- Blocks: Phases 1–5

---

## Phase 1: Homepage — Hero + Session List

### Changes

#### File: `src/components/shell/app-header.tsx`
- **What**: Add subtle glassmorphism, animated logo text with amber glow on hover
- **Where**: Entire component
- **Rationale**: Header is the first thing users see; sets the tone
- **Code sketch**:
  ```tsx
  // Add: import { motion } from "motion/react"
  // Wrap app name in motion.span with hover scale
  // Add bg-gradient-to-r from-zinc-950/90 to-zinc-900/90 backdrop-blur-lg
  ```

#### File: `src/components/shell/onboarding-hero.tsx`
- **What**: Full redesign — animated entrance, gradient background with vignette, glowing CTA button, staggered step card animations
- **Where**: Entire component
- **Rationale**: Hero is the product's first impression; needs to convey dark fantasy PF2e immediately
- **Code sketch**:
  ```tsx
  // Wrap section in motion.section with fade-in-up
  // Background: bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 + bg-dark-vignette overlay
  // Title: font-display text-4xl sm:text-5xl with amber gradient text
  // CTA Button: animate-pulse-glow on hover
  // Step cards: motion.li with staggerChildren (0.15s delay per card)
  // Each step card: glass border, hover:scale-[1.02] transition
  ```

#### File: `src/components/sessions/session-card.tsx`
- **What**: Add hover lift effect, subtle border glow, version badge with icon
- **Where**: Card wrapper + Badge
- **Code sketch**:
  ```tsx
  // Wrap Card in motion.div with whileHover={{ y: -4, boxShadow: "var(--glow-amber)" }}
  // Add transition-all duration-300 to Card
  // PF2e badge: add a subtle d20 icon or ⚔ prefix
  ```

#### File: `src/components/sessions/session-list.tsx`
- **What**: Add staggered entrance animation for grid children
- **Where**: Grid container
- **Code sketch**:
  ```tsx
  // Wrap grid in motion.div with staggerChildren
  // Each SessionCard wrapper: motion.div with fade-in-up variant
  ```

#### File: `src/app/page.tsx`
- **What**: Add decorative section divider between hero and sessions
- **Where**: Between OnboardingHero and SessionList section
- **Code sketch**:
  ```tsx
  // Add: <div className="mx-auto h-px w-32 bg-gradient-to-r from-transparent via-amber-600 to-transparent" />
  ```

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `data-testid="onboarding-hero"`, `data-testid="session-list"`, `data-testid="session-card"` still present

#### Manual Verification
- [ ] Hero has immersive dark fantasy feel with animated entrance
- [ ] Step cards stagger in one by one
- [ ] CTA button has ambient glow
- [ ] Session cards lift on hover
- [ ] Footer divider is subtle and elegant
- [ ] Cinzel font renders on hero title

### Dependencies
- Requires: Phase 0
- Blocks: nothing (parallel with Phase 2–5 after Phase 0)

---

## Phase 2: Wizard — Animated Step Transitions

### Changes

#### File: `src/components/sessions/new-session-wizard.tsx`
- **What**: Wrap each step in `AnimatePresence` + `motion.div` for slide transitions; polish step indicator with connected line; improve form styling
- **Where**: Step rendering section (step 0–4 conditionals)
- **Rationale**: Wizard is the second most-visited page; animated transitions make 5-step flow feel smooth
- **Code sketch**:
  ```tsx
  // Import: import { motion, AnimatePresence } from "motion/react"

  // Step indicator: connected dots with progress line
  // Replace ol with: flex items-center connected by animated line segments
  // Active step: scale-110 with amber glow ring
  // Completed step: emerald checkmark icon

  // Step content: wrap in AnimatePresence mode="wait"
  // Each step: <motion.div key={step} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>

  // Preset cards (step 1): Add hover:border-amber-500/50 hover:shadow-[var(--glow-amber)] transition
  // Form inputs (step 2): consistent dark fantasy styling with focus:ring glow
  // Safety tools section: more prominent visual hierarchy with shield icon

  // Summary (step 4): animated data reveal, dl items slide in sequentially
  // Finish button: larger with pulse-glow animation when ready
  ```

#### File: `src/components/story-dna/story-dna-config.tsx`
- **What**: Polish slider styling with amber track fill
- **Where**: Slider render
- **Rationale**: Custom preset exposes DNA sliders; they should match the fantasy theme

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] All `data-testid="wizard-step-*"`, `data-testid="wizard-next-*"`, `data-testid="wizard-preset-*"` preserved

#### Manual Verification
- [ ] Steps slide in/out with smooth animation
- [ ] Step indicator shows connected progress with active glow
- [ ] Preset cards have hover glow effect
- [ ] Form inputs have consistent dark fantasy styling
- [ ] Safety tools section visually prominent
- [ ] Finish button glows when ready
- [ ] Back/next navigation feels smooth

### Dependencies
- Requires: Phase 0
- Blocks: nothing

---

## Phase 3: Authoring UI — PF2e-Themed Graph Editor

### Changes

#### File: `src/components/authoring/graph-canvas.tsx`
- **What**: Enhance SessionNodeComponent with fantasy card styling (parchment-tinted headers, kind-colored left border accent, subtle inner shadow). Enhance ActGroupNode with act-themed gradients.
- **Where**: `SessionNodeComponent` and `ActGroupNode` memo components
- **Rationale**: The React Flow canvas is where GMs spend most authoring time; immersive node cards reinforce the PF2e world-building feel
- **Code sketch**:
  ```tsx
  // SessionNodeComponent:
  // - Replace border-2 with: border-l-4 (kind color) + border border-zinc-700
  // - Add: bg-gradient-to-r from-zinc-800 to-zinc-850
  // - Add: hover:shadow-lg hover:border-zinc-500 transition-all
  // - Kind badge: rounded-full with kind-colored bg at 20% opacity
  // - High tension (>=8): add subtle red glow shadow

  // ActGroupNode:
  // - Add: act-themed subtle gradient overlay
  // - Act I: faint emerald tint, Act II: faint amber tint, Act III: faint red tint
  // - Better typography for act label
  ```

#### File: `src/components/authoring/authoring-shell.tsx`
- **What**: Polish sidebar sections with collapsible headers, better NPC/Clock/Secret visual cards
- **Where**: Left sidebar `<aside>`
- **Rationale**: Sidebar is dense with information; visual hierarchy helps GMs scan quickly
- **Code sketch**:
  ```tsx
  // NPC list items: small avatar circle with first letter + role badge
  // Clock section: use ClockTracker component (already imported)
  // Secret items: add a lock icon prefix, hover to reveal full text
  // Section headers: add subtle separator lines between sections
  ```

#### File: `src/components/authoring/graph-editor-toolbar.tsx`
- **What**: Group buttons into logical clusters with separators; add icon hints
- **Where**: Button row
- **Code sketch**:
  ```tsx
  // Group: [Read/Edit toggle] | [Regen buttons] | [Validate + Save] | [Approve]
  // Add thin zinc-700 vertical dividers between groups
  // Approve button: animate-pulse-glow when validation passes (warningCount === 0)
  ```

#### File: `src/components/authoring/node-inspector.tsx`
- **What**: Polish form fields with section grouping, kind-colored header accent, better NPC toggle chips
- **Where**: Entire inspector panel
- **Code sketch**:
  ```tsx
  // Header: kind badge with colored bar + node title in font-display
  // Group fields into: "Treść" (content) and "Powiązania" (relations) sections
  // NPC chips: pill-shaped with avatar initials
  // Tension slider: custom styled with gradient track (green→yellow→red)
  // When predicate: syntax-highlighted JSON display
  ```

#### File: `src/components/authoring/clock-tracker.tsx` (authoring variant)
- **What**: Enhance clock widget with circular SVG segments instead of square divs
- **Where**: Entire component
- **Rationale**: Clocks are a core Blades in the Dark mechanic; circular display is the canonical TTRPG representation
- **Code sketch**:
  ```tsx
  // Replace square segments with SVG circle divided into N segments (pie slices)
  // Filled segments: polarity-colored with subtle glow
  // Animation: when segment fills, scale pulse + color flash
  ```

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] React Flow canvas renders and is interactive (pan/zoom/select)

#### Manual Verification
- [ ] Session nodes have fantasy card styling with kind-colored accents
- [ ] Act groups have themed tints
- [ ] Sidebar NPCs show initials + role
- [ ] Clocks display as circular segments
- [ ] Toolbar button groups are visually separated
- [ ] Inspector shows kind-themed header
- [ ] Edit mode enables/disables fields correctly

### Dependencies
- Requires: Phase 0
- Blocks: nothing

---

## Phase 4: Play Runtime — Immersive Narration

### Changes

#### File: `src/components/play/play-shell.tsx`
- **What**: Add ambient background gradient that shifts with tension; polish header with clock pulse
- **Where**: Root div + header
- **Code sketch**:
  ```tsx
  // Background: dynamic gradient based on last move type
  //   hard → faint red tinge, soft → faint amber, question → faint blue
  // Header: add subtle border-b glow matching current tension
  ```

#### File: `src/components/play/narration-feed.tsx`
- **What**: Add fade-in animation for new entries, move-type colored left border, GM avatar indicator
- **Where**: Entry rendering
- **Code sketch**:
  ```tsx
  // Import: import { motion, AnimatePresence } from "motion/react"
  // Wrap entries in AnimatePresence
  // Each entry: motion.div with initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
  // GM entries: left border-2 colored by move type (red/amber/blue/zinc)
  // Player entries: right-aligned with different bg, indented further
  // Move tag: pill-shaped badge with move color
  // Auto-scroll preserved via bottomRef
  ```

#### File: `src/components/play/choice-pane.tsx`
- **What**: Dramatic choice buttons with hover glow and entrance animation
- **Where**: Choice button rendering
- **Code sketch**:
  ```tsx
  // Wrap choices in motion.div with staggerChildren
  // Each choice: motion.button with whileHover={{ scale: 1.02, boxShadow: "var(--glow-amber)" }}
  // Style: larger padding, amber left border, font-display for label text
  // When awaiting-choice: choices pulse subtly to draw attention
  // Free-text area: styled textarea with better placeholder styling
  ```

#### File: `src/components/play/clock-tracker.tsx` (play variant)
- **What**: Circular SVG clocks (same as authoring), plus tick animation when segments fill
- **Where**: ClockWidget component
- **Code sketch**: Same circular SVG approach as Phase 3 authoring clock-tracker

#### File: `src/components/play/character-switcher.tsx`
- **What**: Add character portrait placeholder (initials in colored circle), active character glow ring
- **Where**: Character buttons
- **Code sketch**:
  ```tsx
  // Add: circular avatar with first 2 letters of name, colored by character index
  // Active: ring-2 ring-amber-500 shadow-[var(--glow-amber)]
  // Spotlight debt indicator: more prominent with tooltip
  ```

#### File: `src/components/play/pending-roll.tsx`
- **What**: Add dice roll animation (d20 spinning/bouncing), dramatic reveal
- **Where**: Roll button + result display
- **Code sketch**:
  ```tsx
  // Modal backdrop: add subtle radial gradient
  // Dice roll button: larger, with d20 icon
  // On roll: animate a brief spin/bounce of a d20 icon for 400ms
  // DC display: larger, more prominent with amber glow
  ```

#### File: `src/components/play/party-split-banner.tsx`
- **What**: Add animated entrance and pulsing warning icon
- **Where**: Banner div
- **Code sketch**:
  ```tsx
  // Wrap in motion.div with slideDown animation
  // Add pulsing warning triangle icon (lucide-react AlertTriangle)
  ```

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Play shell renders with header, feed, choices, and sidebar

#### Manual Verification
- [ ] Narration entries fade in smoothly
- [ ] Move types shown as colored border + badge
- [ ] Choice buttons have dramatic hover effect
- [ ] Clocks display as circular segments with tick animation
- [ ] Character switcher shows avatar circles
- [ ] Roll modal has dice animation
- [ ] Party split banner slides in with warning icon

### Dependencies
- Requires: Phase 0
- Blocks: nothing

---

## Phase 5: Ending Screen — Climactic Reveal

### Changes

#### File: `src/components/play/ending-screen.tsx`
- **What**: Staged reveal animation — category badge fades in first, then title scales up, then summary types in, then action buttons slide up. Category-specific ambient effects.
- **Where**: Entire component
- **Code sketch**:
  ```tsx
  // Import: import { motion } from "motion/react"

  // Container: full-screen with category-themed gradient background
  //   victory: faint emerald radial glow
  //   mixed: faint amber radial glow
  //   pyrrhic: faint orange radial glow
  //   defeat: faint red vignette
  //   tpk: deep red pulsing vignette
  //   runaway: neutral with fog-like gradient

  // Staged animation sequence (staggerChildren 0.4s):
  //   1. Category badge: fade in from above
  //   2. Title: scale from 0.8 to 1.0 with font-display
  //   3. Summary: fade in paragraph
  //   4. Action buttons: slide up from below

  // Title: font-display text-4xl sm:text-5xl with category color
  // Category badge: larger, with animated border

  // Buttons: book icon for bookmark, arrow icon for new session
  ```

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes

#### Manual Verification
- [ ] Ending title reveals with dramatic scale animation
- [ ] Category-specific background gradient is visible
- [ ] Summary fades in after title
- [ ] Buttons slide up last
- [ ] Victory ending feels triumphant (emerald glow)
- [ ] TPK ending feels devastating (red pulse)

### Dependencies
- Requires: Phase 0
- Blocks: nothing

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `motion` bundle size bloat | Medium | Low | Tree-shaking is default; only import used components |
| Animations cause layout shift on slow devices | Low | Medium | Use `will-change` and GPU-accelerated transforms only |
| Google Font load failure | Low | Low | Fallback to system serif via font stack |
| React Flow custom node re-renders break | Low | High | Preserve memo() wrappers; test canvas interactivity |
| Test failures from DOM structure changes | Medium | Medium | Keep all data-testid attributes; don't change component tree semantics |
| Circular SVG clocks break clock state tracking | Low | Medium | SVG is purely visual; state logic stays in worldState.clocks |

## Rollback Strategy

Each phase modifies only visual/presentational code — no schema, orchestration, or state logic changes. Rollback any phase by reverting its commits. Phase 0 (tailwind + motion) can be reverted independently if animation approach is rejected.

## File Ownership Summary

| File | Phase | Change Type |
|------|-------|-------------|
| `package.json` | 0 | Modify (add motion) |
| `tailwind.config.ts` | 0 | Modify (extend theme) |
| `src/app/globals.css` | 0 | Modify (fonts + vars) |
| `src/app/layout.tsx` | 0 | Modify (font class) |
| `src/app/page.tsx` | 1 | Modify (divider) |
| `src/components/shell/app-header.tsx` | 1 | Modify (glassmorphism) |
| `src/components/shell/onboarding-hero.tsx` | 1 | Modify (full visual redesign) |
| `src/components/sessions/session-card.tsx` | 1 | Modify (hover effects) |
| `src/components/sessions/session-list.tsx` | 1 | Modify (stagger animation) |
| `src/components/sessions/new-session-wizard.tsx` | 2 | Modify (step transitions) |
| `src/components/story-dna/story-dna-config.tsx` | 2 | Modify (slider polish) |
| `src/components/authoring/graph-canvas.tsx` | 3 | Modify (node styling) |
| `src/components/authoring/authoring-shell.tsx` | 3 | Modify (sidebar polish) |
| `src/components/authoring/graph-editor-toolbar.tsx` | 3 | Modify (button groups) |
| `src/components/authoring/node-inspector.tsx` | 3 | Modify (form polish) |
| `src/components/authoring/clock-tracker.tsx` | 3 | Modify (circular SVG) |
| `src/components/play/play-shell.tsx` | 4 | Modify (ambient bg) |
| `src/components/play/narration-feed.tsx` | 4 | Modify (fade-in + borders) |
| `src/components/play/choice-pane.tsx` | 4 | Modify (dramatic buttons) |
| `src/components/play/clock-tracker.tsx` | 4 | Modify (circular SVG) |
| `src/components/play/character-switcher.tsx` | 4 | Modify (avatars) |
| `src/components/play/pending-roll.tsx` | 4 | Modify (dice animation) |
| `src/components/play/party-split-banner.tsx` | 4 | Modify (slide-in) |
| `src/components/play/ending-screen.tsx` | 5 | Modify (staged reveal) |
