# TTRPG Expert UI/UX Review — 2026-04-12

## Overall Verdict: YELLOW

Full review from `ttrpg-gm-expert` agent after examining all 24 screenshots and all component source code.

## Browser Walkthrough Observations (2nd run with mock=true)

20 screenshots captured across the full flow: Homepage → Wizard (4 steps) → Session create → Mock generate → Authoring UI → Approve → Play Runtime → Homepage.

### Key Findings from Screenshots

1. **Generation dead-end**: Wizard creates session in `phase: brief` but never calls `/api/sessions/[id]/generate`. The session page shows "trwa generowanie grafu sesji" but nobody triggers it. UX bug — confirmed by TTRPG expert ("dead end with no feedback").

2. **Authoring canvas works**: 12 nodes visible in Act swim lanes (ELKjs layout). Left sidebar shows brief, NPCs (Mag, Klątwa), 2 clocks (Alarm, Szansa), 5 secrets. Node inspector panel on right. Toolbar has all buttons. Visually plain but functional.

3. **Play runtime — Director not responding**: After approve, autoplay produces fixture text ("Gracze stoją przed bramą. Monit sceny 2.") but free text player input gets NO GM response. Only player entries accumulate (T3→T7). Director API returns success but `narration` is empty/null — likely because fixture graph prompts are placeholders, not real content the LLM can narrate from.

4. **Clocks render as square divs**: "Alarm" (4 segments) and "Szansa" (6 segments) visible in play header. Unfilled. TTRPG expert flagged these should be circular SVG wheels (Blades in the Dark style).

5. **No ending reached**: Could not reach ending screen in browser — Director doesn't advance through fixture graph. Ending screen review was code-only.

6. **"Kontynuuj" button visible**: Choice pane shows this as a pre-set choice, but clicking it doesn't produce narration. The Director is likely failing silently on fixture graph prompts.

7. **No character sidebar**: Session created with 0 characters. Character switcher correctly hidden. Could not test spotlight debt or character switching.

---

## Verdicts Summary

| Area | Verdict | Key Issues |
|---|---|---|
| 1. Wizard Flow | YELLOW | Step ordering wrong (version before style); safety tools buried; slider labels opaque |
| 2. Session Brief Fields | GREEN | Add sessionGoal field; lower min duration to 2h; consider playerExperience enum |
| 3. Authoring UI | GREEN | English bleed on node kinds; tension slider needs anchors; NPC sidebar missing level |
| 4. Play Runtime | YELLOW | Roll modal sends string not structured data; no X-card button; no scene transition markers |
| 5. Ending Categories | GREEN | frontOutcomes not displayed; summary too short (400 chars) |
| 6. Overall UX Flow | YELLOW | Generation waiting state is dead end (no progress); no session delete; developer copy on homepage |
| 7. Visual Design | YELLOW | Reads as dev tool not TTRPG; needs serif headings, textured bg, companion accent color |

---

## Priority Fixes (YELLOW blockers)

### 1. Roll Modal — Mechanically Broken (Play Runtime)
- Current: sends `"Rzut: ${rollResult}"` as free text string to Director
- Fix: add dedicated `type: "roll-result"` input with `{ d20: number, modifier: number, total: number }`
- Show full PF2e roll resolution: d20 + modifier = total vs DC → degree of success
- Color the result by degree (crit success/success/failure/crit failure)

### 2. X-Card Button Missing (Play Runtime)
- Wizard collects `xCardEnabled` but play runtime has no way to invoke it
- Add persistent X-card button in play header when enabled
- On press: interrupt narration, discard last entry, emit safety message

### 3. Generation Waiting State (UX Flow)
- Currently shows flat "trwa generowanie grafu sesji" with no feedback
- Add 6-stage progress indicator: Szkielet → Sceny → Świat → Połączenia → Narracja → Stat bloki
- Poll server for stage completion

### 4. Wizard Step Ordering + Safety Tools (Wizard Flow)
- Merge Step 0 (PF edition) into Step 1 (Style) — reduces to 4 steps
- Promote safety tools to top of Brief step or own step
- Safety before content is the convention (Consent in Gaming, TTRPG Safety Toolkit)

### 5. Node Kind Polish Labels (Authoring UI)
- English kind values ("strong-start", "combat-rolled") bleed into Polish UI
- Add `KIND_LABEL_PL` map: "Silny start", "Walka narracyjna", "Walka z kostkami", etc.

---

## Strong Recommendations (GREEN but high-value)

### Session Brief
- Add `sessionGoal` field: "What should this session be about?" (one sentence)
- Change `targetDurationHours` min from 3 to 2
- Consider `playerExperience: enum("new", "moderate", "veteran")`

### Authoring UI
- Tension slider needs anchor labels: 0-2 = "Spokojnie", 3-5 = "Narastające napięcie", 6-7 = "Zagrożenie", 8-10 = "Kryzys"
- NPC sidebar: show level + threat tier, not just name + role
- (Post-MVP) Add "Dodaj scenę" / "Dodaj krawędź" buttons

### Play Runtime
- Add scene transition markers in narration feed ("--- Akt II: Ruiny Starożytnej Świątyni ---")
- Unify clock components: use SVG wheels from authoring in play too
- Party split banner trigger is dead code (showPartySplit never set to true)
- Player entries lost on refresh (useState, not persisted)

### Ending Screen
- Display `frontOutcomes` as bulleted list below summary
- Increase `summary` max to 800 chars or add `epilogue` field
- Consider `sacrifice` ending category (currently folded under pyrrhic)

### UX Flow
- Add delete button to session cards
- Hide raw session ID from UI
- Show session phase on cards with appropriate action buttons
- Rewrite homepage subtitle in GM language, not engineering language

---

## Visual Design Recommendations

1. **Typography**: Serif display font (Cinzel/Crimson Text) for headings, sans for body
2. **Textured backgrounds**: Subtle parchment grain at 5-10% opacity
3. **Node cards**: Inner glow/gradient based on kind color
4. **Clock wheels**: Make larger, add drop shadow, use consistently everywhere
5. **Narration feed**: Boxed text style (left border, indentation) not chat bubbles
6. **Ending screen**: Vignette, dramatic type, front outcomes as campaign summary
7. **Accent palette**: Promote deep crimson (#991b1b) and deep emerald (#065f46) as companion accents
8. **Polish file input**: Replace browser "Choose File" with styled "Wybierz plik" button

---

## Edge Cases Flagged

- PF1e toggle exists but PF1e is not truly supported → remove toggle or ship support
- TPK during autoplay → `ended` flag should break autoplay loop immediately
- Player refresh mid-session → narration entries lost (useState not persisted)
- Party split banner → dead code, never triggered
- Clock tracker → two different implementations (div-based play vs SVG authoring)

---

## Citations
- Sly Flourish, *Return of the Lazy Dungeon Master* (step ordering, session goal, prep checklist)
- Monte Cook Games, *Consent in Gaming* (safety before content)
- PF2e Core Rulebook Remastered Ch.9 (degrees of success formula)
- Apocalypse World 2nd Ed (hard/soft moves)
- Blades in the Dark SRD (progress clocks)
- Justin Alexander, Node-Based Scenario Design (three-clue rule, node graph)
