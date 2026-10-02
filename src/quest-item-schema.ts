import type { Schema } from "./adventure-schema.js";
import { RECOVERY_SCHEMA } from "./recovery-schema.js";

const base = RECOVERY_SCHEMA as unknown as Schema;
const items = base.properties!.items!;
const item = items.items!;
const id = { type: "string", minLength: 1 } as const;

/** Only this tuple permits a non-healing item and its fixed placement action. */
export const QUEST_ITEM_SCHEMA = {
  ...base,
  title: "Dungeon One signal component adventure v14",
  required: [...base.required!, "questItem"],
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 14 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v15" },
    items: {
      ...items,
      items: {
        ...item,
        required: item.required!.filter((key) => key !== "healing"),
      },
    },
    questItem: {
      type: "object",
      additionalProperties: false,
      required: [
        "itemId",
        "featureId",
        "milestoneId",
        "discoveryId",
        "timeCost",
      ],
      properties: {
        itemId: id,
        featureId: id,
        milestoneId: id,
        discoveryId: id,
        timeCost: { type: "integer", const: 0 },
      },
    },
  },
} as const;
