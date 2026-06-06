/**
 * Active Effect source tracing.
 *
 * Given an actor and a set of bonus key-paths (the same `system.*` paths that the dnd5e
 * system aggregates into a single number), find every applicable Active Effect change that
 * targets one of those paths and report it as a named, attributable source.
 */

/**
 * @typedef {object} SourceHit
 * @property {string} name   Display name of the originating effect / item.
 * @property {string} img    Icon for the source.
 * @property {string} value  The raw change value contributed by this source.
 * @property {string} key    The Active Effect change key that was matched.
 */

/**
 * Trace Active Effect sources for a set of key-paths.
 * @param {Actor} actor              The actor that performed the roll.
 * @param {string[]} keyPaths        The `system.*` change keys to look for.
 * @returns {Record<string, SourceHit[]>}  Map of key-path -> contributing sources.
 */
export function traceSources(actor, keyPaths) {
  const result = {};
  if ( !actor || !keyPaths?.length ) return result;
  const wanted = new Set(keyPaths);

  let effects;
  try {
    // dnd5e/v13 actors expose every effect that can apply (including those from items).
    effects = typeof actor.allApplicableEffects === "function"
      ? Array.from(actor.allApplicableEffects())
      : Array.from(actor.appliedEffects ?? actor.effects ?? []);
  } catch ( err ) {
    console.warn("SRP Bonus Breakdown | Failed to enumerate Active Effects", err);
    return result;
  }

  for ( const effect of effects ) {
    if ( !effect || effect.disabled || effect.isSuppressed ) continue;
    for ( const change of effect.changes ?? [] ) {
      if ( !wanted.has(change.key) ) continue;
      (result[change.key] ??= []).push({
        name: sourceName(effect),
        img: effect.img ?? effect.icon ?? "icons/svg/aura.svg",
        value: String(change.value ?? ""),
        key: change.key
      });
    }
  }

  return result;
}

/**
 * Build a friendly name for an effect, preferring the parent item's name when the effect is a
 * generic "passive" effect attached to an item (common for magic items and feats).
 * @param {ActiveEffect} effect
 * @returns {string}
 */
function sourceName(effect) {
  const parent = effect.parent;
  // When an effect lives on an item, prefer "Item" or "Item: Effect" for clarity.
  if ( parent?.documentName === "Item" ) {
    if ( !effect.name || effect.name === parent.name ) return parent.name;
    return `${parent.name}: ${effect.name}`;
  }
  return effect.name ?? "Effect";
}
