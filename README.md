# SRP Bonus Breakdown

A Foundry VTT module for **D&D 5e** that adds a compact, PF2e-style breakdown of every modifier
and bonus source used in a roll — so players and GMs can see exactly how a result was reached,
and where each bonus came from.

- **System:** dnd5e (tested against 5.3.2)
- **Foundry:** v13+

## What it does

Appends a row of modifier **pills** to the dnd5e chat card for:

- Ability Checks
- Saving Throws
- Skill & Tool Checks
- Attack Rolls
- Damage Rolls

Each pill shows the modifier value + a short label, styled to match the system's own secondary
pills (transparent, dotted border). When a bonus can be traced to an **Active Effect**
(magic items, feats, spells, conditions), the pill shows that source's name and icon instead of a
generic label.

```
Dexterity Saving Throw
[ +2 DEX MOD ]  [ +3 PROF BONUS ]  [ +1 BLESS ]

Longsword — Attack Roll
[ +5 STR MOD ]  [ +3 PROF BONUS ]  [ +1 MAGIC WEAPON ]

Longsword — Damage
[ 1D8 SLASHING ]  [ +5 STR MOD ]  [ +1 MAGIC WEAPON ]
```

## How it works

The dnd5e roll pipeline resolves `@mod`, `@prof`, etc. into plain numbers as soon as a roll is
built, and for attack/damage it assembles the parts on a throwaway *clone* of the roll config.
To capture the labelled modifiers reliably the module hooks three points:

1. **`dnd5e.postBuildRollConfig`** — receives the build-time config clone while it still names
   every `@token` part. The parts are copied onto `roll.options` so they survive into the roll.
2. **`dnd5e.postRollConfiguration`** — after modifiers are computed but before evaluation, the
   module reads those parts, maps each token to a readable label, traces Active Effect sources,
   and stashes the finished breakdown on `roll.options` (the part of a roll that is serialized
   into the chat message).
3. **`dnd5e.renderChatMessage`** — reads the stashed breakdown and injects the pill row,
   applying the configured visibility rules.

Because the breakdown is baked into the message, it renders correctly for every viewer and in
chat scroll-back without re-computation.

### Source identification

For bonuses that aggregate through the standard `system.*` paths, the module scans the actor's
applicable Active Effects (including those granted by items, feats, and conditions) for changes
targeting that path, and attributes each contribution to its originating effect. Traced paths
include:

| Roll | Path(s) |
| --- | --- |
| Ability / Skill check | `system.bonuses.abilities.check`, `system.abilities.<abl>.bonuses.check`, `system.skills.<skl>.bonuses.check`, `system.bonuses.abilities.skill` |
| Saving throw | `system.bonuses.abilities.save`, `system.abilities.<abl>.bonuses.save` |
| Attack | `system.bonuses.<mwak\|rwak\|msak\|rsak>.attack` |
| Damage | `system.bonuses.<mwak\|rwak\|msak\|rsak>.damage` |

Magic-weapon / magic-ammo bonuses and an item's own attack bonus are shown as their own pills.

## Settings

| Setting | Scope | Default | Description |
| --- | --- | --- | --- |
| Break Down Ability Checks | world | on | Toggle breakdowns for ability checks. |
| Break Down Saving Throws | world | on | Toggle breakdowns for saving throws. |
| Break Down Skill & Tool Checks | world | on | Toggle breakdowns for skill/tool checks. |
| Break Down Attack Rolls | world | on | Toggle breakdowns for attack rolls. |
| Break Down Damage Rolls | world | on | Toggle the damage composition breakdown. |
| Breakdown Visibility | world | Everyone | Everyone / Roll owner & GM / GM only. |
| Identify Active Effect Sources | world | on | Trace bonuses back to their effects. |
| Show Roll Formula (Debug) | client | off | Show the raw roll formula under the pills. |
| Show Data Paths (Debug) | client | off | Tooltip each pill with the `system.*` path it reads. |

## Known limitations

- **Dice-valued bonuses** (e.g. Bless `1d4`, weapon damage dice) are shown as their formula
  (`+1d4`, `1d8`) rather than a resolved per-source number. The card's overall **Total** stays
  exact.
- **"GM only" visibility** hides the pills in the UI; the data still lives in the message flags,
  so it is not cryptographically secret from a determined user.
- Source identification covers bonuses that flow through Active Effect changes on the standard
  `system.*` bonus paths. Static contributions (ability modifier, proficiency) are labelled but
  not attributed to a specific item.
- Damage breakdowns list one pill row per damage part; flat damage bonuses are summed into a
  single "Damage Bonus" pill (attributed to effects when traceable).

## Roadmap

Armor Class and Spell Save DC breakdowns, a dedicated roll-inspector panel, and an expanded
developer mode (data-source tracing, modifier-stack visualization).
