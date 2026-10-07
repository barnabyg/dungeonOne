// The creation choices most library and session tests create Ada with.
import { FIGHTER_DEFAULT_CHOICES } from "../../dist/fighter-5e.js";

/** Each roll placed on the ability in table order: the first on Strength. */
export const IN_ORDER = {
  strength: 0,
  dexterity: 1,
  constitution: 2,
  intelligence: 3,
  wisdom: 4,
  charisma: 5,
};

/** The creation screen's default choices, with the rolls placed in order. */
export const IN_ORDER_CHOICES = {
  placement: IN_ORDER,
  ...FIGHTER_DEFAULT_CHOICES,
};
