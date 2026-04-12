---
date: 2026-04-12
commit: 5bdbeee
branch: main
ticket: n/a
status: draft
---

# Plan: Polish Language Quality + Authoring UX Guidance

## Summary

Fix broken Polish in LLM-generated content by adding explicit grammar/terminology instructions to all 6 generation prompts, translate "DC" → "ST" (stopień trudności) everywhere, and add clear UX guidance in the authoring graph editor so GMs know what to do next.

## User Feedback (verbatim)

> "Some Polish words look weird — words don't exist, just look like something that could exist in PL, or direct English-to-Polish copy. E.g. 'Skryb' instead of 'skryba'. 'Szpieg Oscar' sometimes called 'Oskarowy szpieg'. DC should be translated as 'ST' — in Polish TTRPG it's an acronym we use (stopień trudności)."
>
> "I'm kind of lost on the view with graph — what should be done with it next, how do we play it? Why can't I move/add graph nodes, how should I edit the story? It should be intuitive for TTRPG players and human GMs."

---

## Phase 1: Polish Language Quality in LLM Prompts

### Problem

The `POLISH_OUTPUT_CLAUSE` says "Odpowiadaj po polsku" but gives no guidance on:
- Correct Polish declension/inflection (cases, genders)
- Consistent NPC naming (once named, always use the same form)
- TTRPG-specific Polish terminology (DC→ST, AC→KP, HP→PW, etc.)
- Avoiding nonexistent words (LLM invents plausible-sounding but wrong forms)

### Changes

#### File: `src/lib/prompts/system/gm-core.ts`
- **What**: Expand `POLISH_OUTPUT_CLAUSE` with explicit grammar/terminology rules and a terminology glossary
- **Where**: `POLISH_OUTPUT_CLAUSE` constant, line ~14
- **Rationale**: This clause is imported by all 5 player-facing stage prompts; fixing it once fixes everything
- **Code sketch**:
  ```ts
  export const POLISH_OUTPUT_CLAUSE = `Odpowiadaj wyłącznie po polsku. Pisz poprawną, naturalną polszczyzną.

  ODMIANA (DEKLINACJA) — to kluczowe dla naturalnego brzmienia:
  - Polski ma 7 przypadków. Używaj ich poprawnie: "widzę strażnika" (biernik), "mówię do strażnika" (dopełniacz), "daję strażnikowi" (celownik)
  - Przymiotniki odmieniaj zgodnie z rodzajem i przypadkiem: "mroczny las" (mianownik), "w mrocznym lesie" (miejscownik), "mrocznego lasu" (dopełniacz)
  - Czasowniki odmieniaj przez osoby: "drużyna wchodzi", "gracze widzą", "strażnik atakuje"
  - NIE zostawiaj słów w mianowniku gdy kontekst wymaga innego przypadka
  - Jeśli nie znasz poprawnej odmiany słowa, przeformułuj zdanie zamiast używać błędnej formy
  
  RZECZYWISTE SŁOWA:
  - Nigdy nie wymyślaj słów które brzmią polsko ale nie istnieją
  - "skryba" nie "skryb", "złodziej" nie "złodziejnik", "strażnik" nie "strażnicz"
  - Jeśli nie znasz poprawnej polskiej formy, użyj opisu lub pozostaw termin w oryginale

  TERMINOLOGIA POLSKICH RPG (używaj ZAWSZE):
  - DC → ST (stopień trudności), np. "ST 18" nie "DC 18"
  - AC → KP (klasa pancerza)
  - HP → PW (punkty wytrzymałości) 
  - saving throw → rzut obronny
  - skill check → test umiejętności
  - attack roll → rzut na atak
  - damage → obrażenia
  - critical hit → trafienie krytyczne
  - initiative → inicjatywa
  - perception → Percepcja (z wielkiej litery jako umiejętność)

  SPÓJNOŚĆ IMION:
  - Gdy NPC dostanie imię, ZAWSZE używaj tego samego imienia w tej samej formie
  - NIE twórz przymiotnikowych form imion (nie "Oskarowy szpieg" gdy NPC nazywa się "Oscar")
  - Imiona własne NIE odmieniaj przez przypadki jeśli nie jesteś pewien formy

  RZECZOWNIKI I ODMIANY:
  - Użyj poprawnych form słów: "skryba" nie "skryb", "strażnik" nie "strażnicz"
  - Jeśli nie znasz poprawnej polskiej formy słowa, użyj opisu zamiast wymyślać słowo

  Zachowuj terminologię Pathfindera jak w polskich podręcznikach (np. "rzut na atak", 
  "stopień sukcesu", "klasa pancerza", "test umiejętności"). Nie tłumacz nazw własnych 
  klas, ras ani zaklęć utrwalonych w polskich podręcznikach (np. Fighter, Rogue, Fireball 
  pozostają bez zmian). Jeśli musisz wypisać strukturę danych (JSON), pola i klucze trzymaj 
  po angielsku — tylko wartości tekstowe po polsku.`;
  ```

#### File: `src/lib/prompts/session-generator/stage-c-worldkit.ts`
- **What**: Replace "DC" with "ST" in the few-shot example and prompt text
- **Where**: Lines ~65, ~110
- **Code sketch**:
  ```
  Before: "Recall Knowledge: Historia DC 18"
  After:  "Przypominanie Wiedzy: Historia ST 18"
  
  Before: "Test Przypominania Wiedzy: Prawo DC 18"
  After:  "Test Przypominania Wiedzy: Prawo ST 18"
  ```

#### File: `src/lib/prompts/session-generator/stage-f-statblocks.ts`
- **What**: In the system prompt, note that DC fields should use "ST" label in any Polish text output, but keep the JSON field name as `dc` (schema compatibility)
- **Where**: Lines ~74, ~78
- **Rationale**: Stage F is English-only (mechanical stat blocks), but the special abilities strings sometimes contain Polish text with "DC"
- **Code sketch**:
  ```
  Before: "Breath Weapon (2d6 fire, DC 18, 30-foot cone)"
  After:  "Breath Weapon (2d6 fire, ST 18, 30-foot cone)"
  ```

#### File: `src/lib/prompts/banned-phrases.ts`
- **What**: Add common LLM-invented Polish words to the banned list
- **Where**: Banned phrases array
- **Rationale**: The banned phrases filter already strips English LLM-isms; extend it to catch common Polish fabrications

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test -- --run` passes (437 tests)
- [ ] Integration test passes (re-run may be needed due to LLM non-determinism)

#### Manual Verification
- [ ] Generate a new session on prod and verify NPC names are consistent
- [ ] Verify secrets use "ST" not "DC"
- [ ] Verify no obviously fabricated Polish words in generated content
- [ ] Check that TTRPG terms like "stopień trudności" appear in output

### Dependencies
- Requires: nothing
- Blocks: nothing

---

## Phase 2: DC → ST in UI Components

### Changes

#### File: `src/lib/i18n/pl.ts`
- **What**: Audit all i18n keys for "DC" references, ensure they use "ST" (stopień trudności)
- **Where**: The i18n dictionary already has `pendingRollDc: "KT"` — verify this is correct (should be "ST" for stopień trudności, not "KT" which is klasa trudności — a less common abbreviation)
- **Code sketch**:
  ```ts
  // Verify/fix:
  pendingRollDc: "ST",           // stopień trudności (was "KT")
  consoleDcLabel: "ST (opcjonalnie)",  // was "KT / KP (opcjonalnie)"
  ```

#### File: `src/components/play/pending-roll.tsx`
- **What**: The label next to the DC value should read "ST" not "DC"
- **Where**: Line ~47, the `{t("play.pendingRollDc")}` label — already uses i18n, so fixing the dictionary is sufficient

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] i18n test passes (all keys present)

#### Manual Verification
- [ ] Pending roll modal shows "ST: 18" not "DC: 18" or "KT: 18"

### Dependencies
- Requires: nothing
- Blocks: nothing

---

## Phase 3: Authoring UX — Onboarding + Guidance

### Problem

User lands on the authoring graph and is lost:
- No explanation of what the graph IS or what to do next
- No call-to-action toward playing the session
- Can't add/move/delete nodes (read-only by default)
- Edit mode exists but isn't discoverable
- "Zatwierdź" (Approve) button isn't clearly the "start playing" path

### Changes

#### File: `src/components/authoring/authoring-shell.tsx`
- **What**: Add an onboarding banner at the top of the authoring view that explains the workflow and key actions. Show it until dismissed (localStorage flag).
- **Where**: Above the toolbar, inside the root flex container
- **Rationale**: First-time users need to understand: "This is your session graph. Review it, edit if needed, then Approve to start playing."
- **Code sketch**:
  ```tsx
  // New component: AuthoringOnboarding
  // Shows: 
  //   "Twój graf sesji jest gotowy! 🎲"
  //   "To jest mapa Twojej sesji — sceny, NPC, powiązania fabularne."
  //   "1. Przejrzyj graf — kliknij węzły aby zobaczyć szczegóły"
  //   "2. Włącz Tryb edycji aby zmienić tytuły, opisy i NPC w scenach"  
  //   "3. Kliknij Zatwierdź gdy będziesz gotowy do gry"
  //   [Rozumiem] button to dismiss
  ```

#### File: `src/components/authoring/graph-editor-toolbar.tsx`
- **What**: Make the Approve button more prominent — add descriptive text "Zatwierdź i graj" (Approve and play) instead of just "Zatwierdź"
- **Where**: Approve button, last item in toolbar
- **Code sketch**:
  ```tsx
  // Change button text:
  // Before: t("authoring.toolbarApprove") → "Zatwierdź"
  // After: "Zatwierdź i graj ▶"
  ```

#### File: `src/components/authoring/node-inspector.tsx`
- **What**: When no node is selected, show a helpful prompt instead of just "Wybierz węzeł na grafie"
- **Where**: The empty state (node === null)
- **Code sketch**:
  ```tsx
  // Before: "Wybierz węzeł na grafie, aby go edytować."
  // After: 
  //   "Kliknij dowolny węzeł na grafie"
  //   "Zobaczysz tutaj:"
  //   "• Tytuł i opis sceny"
  //   "• NPC obecne w scenie"  
  //   "• Poziom napięcia"
  //   "• Warunki przejścia"
  //   "Włącz 'Tryb edycji' w pasku narzędzi aby móc zmieniać zawartość."
  ```

#### File: `src/lib/i18n/pl.ts`
- **What**: Add new i18n keys for the onboarding banner and improved empty state
- **Where**: `authoring` section of the dictionary

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test -- --run` passes
- [ ] i18n test passes (new keys present)

#### Manual Verification
- [ ] First visit to authoring shows the onboarding banner
- [ ] Dismissing the banner persists across page reloads
- [ ] Empty inspector state shows helpful guidance
- [ ] Approve button says "Zatwierdź i graj ▶"
- [ ] A new user can figure out the workflow without external help

### Dependencies
- Requires: nothing
- Blocks: nothing

---

## Phase 4: ElevenLabs TTS Narration Voice

### Problem

The play runtime is text-only. GM narration should be spoken aloud — this is the single biggest immersion upgrade for a TTRPG tool. ElevenLabs supports Polish via `eleven_multilingual_v2` and `eleven_flash_v2_5` models.

### Architecture

```
PlayShell → Director API → narration text
                              ↓
                        POST /api/tts
                              ↓
                      ElevenLabs REST API
                              ↓
                        audio/mpeg stream
                              ↓
                      <audio> element in NarrationFeed
```

- **Server-side API route** (`/api/tts`) — proxies to ElevenLabs REST API so the API key stays server-side
- **Config-driven voice** — `ELEVENLABS_VOICE_ID` env var, no UI picker for now
- **Streaming** — ElevenLabs supports chunked streaming; we pipe the response directly
- **Client plays inline** — each GM narration entry gets a play button; audio auto-plays on new entries (with user opt-in)

### Changes

#### File: `src/app/api/tts/route.ts` (NEW)
- **What**: Server-side TTS proxy route. Accepts `{ text: string }`, calls ElevenLabs `/v1/text-to-speech/{voice_id}`, streams audio back.
- **Rationale**: API key must stay server-side; client calls our proxy
- **Code sketch**:
  ```ts
  // POST /api/tts
  // Body: { text: string }
  // Returns: audio/mpeg stream
  //
  // Env vars:
  //   ELEVENLABS_API_KEY — ElevenLabs API key
  //   ELEVENLABS_VOICE_ID — voice ID (default: configurable)
  //   ELEVENLABS_MODEL_ID — model (default: eleven_multilingual_v2)
  
  export async function POST(request: NextRequest) {
    const { text } = await request.json();
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "P2244jTXPnenPJjaAnTC";
    const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3";
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "TTS not configured" }, { status: 503 });
    }
    
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.6, similarity_boost: 0.8 },
        }),
      }
    );
    
    if (!res.ok || !res.body) {
      return NextResponse.json({ ok: false, error: "TTS generation failed" }, { status: 502 });
    }
    
    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  ```

#### File: `src/components/play/narration-feed.tsx`
- **What**: Add a play/pause button on each GM narration entry. When a new GM entry arrives, auto-fetch TTS and play it.
- **Where**: Inside the entry rendering, after the text
- **Code sketch**:
  ```tsx
  // New hook: useTTS(text: string, autoPlay: boolean)
  // Returns: { audioUrl: string | null, playing: boolean, toggle: () => void }
  //
  // On mount (if autoPlay): POST /api/tts with entry text, create blob URL, play
  // Play button: small speaker icon, toggles audio playback
  // Loading state: pulsing speaker icon while TTS is generating
  //
  // Only for speaker === "gm" entries — player entries don't get narrated
  ```

#### File: `src/lib/prompts/session-generator/stage-e-prose.ts`
- **What**: Add instruction to include ElevenLabs v3 emotion tags in node prompts for TTS expressiveness
- **Where**: System prompt STYL section
- **Rationale**: eleven_v3 model interprets `[whispers]`, `[laughs]`, `[sighs]`, `[dramatic pause]` etc. as vocal instructions. Adding these to the node prompt text means TTS narration will have emotional expression without any post-processing.
- **Code sketch**:
  ```
  // Add to STYL section:
  - Wplataj znaczniki emocji dla narracji głosowej w nawiasach kwadratowych: 
    [szeptem], [głośno], [ze śmiechem], [z westchnieniem], [dramatyczna pauza], 
    [z gniewem], [z przerażeniem], [spokojnie], [z nadzieją]
  - Używaj ich oszczędnie — 1-3 na prompt, w kluczowych momentach dramatycznych
  - Dla kind="combat-narrative" lub "combat-rolled": [z napięciem], [gwałtownie]
  - Dla kind="cutscene": więcej emocji — to scena filmowa
  - Dla kind="ending": [uroczyście] lub [z żalem] zależnie od kategorii
  ```

#### File: `src/components/play/play-shell.tsx`
- **What**: Add a TTS toggle in the play header — speaker icon that enables/disables auto-narration
- **Where**: Header bar, next to session title
- **Code sketch**:
  ```tsx
  // State: ttsEnabled (localStorage persisted, default false)
  // Icon: speaker on/off toggle
  // Pass ttsEnabled down to NarrationFeed as prop
  ```

#### File: `.env.local` (documentation only — DO NOT commit)
- **What**: Document the new env vars needed
- **Env vars**:
  ```
  ELEVENLABS_API_KEY=sk_...          # ElevenLabs API key
  ELEVENLABS_VOICE_ID=P2244jTXPnenPJjaAnTC  # Default GM narrator voice
  ELEVENLABS_MODEL_ID=eleven_v3              # v3 model — supports [emotion] tags in text
  ```

#### File: `infra/terraform/main.tf`
- **What**: Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` as secret environment variables on the container (same pattern as `LLM_API_KEY`). Add `ELEVENLABS_MODEL_ID` as a non-secret env var.
- **Where**: `secret_environment_variables` and `environment_variables` blocks
- **Rationale**: Key stays in Terraform state (bucket-owner-only ACLs), never in UI/logs

#### File: `src/lib/i18n/pl.ts`
- **What**: Add TTS-related i18n keys
- **Where**: `play` section
- **Code sketch**:
  ```ts
  ttsToggleOn: "Włącz narrację głosową",
  ttsToggleOff: "Wyłącz narrację głosową",
  ttsLoading: "Generowanie głosu...",
  ttsError: "Błąd narracji głosowej",
  ttsNotConfigured: "Narracja głosowa niedostępna",
  ```

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test -- --run` passes
- [ ] `/api/tts` route returns 503 when `ELEVENLABS_API_KEY` is not set (graceful degradation)
- [ ] `/api/tts` route returns audio/mpeg when key is configured

#### Manual Verification
- [ ] GM narration entries have a play button (speaker icon)
- [ ] Clicking play fetches TTS and plays audio
- [ ] TTS toggle in header enables/disables auto-play on new entries
- [ ] Audio plays in Polish with the configured voice
- [ ] When TTS is not configured (no API key), the play button is hidden — text-only fallback
- [ ] No errors or broken UI when TTS is unavailable

### Dependencies
- Requires: Phase 1 (Polish quality — TTS sounds better with correct Polish)
- Blocks: nothing

### Cost note
ElevenLabs pricing: ~$0.30 per 1000 characters (Starter plan). A typical narration entry is ~200-500 chars, so ~$0.06-0.15 per narration. A full session with ~20 narrated entries costs ~$1-3. Consider caching audio blobs client-side (blob URLs persist for session lifetime).

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Expanded POLISH_OUTPUT_CLAUSE makes prompts too long / hurts LLM output quality | Low | Medium | Test with real generation; the clause adds ~300 tokens, well within context |
| LLM still generates some bad Polish despite instructions | Medium | Low | This is iterative — each feedback cycle improves the clause. Bielik model swap will be the real fix. |
| Onboarding banner is annoying for returning users | Low | Low | localStorage dismiss flag; only shows once |
| "ST" confuses users who know PF2e in English | Low | Low | Polish TTRPG community universally uses ST; this is the correct translation |
| Changing pendingRollDc from "KT" to "ST" breaks existing tests | Low | Low | Only i18n value change; test snapshots are string-based |
| ElevenLabs API latency adds delay to narration | Medium | Medium | Use streaming endpoint; show loading indicator; TTS is opt-in |
| ElevenLabs costs accumulate per session | Medium | Low | ~$1-3 per session; cache audio client-side; TTS is opt-in toggle |
| ElevenLabs API key not set in prod | Low | Low | Graceful degradation — 503 from /api/tts, play buttons hidden, text-only fallback |
| Polish pronunciation quality varies by voice | Medium | Low | User picks voice via ELEVENLABS_VOICE_ID; test multiple voices during setup |

## Rollback Strategy

Phase 1 (prompt changes) is safe to revert — just undo the POLISH_OUTPUT_CLAUSE edit. Phase 2 is a one-line i18n change. Phase 3 is additive UI (new onboarding component) with no destructive changes. Phase 4 (TTS) is fully opt-in — without `ELEVENLABS_API_KEY` the feature is invisible; removing the API route and narration buttons reverts cleanly.

## File Ownership Summary

| File | Phase | Change Type |
|------|-------|-------------|
| `src/lib/prompts/system/gm-core.ts` | 1 | Modify (expand POLISH_OUTPUT_CLAUSE) |
| `src/lib/prompts/session-generator/stage-c-worldkit.ts` | 1 | Modify (DC→ST in examples) |
| `src/lib/prompts/session-generator/stage-f-statblocks.ts` | 1 | Modify (DC→ST in abilities) |
| `src/lib/prompts/banned-phrases.ts` | 1 | Modify (add Polish fabrications) |
| `src/lib/i18n/pl.ts` | 2, 3 | Modify (ST terminology + onboarding keys) |
| `src/components/play/pending-roll.tsx` | 2 | No change needed (already uses i18n) |
| `src/components/authoring/authoring-shell.tsx` | 3 | Modify (add onboarding banner) |
| `src/components/authoring/graph-editor-toolbar.tsx` | 3 | Modify (approve button text) |
| `src/components/authoring/node-inspector.tsx` | 3 | Modify (helpful empty state) |
| `src/lib/prompts/session-generator/stage-e-prose.ts` | 4 | Modify (emotion tags for TTS) |
| `src/app/api/tts/route.ts` | 4 | Create (ElevenLabs TTS proxy) |
| `src/components/play/narration-feed.tsx` | 4 | Modify (play button + auto-play) |
| `src/components/play/play-shell.tsx` | 4 | Modify (TTS toggle in header) |
| `infra/terraform/main.tf` | 4 | Modify (ELEVENLABS env vars) |
