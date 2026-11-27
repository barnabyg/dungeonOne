/**
 * The game as text: what the command-line adapter prints and what a blind
 * player is shown. A card is one history entry; the view is the room as it
 * stands, with the action bar the browser shows, from the runtime's
 * `projectActions`: every action, numbered, a disabled one with the engine's
 * reason.
 */
import {
  DAMAGE_ADJUSTMENT_TEXT,
  type ActionView,
  type RollGroup,
} from "./runtime-5e.js";
import type { FifthSession, HistoryCard } from "./session-5e.js";

/** The browser's button labels, so both offer the same choices. */
export const ACTION_LABELS: Readonly<Record<ActionView["action"], string>> = {
  attack: "Attack ",
  "light-attack": "Extra attack ",
  use: "Drink ",
  move: "Go to ",
  sneak: "Sneak into ",
  ambush: "Ambush in ",
  react: "",
  examine: "Examine ",
  take: "Take ",
  force: "Force ",
  pick: "Pick ",
  break: "Break ",
  unlock: "Unlock ",
  search: "Search ",
  disarm: "Disarm ",
  talk: "Talk to ",
  // The item goes before its feature (#400): "Use Stone Snake on Stone Door".
  "use-on": "Use ",
  // The feature goes before its opponent (#402): "Use Leaning Statue
  // against Giant Rat".
  "use-feature": "Use ",
  equip: "Equip ",
  unequip: "Unequip ",
  swap: "Wield ",
  drop: "Drop ",
  buy: "Buy ",
  sell: "Sell ",
  "sell-equipped": "Sell equipped ",
  "sell-treasure": "Sell ",
  "second-wind": "Second Wind",
  "action-surge": "Action Surge",
  hide: "Hide",
  "steady-aim": "Steady Aim",
  disengage: "Disengage",
  flee: "Flee to ",
  "divine-spark": "Divine Spark ",
  "turn-undead": "Turn Undead",
  "preserve-life": "Preserve Life",
  "spectral-attack": "Spiritual Weapon at ",
  "drain-attack": "Vampiric Touch at ",
  "uncanny-dodge": "Uncanny Dodge",
  "take-hit": "Take the hit",
  fall: "Fall",
  "end-turn": "End turn",
  leave: "Leave the adventure",
  "tactical-mind": "Tactical Mind",
  rest: "Short rest",
  "long-rest": "Long rest",
  cast: "Cast ",
  "regain-slot": "Regain a spell slot with ",
};

/** One roll group in a line, such as "Ada's attack: d20 14 + 5 = 19 vs AC 13, hit". */
function describeRoll(group: RollGroup): string {
  const dice = group.dice
    .map(
      ({ sides, value, dropped }) =>
        `d${sides} ${value}${dropped === true ? " (dropped)" : ""}`,
    )
    .join(", ");
  const modifier =
    group.modifier === 0
      ? ""
      : ` ${group.modifier < 0 ? "-" : "+"} ${Math.abs(group.modifier)}`;
  return [
    `${group.roller}'s ${group.label ?? group.purpose}`,
    group.target === undefined ? "" : ` on ${group.target}`,
    `: ${dice}${modifier} = ${group.total}`,
    group.armorClass === undefined ? "" : ` vs AC ${group.armorClass}`,
    group.dc === undefined ? "" : ` vs DC ${group.dc}`,
    group.mode === undefined ? "" : ` (${group.mode})`,
    group.outcome === undefined ? "" : `, ${group.outcome}`,
    group.halved === true ? ", halved" : "",
    group.adjustment === undefined
      ? ""
      : `, ${DAMAGE_ADJUSTMENT_TEXT[group.adjustment]}`,
    group.hpAfter === undefined
      ? ""
      : `, HP ${group.hpAfter}/${String(group.maxHp)}`,
  ].join("");
}

/**
 * A card as text: its heading, each line, and each line's rolls beneath it,
 * unless `rolls` is false.
 */
export function renderCard(card: HistoryCard, rolls = true): string {
  const heading = {
    narration: "Scene",
    result: "Result",
    rejection: "Action rejected",
  }[card.kind];
  return [
    `[${heading}]`,
    ...card.lines.flatMap(({ text, rolls: groups }) => [
      `  ${text}`,
      ...(rolls ? groups.map((group) => `    ${describeRoll(group)}`) : []),
    ]),
  ].join("\n");
}

/**
 * One action as the action bar words it, such as "Use Stone Snake on Stone
 * Door" or "Force Swollen Door — Too little coin" for one that is disabled.
 */
export function actionText({
  action,
  target,
  item,
  feature,
  approach,
  retry,
  cunningStrike,
  spell,
  mode,
  available,
  reason,
}: ActionView): string {
  return `${retry === undefined ? "" : "Try again: "}${ACTION_LABELS[action]}${mode === undefined ? "" : `(${mode}) at `}${spell === undefined ? "" : `${spell.name}${spell.damageType === undefined ? "" : ` ${spell.damageTypeUse === "dealt" ? "of" : "against"} ${spell.damageType}`}${spell.curseName === undefined ? "" : ` (${spell.curseName})`}${spell.item === undefined ? (spell.slotLevel === undefined ? "" : ` (level ${spell.slotLevel} slot)`) : ` from ${spell.item.name}${spell.slotLevel === undefined ? "" : ` at level ${spell.slotLevel}`}`} at `}${item === undefined ? "" : `${item.name} on `}${feature === undefined ? "" : `${feature.name} against `}${target === undefined || action === "leave" ? "" : target.name}${approach === undefined ? "" : ` with ${approach.name}${approach.dc === undefined ? "" : ` DC ${approach.dc}`}`}${cunningStrike === undefined ? "" : ` with Cunning Strike (${cunningStrike.name})`}${retry === undefined ? "" : ` (${retry.reason})`}${available ? "" : ` — ${String(reason)}`}`;
}

export function renderView(
  session: FifthSession,
  /**
   * The blind player's view (#624): the carried list is left to its own
   * fuller list, and an Examine already made is marked, as the page marks
   * it. The command-line adapter passes nothing.
   */
  options: Readonly<{ blind?: boolean }> = {},
): string {
  const { runtime, state } = session;
  const blind = options.blind === true;
  const room = runtime.projectRoom(state);
  const fight = runtime.projectFight(state).encounter;
  const actions = runtime.projectActions(state);
  return [
    `== ${room.name} == ${session.character.name} HP ${room.character.hp}/${room.character.maxHp} (${room.character.health})`,
    // Once raised, the alarm (#401).
    ...(room.alarm === undefined ? [] : [room.alarm]),
    ...(fight === undefined
      ? []
      : [
          `Fight, round ${fight.round}: ${fight.combatants
            .map(
              ({ name, hp, maxHp, armorClass, defeated }) =>
                `${name} ${defeated ? "down" : `HP ${hp}/${maxHp}`} AC ${armorClass}`,
            )
            .join("; ")}`,
        ]),
    ...(blind || room.inventory.length === 0
      ? []
      : [`Carrying: ${room.inventory.map(({ name }) => name).join(", ")}`]),
    ...(room.purse === undefined ? [] : [`Purse: ${room.purse}`]),
    "Actions:",
    ...actions.map(
      (view, index) =>
        `  ${index + 1}. ${actionText(view)}${blind && view.examined === true ? " (already examined)" : ""}`,
    ),
  ].join("\n");
}

export function renderEnding(session: FifthSession): string {
  const ending = session.adventure.endings.find(
    ({ id }) => id === session.state.endingId,
  );
  return [
    `The adventure is over: ${session.state.status}.`,
    ...(ending === undefined
      ? []
      : [`${ending.title} (${ending.kind}). ${ending.text}`]),
  ].join("\n");
}
