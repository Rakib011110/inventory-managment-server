import { Item } from "./item.model";
import { Holding } from "../stock/holding.model";

/**
 * Version 4 introduces assignment purpose. Existing assignments are classified
 * as USE because they previously reduced Available Stock. STORE assignments are
 * tracked separately and remain part of Available Stock.
 */
export async function migrateStockAccounting() {
  await Holding.updateMany(
    { purpose: { $exists: false } },
    { $set: { purpose: "USE" } },
  );

  const result = await Item.updateMany(
    {
      $or: [
        { stockAccountingVersion: { $exists: false } },
        { stockAccountingVersion: { $lt: 4 } },
      ],
    },
    [
      {
        $set: {
          quantity: { $max: ["$quantity", "$assignedQuantity"] },
          availableQuantity: {
            $subtract: [
              { $max: ["$quantity", "$assignedQuantity"] },
              "$assignedQuantity",
            ],
          },
          storedQuantity: { $ifNull: ["$storedQuantity", 0] },
          stockAccountingVersion: 4,
        },
      },
    ],
    { updatePipeline: true },
  );

  if (result.modifiedCount > 0) {
    console.log(`Migrated ${result.modifiedCount} item records to stock accounting v4`);
  }
}
