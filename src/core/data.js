import "../../config.js";

import rosterData from "../../data/core/roster.json" with { type: "json" };
import balanceData from "../../data/systems/balance.json" with { type: "json" };
import traitRulesData from "../../data/systems/traits.json" with { type: "json" };
import hiddenTraitRulesData from "../../data/systems/hidden-traits.json" with { type: "json" };
import bossRosterData from "../../data/systems/bosses.json" with { type: "json" };
import bossPatternsData from "../../data/systems/boss-patterns.json" with { type: "json" };
import uiSettingsData from "../../data/ui/settings.json" with { type: "json" };
import pvpRoomsData from "../../data/ui/pvp-rooms.json" with { type: "json" };
import augmentSettingsData from "../../data/augments/settings.json" with { type: "json" };
import commonSilverAugments from "../../data/augments/common/silver.json" with { type: "json" };
import commonGoldAugments from "../../data/augments/common/gold.json" with { type: "json" };
import commonPrismaticAugments from "../../data/augments/common/prismatic.json" with { type: "json" };
import stage1SilverAugments from "../../data/augments/stage1/silver.json" with { type: "json" };
import stage1GoldAugments from "../../data/augments/stage1/gold.json" with { type: "json" };
import stage1PrismaticAugments from "../../data/augments/stage1/prismatic.json" with { type: "json" };
import stage2SilverAugments from "../../data/augments/stage2/silver.json" with { type: "json" };
import stage2GoldAugments from "../../data/augments/stage2/gold.json" with { type: "json" };
import stage2PrismaticAugments from "../../data/augments/stage2/prismatic.json" with { type: "json" };
import stage3SilverAugments from "../../data/augments/stage3/silver.json" with { type: "json" };
import stage3GoldAugments from "../../data/augments/stage3/gold.json" with { type: "json" };
import stage3PrismaticAugments from "../../data/augments/stage3/prismatic.json" with { type: "json" };

export const allRoster = rosterData.map((unit) => ({ ...unit }));
export const roster = allRoster.filter((unit) => unit.active !== false).map((unit) => ({ ...unit }));
export const balance = structuredClone(balanceData);
export const traitRules = structuredClone(traitRulesData);
export const hiddenTraitRules = structuredClone(hiddenTraitRulesData);
export const bossRoster = bossRosterData.map((boss) => ({ ...boss }));
export const bossPatterns = structuredClone(bossPatternsData);
export const uiSettings = structuredClone(uiSettingsData);
export const pvpRoomsConfig = structuredClone(pvpRoomsData);
export const augmentSettings = structuredClone(augmentSettingsData);
export const augmentPools = {
  common: {
    silver: structuredClone(commonSilverAugments),
    gold: structuredClone(commonGoldAugments),
    prismatic: structuredClone(commonPrismaticAugments),
  },
  stage1: {
    silver: structuredClone(stage1SilverAugments),
    gold: structuredClone(stage1GoldAugments),
    prismatic: structuredClone(stage1PrismaticAugments),
  },
  stage2: {
    silver: structuredClone(stage2SilverAugments),
    gold: structuredClone(stage2GoldAugments),
    prismatic: structuredClone(stage2PrismaticAugments),
  },
  stage3: {
    silver: structuredClone(stage3SilverAugments),
    gold: structuredClone(stage3GoldAugments),
    prismatic: structuredClone(stage3PrismaticAugments),
  },
};
export const allAugments = Object.values(augmentPools)
  .flatMap((pool) => Object.values(pool).flat())
  .filter((augment) => augment.active !== false);

export const rankingStorageKey = uiSettings.rankingStorageKey;
export const communityBoardStorageKey = uiSettings.communityBoardStorageKey;
export const patchNotesStorageKey = uiSettings.patchNotesStorageKey;
export const gameSaveStorageKey = uiSettings.gameSaveStorageKey || "lumia-tactics-game-save";
export const pvpRoomsStorageKey = pvpRoomsConfig.storageKey || "lumia-tactics-pvp-rooms-local";
export const pvpPendingSquadStorageKey = pvpRoomsConfig.pendingSquadStorageKey || "lumia-tactics-pvp-pending-squad";
export const communityBoardConfig = {
  ...uiSettings.communityBoard,
  url: window.LUMIA_TACTICS_CONFIG?.supabase?.url,
  anonKey: window.LUMIA_TACTICS_CONFIG?.supabase?.anonKey,
  ...(window.LUMIA_TACTICS_CONFIG?.communityBoard || {}),
};
export const presenceConfig = {
  url: window.LUMIA_TACTICS_CONFIG?.supabase?.url,
  anonKey: window.LUMIA_TACTICS_CONFIG?.supabase?.anonKey,
  ...(window.LUMIA_TACTICS_CONFIG?.presence || {}),
};
export const bgmConfig = {
  ...uiSettings.bgm,
  ...(window.LUMIA_TACTICS_CONFIG?.bgm || {}),
};
export const patchNotesConfig = {
  ...uiSettings.patchNotes,
  ...(window.LUMIA_TACTICS_CONFIG?.patchNotes || {}),
};
export const rankingConfig = {
  ...(window.LUMIA_TACTICS_CONFIG?.supabase || {}),
  majorVersion: window.LUMIA_TACTICS_CONFIG?.ranking?.majorVersion || patchNotesConfig.version || "legacy",
  versionColumn: window.LUMIA_TACTICS_CONFIG?.ranking?.versionColumn || "ranking_version",
};
