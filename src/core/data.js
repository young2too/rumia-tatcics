import "../../config.js";

import rosterData from "../../data/core/roster.json" with { type: "json" };
import balanceData from "../../data/systems/balance.json" with { type: "json" };
import traitRulesData from "../../data/systems/traits.json" with { type: "json" };
import bossRosterData from "../../data/systems/bosses.json" with { type: "json" };
import bossPatternsData from "../../data/systems/boss-patterns.json" with { type: "json" };
import uiSettingsData from "../../data/ui/settings.json" with { type: "json" };

export const roster = rosterData.map((unit) => ({ ...unit }));
export const balance = structuredClone(balanceData);
export const traitRules = structuredClone(traitRulesData);
export const bossRoster = bossRosterData.map((boss) => ({ ...boss }));
export const bossPatterns = structuredClone(bossPatternsData);
export const uiSettings = structuredClone(uiSettingsData);

export const rankingStorageKey = uiSettings.rankingStorageKey;
export const patchNotesStorageKey = uiSettings.patchNotesStorageKey;
export const rankingConfig = window.LUMIA_TACTICS_CONFIG?.supabase || {};
export const bgmConfig = {
  ...uiSettings.bgm,
  ...(window.LUMIA_TACTICS_CONFIG?.bgm || {}),
};
export const patchNotesConfig = {
  ...uiSettings.patchNotes,
  ...(window.LUMIA_TACTICS_CONFIG?.patchNotes || {}),
};
