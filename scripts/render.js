/**
 * Render stage.
 *
 * Runs on `dnd5e.renderChatMessage`. Reads the breakdown previously stashed on each roll's
 * `options`, applies visibility rules, and injects a collapsible breakdown section into the card.
 */

import { MODULE_ID, OPTIONS_KEY, SETTINGS, VISIBILITY } from "./constants.js";
import { setting } from "./settings.js";

const TEMPLATE = `modules/${MODULE_ID}/templates/breakdown.hbs`;

/**
 * Handler for `dnd5e.renderChatMessage`.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export async function onRenderChatMessage(message, html) {
  try {
    if ( html.querySelector(`.${MODULE_ID}`) ) return;            // Already injected.
    if ( !canView(message) ) return;

    const blocks = [];
    for ( const roll of message.rolls ?? [] ) {
      const breakdown = roll?.options?.[OPTIONS_KEY];
      if ( breakdown?.mods?.length ) blocks.push(buildContext(roll, breakdown));
    }
    if ( !blocks.length ) return;

    const renderTemplate = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
    for ( const context of blocks ) {
      const rendered = await renderTemplate(TEMPLATE, context);
      const node = document.createRange().createContextualFragment(rendered);
      const anchor = html.querySelector(".dice-roll") ?? html.querySelector(".message-content") ?? html;
      anchor.append(node);
    }
  } catch ( err ) {
    console.error("SRP Bonus Breakdown | Failed to render breakdown", err);
  }
}

/* -------------------------------------------- */

/** Apply the world visibility setting. */
function canView(message) {
  const mode = setting(SETTINGS.visibility);
  if ( game.user.isGM ) return true;
  if ( mode === VISIBILITY.gm ) return false;
  if ( mode === VISIBILITY.everyone ) return true;

  // owner: visible to the message author and anyone who owns the speaking actor.
  if ( message.isAuthor ) return true;
  const actor = resolveActor(message);
  return !!actor?.isOwner;
}

function resolveActor(message) {
  const speaker = message.speaker ?? {};
  if ( speaker.actor ) {
    const actor = game.actors?.get(speaker.actor);
    if ( actor ) return actor;
  }
  if ( speaker.token && speaker.scene ) {
    const token = game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token);
    if ( token?.actor ) return token.actor;
  }
  return null;
}

/* -------------------------------------------- */

/** Build the Handlebars context for one roll. */
function buildContext(roll, breakdown) {
  const showPaths = setting(SETTINGS.showSourcePaths);
  const pills = [];
  for ( const mod of breakdown.mods ) {
    // When a bonus can be attributed to one or more Active Effects, show a pill per source
    // (named + iconned) instead of the generic aggregate pill — this is the "where did it
    // come from" view. Otherwise show the generic labelled pill.
    if ( mod.sources?.length ) {
      for ( const s of mod.sources ) {
        pills.push(makePill(s.name, s.value, mod.category, { img: s.img, title: mod.label }));
      }
    } else {
      const p = makePill(mod.label, mod.value, mod.category, { title: showPaths ? mod.path : null });
      if ( p ) pills.push(p);
    }
  }

  return {
    moduleId: MODULE_ID,
    pills,
    showFormula: setting(SETTINGS.showFormula),
    formula: breakdown.formula
  };
}

/**
 * Build one display pill, formatting its value with a sign. Returns null for noisy +0
 * contributions (e.g. Cover when there is none), except for the core ability modifier.
 */
function makePill(label, rawValue, category, { img = null, title = null } = {}) {
  const num = Number(rawValue);
  const numeric = Number.isFinite(num);
  if ( numeric && (num === 0) && (category !== "ability") ) return null;

  let display;
  let negative = false;
  if ( numeric ) {
    negative = num < 0;
    display = `${negative ? "−" : "+"}${Math.abs(num)}`;
  } else {
    const v = String(rawValue ?? "").trim();
    // Dice / formula contributions (e.g. weapon damage "1d8", Bless "1d4") show as-is, no sign.
    if ( /\dd\d/i.test(v) ) display = v;
    else display = v.startsWith("-") ? v : `+${v}`;
  }

  return { label, value: display, category, img, negative, title };
}
