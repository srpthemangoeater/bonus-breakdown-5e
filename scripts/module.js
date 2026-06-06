/**
 * SRP Bonus Breakdown — entry point.
 *
 * Captures modifier sources during roll configuration (`dnd5e.postRollConfiguration`) and
 * injects a collapsible breakdown into the dnd5e chat card (`dnd5e.renderChatMessage`).
 */

import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { onBuildRollConfig, onPostRollConfiguration } from "./capture.js";
import { onRenderChatMessage } from "./render.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing SRP Bonus Breakdown`);
  registerSettings();
});

Hooks.once("ready", () => {
  if ( game.system.id !== "dnd5e" ) {
    console.warn(`${MODULE_ID} | This module requires the dnd5e system; disabling hooks.`);
    return;
  }

  // Capture the per-roll parts from the build-time config clone (reliable token source).
  Hooks.on("dnd5e.postBuildRollConfig", onBuildRollConfig);

  // Capture happens after modifiers are computed but before evaluation / message creation.
  Hooks.on("dnd5e.postRollConfiguration", onPostRollConfiguration);

  // Render the breakdown onto the finished chat card.
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);

  console.log(`${MODULE_ID} | Ready`);
});
