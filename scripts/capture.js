/**
 * Capture stage.
 *
 * Runs on `dnd5e.postRollConfiguration`, which fires after the roll's modifiers are computed
 * (so `roll.data` holds every named value and `roll.formula` still contains `@token` references)
 * but BEFORE evaluation and message creation. We translate the tokens into labelled, sourced
 * modifiers and stash the result onto `roll.options`, the only part of the roll that survives
 * serialization into the chat message.
 */

import { CATEGORY, OPTIONS_KEY, SETTINGS } from "./constants.js";
import { setting } from "./settings.js";
import { traceSources } from "./sources.js";

/** Roll types we support and the setting that toggles each. */
const SUPPORTED = {
  ability: SETTINGS.enableAbility,
  save: SETTINGS.enableSave,
  skill: SETTINGS.enableSkill,
  tool: SETTINGS.enableSkill,
  attack: SETTINGS.enableAttack,
  damage: SETTINGS.enableDamage
};

/** Attack/damage action types, used when tracing global attack/damage bonuses. */
const ACTION_TYPES = ["mwak", "rwak", "msak", "rsak"];

/** Key used to ferry the (clone) roll parts from config-build time onto the roll itself. */
const PARTS_KEY = "srpdParts";

/**
 * Handler for `dnd5e.postBuildRollConfig`. The `config` here is the per-roll *clone* that the
 * dnd5e roll prompt actually builds the roll from — it carries the complete `@token` parts
 * (ability mod, proficiency, weapon magic, situational, …). dnd5e parses `@` references into
 * numbers immediately, so by the time the roll exists its formula no longer names them; we copy
 * the parts onto `config.options` so they ride into the roll and remain readable at capture time.
 * @param {object} process  Full process configuration.
 * @param {object} config   The per-roll clone configuration (has `.parts`).
 */
export function onBuildRollConfig(process, config) {
  try {
    if ( config && (typeof config === "object") && Array.isArray(config.parts) ) {
      config.options ??= {};
      config.options[PARTS_KEY] = [...config.parts];
    }
  } catch ( _e ) { /* non-fatal */ }
}

/**
 * Handler for `dnd5e.postRollConfiguration`.
 * @param {Roll[]} rolls   Constructed but un-evaluated rolls.
 * @param {object} config  The roll process configuration (includes `subject`, `ability`, `skill`...).
 * @param {object} dialog  Dialog configuration (unused).
 * @param {object} message Message configuration (carries `data.flags.dnd5e.roll.type`).
 */
export function onPostRollConfiguration(rolls, config, dialog, message) {
  try {
    const type = foundry.utils.getProperty(message, "data.flags.dnd5e.roll.type");
    if ( !type || !(type in SUPPORTED) ) return;
    if ( !setting(SUPPORTED[type]) ) return;

    // For ability/save/skill/tool, `subject` is the Actor. For attack/damage it is the Activity,
    // whose `.actor` is the rolling actor.
    const subject = config.subject ?? null;
    const actor = subject?.actor ?? subject ?? null;
    const ability = resolveAbility(type, config, subject, message);

    rolls.forEach((roll, index) => {
      try {
        const configRoll = config.rolls?.[index] ?? null;
        let actionType = null;
        try {
          actionType = subject?.getActionType?.(roll.options?.attackMode ?? configRoll?.options?.attackMode) ?? null;
        } catch ( _e ) { /* not an attack/damage activity */ }
        const ctx = { type, actor, ability, skill: config.skill ?? null, tool: config.tool ?? null, actionType, subject };

        const breakdown = type === "damage"
          ? buildDamageBreakdown(roll, configRoll, ctx)
          : buildBreakdown(roll, configRoll, ctx);

        if ( breakdown?.mods.length ) {
          roll.options ??= {};
          roll.options[OPTIONS_KEY] = breakdown;
        }
        if ( roll.options ) delete roll.options[PARTS_KEY];   // don't persist the scratch parts
      } catch ( err ) {
        console.error("SRP Bonus Breakdown | Failed to capture breakdown for roll", index, err);
      }
    });
  } catch ( err ) {
    console.error("SRP Bonus Breakdown | Failed to capture breakdown", err);
  }
}

/** Read a roll's formula without throwing, regardless of evaluation state. */
function safeFormula(roll) {
  try {
    return roll.formula ?? roll._formula ?? "";
  } catch ( _e ) {
    return roll._formula ?? "";
  }
}

/** Resolve the relevant ability id for labelling the `@mod` term. */
function resolveAbility(type, config, subject, message) {
  if ( (type === "attack") || (type === "damage") ) {
    return subject?.ability ?? subject?.attack?.ability ?? null;
  }
  return config.ability ?? foundry.utils.getProperty(message, "data.flags.dnd5e.roll.ability") ?? null;
}

/* -------------------------------------------- */
/*  d20-style breakdown (ability/save/skill/tool/attack)  */
/* -------------------------------------------- */

/**
 * Build the breakdown for a token-based d20 roll.
 * @returns {object|null}
 */
function buildBreakdown(roll, configRoll, ctx) {
  // Primary source: parts captured from the build-time clone (see onBuildRollConfig). Fall back
  // to the roll formula / process-config parts if that isn't available.
  const cloneParts = roll.options?.[PARTS_KEY];
  const source = cloneParts?.length
    ? cloneParts.join(" + ")
    : [safeFormula(roll), (configRoll?.parts ?? []).join(" + ")].join(" + ");
  const tokens = extractTokens(source);

  // Belt-and-suspenders for dialog/clone-added bonuses that live only on the built roll's data.
  for ( const extra of ["situational", "extraBonus"] ) {
    if ( !tokens.includes(extra) && hasValue(roll.data?.[extra]) ) tokens.push(extra);
  }
  if ( !tokens.length ) return null;

  // Resolve Active Effect key-paths per token, trace them once.
  const tokenPaths = {};
  for ( const token of tokens ) tokenPaths[token] = aePathFor(token, ctx);
  const sources = traceFor(ctx.actor, tokenPaths);

  const mods = [];
  for ( const token of tokens ) {
    const raw = foundry.utils.getProperty(roll.data ?? {}, token);
    if ( !hasValue(raw) ) continue;
    const descriptor = describeToken(token, ctx);
    mods.push(makeMod(token, descriptor, raw, tokenPaths[token], sources));
  }

  return { type: ctx.type, formula: safeFormula(roll), mods };
}

/* -------------------------------------------- */
/*  Damage breakdown (mixed dice + token parts) */
/* -------------------------------------------- */

/**
 * Build the breakdown for a damage roll. Damage parts are a mix of raw dice formulae
 * (e.g. "1d8"), flat bonuses ("2"), and `@token` references (`@mod`, `@magicalBonus`).
 * @returns {object|null}
 */
function buildDamageBreakdown(roll, configRoll, ctx) {
  let parts = roll.options?.[PARTS_KEY]?.length ? [...roll.options[PARTS_KEY]]
    : (configRoll?.parts?.length ? [...configRoll.parts] : splitFormula(safeFormula(roll)));
  for ( const extra of ["situational"] ) {
    if ( hasValue(roll.data?.[extra]) && !parts.includes(`@${extra}`) ) parts.push(`@${extra}`);
  }
  if ( !parts.length ) return null;

  const typeId = roll.options?.type;
  const typeLabel = CONFIG.DND5E?.damageTypes?.[typeId]?.label
    ?? CONFIG.DND5E?.healingTypes?.[typeId]?.label ?? "";

  // Active Effect damage bonuses for the relevant action type(s).
  const dmgPaths = (ctx.actionType ? [ctx.actionType] : ACTION_TYPES).map(a => `system.bonuses.${a}.damage`);
  const dmgSources = setting(SETTINGS.showSources) ? Object.values(traceSources(ctx.actor, dmgPaths)).flat() : [];
  let dmgSourcesUsed = false;

  const mods = [];
  for ( const part of parts ) {
    const trimmed = String(part).trim();
    if ( !trimmed ) continue;
    const tokens = extractTokens(trimmed);

    // Pure token part, e.g. "@mod".
    if ( (tokens.length === 1) && (trimmed === `@${tokens[0]}`) ) {
      const token = tokens[0];
      const raw = foundry.utils.getProperty(roll.data ?? {}, token);
      if ( !hasValue(raw) ) continue;
      const descriptor = describeToken(token, ctx);
      mods.push(makeMod(token, descriptor, raw, null, {}));
      continue;
    }

    const num = Number(trimmed);
    if ( Number.isFinite(num) ) {
      if ( num === 0 ) continue;
      // Flat bonus — attribute to traced damage-bonus effects when available.
      const srcs = !dmgSourcesUsed ? dmgSources : [];
      dmgSourcesUsed = true;
      mods.push({
        token: "damageBonus",
        label: game.i18n.localize("SRPBB.Mod.DamageBonus"),
        category: CATEGORY.bonus,
        value: trimmed,
        path: null,
        sources: srcs
      });
    } else {
      // Dice (or any other formula) — the weapon/spell damage itself, tagged by damage type.
      mods.push({
        token: "damageDice",
        label: typeLabel || game.i18n.localize("SRPBB.Mod.Damage"),
        category: CATEGORY.damage,
        value: trimmed,
        path: null,
        sources: []
      });
    }
  }

  return { type: ctx.type, formula: safeFormula(roll), mods };
}

/* -------------------------------------------- */
/*  Shared helpers                              */
/* -------------------------------------------- */

function hasValue(v) {
  return (v !== undefined) && (v !== null) && (v !== "");
}

/** Assemble a mod entry, attaching any traced sources for its key-path(s). */
function makeMod(token, descriptor, raw, paths, sources) {
  const list = [].concat(paths ?? []).filter(Boolean);
  const modSources = dedupeSources(list.flatMap(p => sources[p] ?? []));
  return {
    token,
    label: descriptor.label,
    category: descriptor.category,
    value: String(raw),
    path: list[0] ?? null,
    sources: modSources
  };
}

/** Trace every key-path referenced by the token map in a single pass. */
function traceFor(actor, tokenPaths) {
  if ( !setting(SETTINGS.showSources) ) return {};
  const all = [...new Set(Object.values(tokenPaths).flatMap(p => [].concat(p ?? [])).filter(Boolean))];
  return traceSources(actor, all);
}

function dedupeSources(list) {
  const seen = new Set();
  const out = [];
  for ( const s of list ) {
    const key = `${s.name}::${s.key}::${s.value}`;
    if ( seen.has(key) ) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Pull `@token` references out of a formula, preserving order and de-duplicating. */
function extractTokens(formula) {
  const out = [];
  const seen = new Set();
  for ( const match of String(formula).matchAll(/@([a-zA-Z0-9._]+)/g) ) {
    const token = match[1];
    if ( seen.has(token) ) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** Split a formula into additive parts (best effort, for when config parts are unavailable). */
function splitFormula(formula) {
  return String(formula).split(/\s*\+\s*/).map(p => p.trim()).filter(Boolean);
}

/** Abilities / skills present in this world. */
const abilities = () => CONFIG.DND5E?.abilities ?? {};
const skills = () => CONFIG.DND5E?.skills ?? {};

/** Short, capitalized ability abbreviation, e.g. "Dex". Falls back to a generic label. */
function abilityAbbr(id) {
  const abbr = abilities()[id]?.abbreviation;
  if ( abbr ) return abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase();
  return null;
}

/**
 * Map a token to a display label + category.
 * @returns {{ label: string, category: string }}
 */
function describeToken(token, ctx) {
  const t = game.i18n;
  const { ability, skill } = ctx;

  switch ( token ) {
    case "mod": {
      const abbr = abilityAbbr(ability);
      return {
        label: abbr ? t.format("SRPBB.Mod.Ability", { ability: abbr }) : t.localize("SRPBB.Mod.AbilityGeneric"),
        category: CATEGORY.ability
      };
    }
    case "prof": {
      const mult = profMultiplier(ctx.actor, { skill, ability });
      if ( mult >= 2 ) return { label: t.localize("SRPBB.Mod.Expertise"), category: CATEGORY.expertise };
      if ( mult > 0 && mult < 1 ) return { label: t.localize("SRPBB.Mod.HalfProf"), category: CATEGORY.proficiency };
      return { label: t.localize("SRPBB.Mod.Proficiency"), category: CATEGORY.proficiency };
    }
    case "situational":
    case "extraBonus":
      return { label: t.localize("SRPBB.Mod.Situational"), category: CATEGORY.situational };
    case "flanking":
      return { label: t.localize("SRPBB.Mod.Flanking"), category: CATEGORY.flanking };
    case "exhaustion":
      return { label: t.localize("SRPBB.Mod.Exhaustion"), category: CATEGORY.exhaustion };
    case "cover":
      return { label: t.localize("SRPBB.Mod.Cover"), category: CATEGORY.cover };
    case "checkBonus":
    case "abilityCheckBonus":
      return { label: t.localize("SRPBB.Mod.GlobalCheck"), category: CATEGORY.bonus };
    case "saveBonus":
      return { label: t.localize("SRPBB.Mod.GlobalSave"), category: CATEGORY.bonus };
    case "skillBonus":
      return { label: t.localize("SRPBB.Mod.GlobalSkill"), category: CATEGORY.bonus };
    // Attack tokens
    case "bonus":
      return { label: t.localize("SRPBB.Mod.ItemBonus"), category: CATEGORY.bonus };
    case "weaponMagic":
    case "magicalBonus":
      return { label: t.localize("SRPBB.Mod.MagicWeapon"), category: CATEGORY.magic };
    case "ammoMagic":
    case "ammoBonus":
      return { label: t.localize("SRPBB.Mod.MagicAmmo"), category: CATEGORY.magic };
    case "actorBonus":
    case "toHit":
      return { label: t.localize("SRPBB.Mod.AttackBonus"), category: CATEGORY.bonus };
    default:
      break;
  }

  // <ability>CheckBonus / <ability>SaveBonus
  let m = token.match(/^([a-z]{3})(Check|Save)Bonus$/);
  if ( m && abilities()[m[1]] ) {
    const key = m[2] === "Save" ? "SRPBB.Mod.AbilitySave" : "SRPBB.Mod.AbilityCheck";
    return { label: t.format(key, { ability: abilityAbbr(m[1]) ?? m[1].toUpperCase() }), category: CATEGORY.bonus };
  }

  // <skill>Bonus
  m = token.match(/^(\w+)Bonus$/);
  if ( m && skills()[m[1]] ) {
    return { label: t.format("SRPBB.Mod.SkillBonus", { skill: skills()[m[1]].label }), category: CATEGORY.bonus };
  }

  return { label: prettify(token), category: CATEGORY.other };
}

/**
 * Determine the Active Effect change key-path(s) that aggregate into a token.
 * @returns {string|string[]|null}
 */
function aePathFor(token, ctx) {
  switch ( token ) {
    case "checkBonus":
    case "abilityCheckBonus":
      return "system.bonuses.abilities.check";
    case "saveBonus":
      return "system.bonuses.abilities.save";
    case "skillBonus":
      return "system.bonuses.abilities.skill";
    case "actorBonus":
    case "toHit":
      return (ctx.actionType ? [ctx.actionType] : ACTION_TYPES).map(a => `system.bonuses.${a}.attack`);
    default:
      break;
  }

  let m = token.match(/^([a-z]{3})(Check|Save)Bonus$/);
  if ( m && abilities()[m[1]] ) return `system.abilities.${m[1]}.bonuses.${m[2].toLowerCase()}`;

  m = token.match(/^(\w+)Bonus$/);
  if ( m && skills()[m[1]] ) return `system.skills.${m[1]}.bonuses.check`;

  return null;
}

/** Proficiency multiplier for the relevant skill or ability check. */
function profMultiplier(actor, { skill, ability }) {
  if ( !actor ) return 1;
  try {
    if ( skill ) return actor.system?.skills?.[skill]?.prof?.multiplier ?? 1;
    if ( ability ) return actor.system?.abilities?.[ability]?.checkProf?.multiplier ?? 1;
  } catch ( _e ) { /* ignore */ }
  return 1;
}

function prettify(token) {
  return token
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, c => c.toUpperCase())
    .trim();
}
