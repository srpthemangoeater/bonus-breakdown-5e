import { MODULE_ID, SETTINGS, VISIBILITY } from "./constants.js";

/**
 * Register all module settings.
 */
export function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);

  register(SETTINGS.enableAbility, {
    name: "SRPBB.Settings.EnableAbility.Name",
    hint: "SRPBB.Settings.EnableAbility.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.enableSave, {
    name: "SRPBB.Settings.EnableSave.Name",
    hint: "SRPBB.Settings.EnableSave.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.enableSkill, {
    name: "SRPBB.Settings.EnableSkill.Name",
    hint: "SRPBB.Settings.EnableSkill.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.enableAttack, {
    name: "SRPBB.Settings.EnableAttack.Name",
    hint: "SRPBB.Settings.EnableAttack.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.enableDamage, {
    name: "SRPBB.Settings.EnableDamage.Name",
    hint: "SRPBB.Settings.EnableDamage.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.visibility, {
    name: "SRPBB.Settings.Visibility.Name",
    hint: "SRPBB.Settings.Visibility.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [VISIBILITY.everyone]: "SRPBB.Settings.Visibility.Everyone",
      [VISIBILITY.owner]: "SRPBB.Settings.Visibility.Owner",
      [VISIBILITY.gm]: "SRPBB.Settings.Visibility.GM"
    },
    default: VISIBILITY.everyone
  });

  register(SETTINGS.showSources, {
    name: "SRPBB.Settings.ShowSources.Name",
    hint: "SRPBB.Settings.ShowSources.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.showFormula, {
    name: "SRPBB.Settings.ShowFormula.Name",
    hint: "SRPBB.Settings.ShowFormula.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  register(SETTINGS.showSourcePaths, {
    name: "SRPBB.Settings.ShowSourcePaths.Name",
    hint: "SRPBB.Settings.ShowSourcePaths.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

/** Sane fallbacks used if a setting can't be read (e.g. not yet registered). */
const DEFAULTS = {
  [SETTINGS.enableAbility]: true,
  [SETTINGS.enableSave]: true,
  [SETTINGS.enableSkill]: true,
  [SETTINGS.enableAttack]: true,
  [SETTINGS.enableDamage]: true,
  [SETTINGS.visibility]: VISIBILITY.everyone,
  [SETTINGS.showSources]: true,
  [SETTINGS.showFormula]: false,
  [SETTINGS.showSourcePaths]: false
};

/** Convenience getter. Never throws — falls back to a sensible default. */
export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch ( err ) {
    console.warn(`SRP Bonus Breakdown | setting "${key}" unavailable, using default`, err);
    return DEFAULTS[key];
  }
}
