# pf2e-creature-build-table.json — Review Notes

Source: PF2e Gamemastery Guide (Remastered) Table 2-5 "Building Creatures".
Public reference: https://2e.aonprd.com/Rules.aspx?ID=2874

## Confidence levels

### HIGH confidence (spot-checked against core sources)
- Levels 1–10 AC, HP, strike bonus, saving throw ranges
- The overall scaling pattern (each +2 level ≈ +1 to most stats)

### NEEDS ttrpg-gm-expert REVIEW
The following values were extrapolated from the pattern rather than read directly
from a verified table scan. The pf2e-statblock-validator uses `moderate` values
as the baseline and clamps to ±2 (AC) / ±15% (HP) / ±2 (strike), so small
errors in the table only affect clamping thresholds, not the generated content.

1. **Levels 21–24** — mythic/epic creature range. The standard GMG table ends
   at level 20; levels 21+ are extrapolated by extending the per-level delta.
   Please verify against the GMG or any Paizo-published level 22+ creature.

2. **strikeDamage expressions** — the `expression` field is a representative
   moderate-level damage dice expression. The `average` is computed from the
   expression. If the exact dice expression differs from a canonical source,
   only the `average` field matters for the validator (it checks the average,
   not the expression string). Please verify `average` values for levels 15+.

3. **spellDC / spellAttack** — these are used for caster NPCs only. Values
   follow the expected +proficiency+ability progression; verify against a
   published high-level caster (e.g., Lich level 17 in Monster Core).

4. **perception `extreme` tier** — extreme perception is rarely published in
   the table; values here are computed as `high + 3`. Verify one published
   extreme-perception creature (e.g., Sphinx, Seraph).

## Validator clamping policy

`pf2e-statblock-validator.ts` enforces:
- AC: clamp to [moderate - 2, moderate + 2] unless `extreme` tier
- HP: clamp to [moderate * 0.85, moderate * 1.15]
- Strike toHit: clamp to [moderate - 2, moderate + 2]

Out-of-range values are set to the nearest boundary and a warning is added
to the result. Warnings surface in the authoring UI's node inspector.
