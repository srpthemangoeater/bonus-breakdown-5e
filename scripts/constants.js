/**
 * Shared constants and modifier metadata for SRP Bonus Breakdown.
 */

export const MODULE_ID = "srp-dnd-bonus-breakdown";

/** Key used to stash the captured breakdown onto a roll's `options` so it persists into the chat message. */
export const OPTIONS_KEY = "srpdBreakdown";

/** Setting keys. */
export const SETTINGS = {
  enableAbility: "enableAbility",
  enableSave: "enableSave",
  enableSkill: "enableSkill",
  enableAttack: "enableAttack",
  enableDamage: "enableDamage",
  visibility: "visibility",
  showSources: "showSources",
  showFormula: "showFormula",
  showSourcePaths: "showSourcePaths"
};

/** Visibility options for who may see breakdowns. */
export const VISIBILITY = {
  everyone: "everyone",
  owner: "owner",
  gm: "gm"
};

/**
 * Categories used to tag modifiers, mirrored to CSS classes and (optionally) used by
 * future "hide specific categories" controls.
 */
export const CATEGORY = {
  ability: "ability",
  proficiency: "proficiency",
  expertise: "expertise",
  bonus: "bonus",
  situational: "situational",
  exhaustion: "exhaustion",
  cover: "cover",
  magic: "magic",
  flanking: "flanking",
  damage: "damage",
  other: "other"
};
