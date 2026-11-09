// Reassigns major traits around readable combat roles while preserving mechanics and minor traits.
import fs from "node:fs";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const rename = {
  "격류": "격전", "맹공": "격전",
  "균열": "정조준", "정밀": "정조준",
  "성역": "철벽", "수호": "철벽",
  "잔향": "술식", "주술": "술식",
  "포식": "암습", "기습": "암습",
  "궤도": "진형", "전술": "진형",
  "역전": "투혼", "결투": "투혼",
  "연계": "연대", "지원": "연대",
};

const tactical = new Set(["아이솔", "유스티나", "마르티나", "카티야", "히스이", "다르코", "펜리르", "클로에"]);
const majorOverrides = {
  "피올로": "격전",
  "가넷": "격전",
  "레온": "철벽",
  "케네스": "투혼",
  "츠바메": "정조준",
  "코렐라인": "정조준",
  "헤이즈": "술식",
};
const roleMajor = {
  "난투": "격전",
  "사격": "정조준",
  "방패": "철벽",
  "술법": "술식",
  "암살": "암습",
  "검객": "투혼",
  "지원": "연대",
};

const roster = read("data/core/roster.json");
for (const unit of roster) {
  const currentMinor = (unit.traits || []).find((trait) => trait !== unit.trait);
  const nextMinor = rename[currentMinor] || currentMinor;
  const major = unit.active === false
    ? (rename[unit.trait] || unit.trait)
    : majorOverrides[unit.name] || (tactical.has(unit.name) ? "진형" : roleMajor[unit.role]);
  if (!major) continue;
  unit.trait = major;
  unit.traits = [major, nextMinor].filter(Boolean);
}
write("data/core/roster.json", roster);

const traits = read("data/systems/traits.json");
const renamedTraits = {};
for (const [name, rule] of Object.entries(traits)) renamedTraits[rename[name] || name] = rule;
write("data/systems/traits.json", renamedTraits);

const bosses = read("data/systems/bosses.json");
for (const boss of bosses) {
  boss.trait = rename[boss.trait] || boss.trait;
  if (Array.isArray(boss.traits)) boss.traits = boss.traits.map((trait) => rename[trait] || trait);
}
write("data/systems/bosses.json", bosses);

for (const folder of ["common", "stage1", "stage2", "stage3"]) {
  for (const rarity of ["silver", "gold", "prismatic"]) {
    const path = `data/augments/${folder}/${rarity}.json`;
    const entries = read(path);
    for (const augment of entries) {
      const previousTrait = augment.effect?.trait || augment.requires?.trait;
      const nextTrait = rename[previousTrait];
      if (augment.effect?.trait && nextTrait) augment.effect.trait = nextTrait;
      if (augment.requires?.trait && rename[augment.requires.trait]) augment.requires.trait = rename[augment.requires.trait];
      if (!nextTrait) continue;
      augment.name = String(augment.name || "").replace(previousTrait, nextTrait);
      augment.tags = (augment.tags || []).map((tag) => tag === previousTrait ? nextTrait : tag);
      augment.summary = String(augment.summary || "").replace(`${previousTrait} 시너지`, `${nextTrait} 시너지`);
      augment.description = String(augment.description || "")
        .replace(`${previousTrait} 시너지`, `${nextTrait} 시너지`)
        .replace(`${previousTrait} 유닛`, `${nextTrait} 유닛`);
    }
    write(path, entries);
  }
}

console.log("major trait roles reassigned");
