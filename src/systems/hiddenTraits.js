export function createHiddenTraitController({ hiddenTraitRules, boardUnits }) {
  function isActive(rule, units = boardUnits()) {
    const names = new Set(units.filter(Boolean).map((unit) => unit.name));
    return (rule.requiredUnits || []).every((name) => names.has(name));
  }

  function activeHiddenTraits(units = boardUnits()) {
    return Object.entries(hiddenTraitRules)
      .filter(([, rule]) => isActive(rule, units))
      .map(([name, rule]) => ({ name, ...rule }));
  }

  function combatAbsorptions(units) {
    return activeHiddenTraits(units)
      .filter((rule) => rule.effect?.type === "absorb")
      .map((rule) => ({
        rule,
        host: units.find((unit) => unit.name === rule.effect.host),
        target: units.find((unit) => unit.name === rule.effect.target),
      }))
      .filter(({ host, target }) => host && target && host !== target);
  }

  function prepareDefeatEffects(units) {
    for (const rule of activeHiddenTraits(units).filter((item) => item.effect?.type === "deathRally")) {
      for (const unit of units.filter((candidate) => rule.requiredUnits.includes(candidate.name))) {
        unit.hiddenDefeatEffects ||= [];
        unit.hiddenDefeatEffects.push(rule);
        unit.hiddenDefeatHandled = false;
      }
    }
  }

  function triggerDefeatEffects(defeated, units) {
    if (defeated.hiddenDefeatHandled || !defeated.hiddenDefeatEffects?.length) return [];
    defeated.hiddenDefeatHandled = true;
    const results = [];
    for (const rule of defeated.hiddenDefeatEffects) {
      const multiplier = Number(rule.effect.statMultiplier) || 1;
      const healRatio = Number(rule.effect.healMaxHpRatio) || 0;
      for (const unit of units.filter((candidate) =>
        candidate.hp > 0
        && candidate.side === defeated.side
        && rule.requiredUnits.includes(candidate.name)
      )) {
        unit.maxHp = Math.max(1, Math.round(unit.maxHp * multiplier));
        unit.atk = Math.max(1, Math.round(unit.atk * multiplier));
        unit.speed *= multiplier;
        unit.skillAmp = Math.max(0, Math.round(unit.skillAmp * multiplier));
        unit.defense = Math.max(0, Math.round(unit.defense * multiplier));
        const before = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * healRatio));
        unit.status = "healed";
        results.push({ rule, unit, heal: unit.hp - before });
      }
    }
    return results;
  }

  function prepareKillEffects(units) {
    for (const rule of activeHiddenTraits(units).filter((item) => item.effect?.type === "killRally")) {
      for (const unit of units.filter((candidate) => rule.requiredUnits.includes(candidate.name))) {
        unit.hiddenKillEffects ||= [];
        unit.hiddenKillEffects.push(rule);
      }
    }
  }

  function triggerKillEffects(killer, units) {
    if (!killer?.hiddenKillEffects?.length || killer.hp <= 0) return [];
    const results = [];
    for (const rule of killer.hiddenKillEffects) {
      const healRatio = Number(rule.effect.healMaxHpRatio) || 0;
      for (const unit of units.filter((candidate) =>
        candidate.hp > 0
        && candidate.side === killer.side
        && rule.requiredUnits.includes(candidate.name)
      )) {
        const before = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * healRatio));
        unit.status = "healed";
        results.push({ rule, unit, heal: unit.hp - before, fillMana: Boolean(rule.effect.fillMana) });
      }
    }
    return results;
  }

  function prepareOpeningEffects(units) {
    const activated = [];
    for (const rule of activeHiddenTraits(units)) {
      if (rule.effect?.type === "paintExplosion") {
        const marker = units.find((unit) => unit.name === rule.effect.marker);
        const detonator = units.find((unit) => unit.name === rule.effect.detonator);
        if (marker && detonator) {
          marker.hiddenPaintMarker = rule;
          detonator.hiddenPaintDetonator = rule;
          activated.push(rule);
        }
      }
      if (rule.effect?.type === "feast") {
        const multiplier = Number(rule.effect.teamMaxHpMultiplier) || 1;
        for (const unit of units) {
          unit.maxHp = Math.max(1, Math.round(unit.maxHp * multiplier));
          unit.hp = unit.maxHp;
        }
        for (const unit of units.filter((candidate) => rule.requiredUnits.includes(candidate.name))) {
          unit.hiddenFeastEffects ||= [];
          unit.hiddenFeastEffects.push(rule);
        }
        activated.push(rule);
      }
      if (rule.effect?.type === "killBlink") {
        for (const unit of units.filter((candidate) => rule.effect.units?.includes(candidate.name))) {
          unit.hiddenKillBlink = rule;
        }
        activated.push(rule);
      }
      if (rule.effect?.type === "lenoxPullGrowth") {
        const killer = units.find((unit) => unit.name === rule.effect.killer);
        if (killer) killer.hiddenLenoxPullGrowth = rule;
        activated.push(rule);
      }
      if (rule.effect?.type === "killGrowth") {
        for (const unit of units.filter((candidate) => rule.effect.units?.includes(candidate.name))) {
          unit.hiddenKillGrowth = rule;
        }
        activated.push(rule);
      }
      if (rule.effect?.type === "cloneSummon") {
        for (const unit of units.filter((candidate) => rule.effect.units?.includes(candidate.name))) {
          unit.hiddenCloneSummon = rule;
        }
        activated.push(rule);
      }
      if (rule.effect?.type === "exclusiveRescue") {
        const members = units.filter((candidate) => rule.effect.units?.includes(candidate.name));
        const rescueState = { used: false };
        for (const unit of members) {
          const partner = members.find((candidate) => candidate !== unit);
          if (!partner) continue;
          unit.hiddenExclusiveRescue = rule;
          unit.hiddenExclusivePartnerId = partner.id;
          unit.hiddenExclusiveRescueState = rescueState;
        }
        if (members.length === 2) activated.push(rule);
      }
    }
    return activated;
  }

  function markPaintTarget(source, target) {
    const rule = source?.hiddenPaintMarker;
    if (!rule || target.hp <= 0 || source.side === target.side) return null;
    target.hiddenPaintMarks ||= [];
    if (!target.hiddenPaintMarks.includes(rule.name)) target.hiddenPaintMarks.push(rule.name);
    return rule;
  }

  function consumePaintDetonation(caster, enemies) {
    const rule = caster?.hiddenPaintDetonator;
    if (!rule) return null;
    const centers = enemies.filter((unit) => unit.hp > 0 && unit.hiddenPaintMarks?.includes(rule.name));
    if (!centers.length) return null;
    for (const unit of enemies) {
      if (unit.hiddenPaintMarks) unit.hiddenPaintMarks = unit.hiddenPaintMarks.filter((name) => name !== rule.name);
    }
    return { rule, centers };
  }

  function triggerFeastEffects(defeated, units) {
    if (!defeated.hiddenFeastEffects?.length) return [];
    const results = [];
    for (const rule of defeated.hiddenFeastEffects) {
      const healRatio = Number(rule.effect.deathHealMaxHpRatio) || 0;
      for (const unit of units.filter((candidate) => candidate.hp > 0 && candidate.side === defeated.side)) {
        const before = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * healRatio));
        unit.status = "healed";
        results.push({ rule, unit, heal: unit.hp - before });
      }
    }
    return results;
  }

  function triggerKillUtilities(killer, defeated, contributors = []) {
    const results = [];
    if (killer?.hiddenKillBlink && killer.hp > 0) {
      results.push({ type: "killBlink", rule: killer.hiddenKillBlink, unit: killer });
    }
    const participants = Array.from(new Map([killer, ...contributors]
      .filter((unit) => unit?.hp > 0)
      .map((unit) => [unit.id, unit])).values());
    for (const unit of participants.filter((candidate) => candidate.hiddenLenoxPullGrowth && defeated?.lenoxPulledTarget)) {
      const rule = unit.hiddenLenoxPullGrowth;
      const atk = Number(rule.effect.atk) || 0;
      const skillAmp = Number(rule.effect.skillAmp) || 0;
      const maxHp = Number(rule.effect.maxHp) || 0;
      unit.atk += atk;
      unit.skillAmp += skillAmp;
      unit.maxHp += maxHp;
      unit.hp += maxHp;
      if (unit.combatBase) {
        unit.combatBase.atk += atk;
        unit.combatBase.skillAmp += skillAmp;
        unit.combatBase.maxHp += maxHp;
      }
      results.push({ type: "lenoxPullGrowth", rule, unit, atk, skillAmp, maxHp });
    }
    for (const unit of [killer].filter((candidate) => candidate?.hp > 0 && candidate.hiddenKillGrowth)) {
      const rule = unit.hiddenKillGrowth;
      const atk = Number(rule.effect.atk) || 0;
      unit.atk += atk;
      if (unit.combatBase) unit.combatBase.atk += atk;
      results.push({ type: "killGrowth", rule, unit, atk });
    }
    return results;
  }

  function triggerExclusiveRescue(unit, units) {
    const rule = unit?.hiddenExclusiveRescue;
    if (!rule || unit.hiddenExclusiveRescueState?.used || unit.hp <= 0) return null;
    const threshold = Number(rule.effect.triggerHpRatio) || 0.2;
    if (unit.hp / unit.maxHp > threshold) return null;
    const partner = units.find((candidate) => candidate.id === unit.hiddenExclusivePartnerId && candidate.hp > 0);
    if (!partner) return null;
    unit.hiddenExclusiveRescueState.used = true;
    return {
      rule,
      unit,
      partner,
      healRatio: Number(rule.effect.healMaxHpRatio) || 0.2,
      releaseAggro: unit.name === rule.effect.aggroReleaseUnit,
    };
  }

  function displayNameFor(unit) {
    for (const rule of activeHiddenTraits().filter((item) => item.effect?.type === "rename")) {
      const renamed = rule.effect.names?.[unit.name];
      if (renamed) return renamed;
    }
    return unit.name;
  }

  function applyAbsorbedStats(host, target, effect) {
    const multiplier = Number(effect.statMultiplier) || 1;
    host.maxHp += Math.round(target.maxHp * multiplier);
    host.hp = host.maxHp;
    host.atk += Math.round(target.atk * multiplier);
    host.speed += target.speed * multiplier;
    host.skillAmp += Math.round(target.skillAmp * multiplier);
    host.defense += Math.round(target.defense * multiplier);
    host.critChance = Math.min(1, host.critChance + (target.critChance || 0));
    host.critDamage = Math.max(host.critDamage, target.critDamage || 1.5);
    host.openingCritMultiplier = Math.max(host.openingCritMultiplier, target.openingCritMultiplier || 1);
    host.lifeSteal += target.lifeSteal || 0;
    host.damageReduction = Math.min(0.8, 1 - (1 - host.damageReduction) * (1 - (target.damageReduction || 0)));
    host.manaGain += Math.max(0, (target.manaGain || 1) - 1);
    host.healPower += Math.max(0, (target.healPower || 1) - 1);
    host.skillTargets = Math.max(host.skillTargets, target.skillTargets || 1);
    host.healTargets = Math.max(host.healTargets, target.healTargets || 1);
    host.rangeBonus = Math.max(host.rangeBonus, target.rangeBonus || 0);
    host.maxMana = Math.max(host.maxMana || 100, target.maxMana || 100);
    host.maxManaReduction = Math.max(host.maxManaReduction, target.maxManaReduction || 0);
    host.basicAttackExtraTargets += target.basicAttackExtraTargets || 0;
    host.healReductionOnHit = Math.max(host.healReductionOnHit, target.healReductionOnHit || 0);
    host.healReductionTicks = Math.max(host.healReductionTicks, target.healReductionTicks || 0);
    host.manaOnHitBonus += target.manaOnHitBonus || 0;
    host.backlineShieldTargets = Math.max(host.backlineShieldTargets, target.backlineShieldTargets || 0);
    host.backlineShieldRatio = Math.max(host.backlineShieldRatio, target.backlineShieldRatio || 0);
    host.frontlineShieldTargets = Math.max(host.frontlineShieldTargets, target.frontlineShieldTargets || 0);
    host.frontlineShieldRatio = Math.max(host.frontlineShieldRatio, target.frontlineShieldRatio || 0);
    host.pullBacklineTargets = Math.max(host.pullBacklineTargets, target.pullBacklineTargets || 0);
    host.openingMana += target.openingMana || 0;
    if (target.extraAttackEvery > 0 && (!host.extraAttackEvery || target.extraAttackEvery < host.extraAttackEvery)) {
      host.extraAttackEvery = target.extraAttackEvery;
      host.extraAttackDamageRatio = target.extraAttackDamageRatio || 1;
    }
    if (effect.dualSkill) {
      host.fusedSkillRole = target.role;
      host.fusedSkillName = target.skill;
    }
  }

  return {
    activeHiddenTraits,
    applyAbsorbedStats,
    combatAbsorptions,
    prepareDefeatEffects,
    prepareKillEffects,
    prepareOpeningEffects,
    markPaintTarget,
    consumePaintDetonation,
    triggerFeastEffects,
    triggerKillUtilities,
    triggerExclusiveRescue,
    displayNameFor,
    triggerDefeatEffects,
    triggerKillEffects,
  };
}
