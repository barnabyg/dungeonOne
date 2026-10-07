// Two of the bestiary's Skeleton under a module's own names (#231), for the
// tests that check a renamed bestiary monster keeps its module name.
import { fightRoom } from "./modules.mjs";

/** The two skeletons, as module JSON opponents. */
export const RENAMED_SKELETONS = [
  {
    id: "skeleton-sergeant",
    monster: "skeleton",
    name: "Tall Skeleton",
    description: "A tall skeleton in rusted mail raises a shortsword.",
  },
  {
    id: "skeleton-guard",
    monster: "skeleton",
    name: "Bent Skeleton",
    description: "A bent skeleton clatters up from a bunk beside it.",
  },
];

/** A one-room fight against the two renamed skeletons, level 1, hard. */
export const skeletonBarracks = fightRoom(
  "skeleton-barracks",
  "The Skeleton Barracks",
  RENAMED_SKELETONS,
);
