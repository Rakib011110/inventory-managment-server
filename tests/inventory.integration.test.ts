import path from "node:path";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { Item } from "../src/modules/items/item.model";
import { Holding } from "../src/modules/stock/holding.model";
import { StockMovement } from "../src/modules/stock/stockMovement.model";
import { User } from "../src/modules/users/user.model";

describe("refined inventory IN / OUT workflow", () => {
  let replicaSet: import("mongodb-memory-server").MongoMemoryReplSet;

  beforeAll(async () => {
    process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(
      process.cwd(),
      ".cache",
      "mongodb-binaries",
    );
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    await mongoose.connect(replicaSet.getUri("inventory-test"));
    await User.create({
      name: "System Admin",
      email: "admin@example.com",
      password: "admin12345",
      role: "ADMIN",
      status: "ACTIVE",
    });
  }, 600_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet?.stop();
  });

  it("handles OUT, IN, quantity changes, transfers, locations, totals, and role isolation", async () => {
    const admin = request.agent(app);
    await admin
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "admin12345" })
      .expect(200);

    const rakibResponse = await admin
      .post("/api/v1/users")
      .send({
        name: "Rakib",
        email: "rakib@example.com",
        password: "user12345",
        role: "USER",
      })
      .expect(201);
    expect(rakibResponse.body.data.password).toBeUndefined();
    const rakibId = rakibResponse.body.data._id as string;

    const rahimResponse = await admin
      .post("/api/v1/users")
      .send({
        name: "Rahim",
        email: "rahim@example.com",
        password: "user12345",
        role: "USER",
      })
      .expect(201);
    const rahimId = rahimResponse.body.data._id as string;

    const karimResponse = await admin
      .post("/api/v1/users")
      .send({
        name: "Karim",
        email: "karim@example.com",
        password: "user12345",
        role: "USER",
      })
      .expect(201);
    const karimId = karimResponse.body.data._id as string;

    const updatedRakib = await admin
      .patch(`/api/v1/users/${rakibId}`)
      .send({ phone: "01700000000" })
      .expect(200);
    expect(updatedRakib.body.data.phone).toBe("01700000000");

    const computerResponse = await admin
      .post("/api/v1/items")
      .send({
        name: "Computer",
        quantity: 25,
        unitPrice: 50000,
        location: "Warehouse A",
      })
      .expect(201);
    const computerId = computerResponse.body.data._id as string;

    const updatedComputer = await admin
      .patch(`/api/v1/items/${computerId}`)
      .send({
        name: "Computer",
        quantity: 25,
        unitPrice: 50000,
        location: "Main Warehouse",
      })
      .expect(200);
    expect(updatedComputer.body.data.location).toBe("Main Warehouse");

    const outToRakib = await admin
      .post("/api/v1/stock/out")
      .send({
        itemId: computerId,
        userId: rakibId,
        quantity: 5,
        location: "Head Office",
      })
      .expect(201);
    const rakibHoldingId = outToRakib.body.data._id as string;

    let computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 25,
      availableQuantity: 20,
      assignedQuantity: 5,
      storedQuantity: 0,
    });

    await admin
      .patch(`/api/v1/stock/holdings/${rakibHoldingId}`)
      .send({ quantity: 3, location: "Head Office" })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 25,
      availableQuantity: 22,
      assignedQuantity: 3,
    });

    await admin
      .patch(`/api/v1/stock/holdings/${rakibHoldingId}`)
      .send({ quantity: 7, location: "Head Office" })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 25,
      availableQuantity: 18,
      assignedQuantity: 7,
    });

    const transfer = await admin
      .post("/api/v1/stock/transfer")
      .send({
        holdingId: rakibHoldingId,
        toUserId: rahimId,
        quantity: 2,
        location: "Project Site A",
      })
      .expect(200);
    const rahimHoldingId = transfer.body.data._id as string;

    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 25,
      availableQuantity: 18,
      assignedQuantity: 7,
    });

    await admin
      .post("/api/v1/stock/in")
      .send({ holdingId: rakibHoldingId, quantity: 1 })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 25,
      availableQuantity: 19,
      assignedQuantity: 6,
    });

    await admin
      .patch(`/api/v1/stock/holdings/${rahimHoldingId}`)
      .send({ quantity: 2, location: "Site Office B" })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      availableQuantity: 19,
      assignedQuantity: 6,
    });

    await admin
      .post("/api/v1/stock/out")
      .send({
        itemId: computerId,
        userId: rakibId,
        quantity: 20,
        location: "Head Office",
      })
      .expect(400);
    computer = await Item.findById(computerId).lean();
    expect(computer?.availableQuantity).toBe(19);
    expect(computer?.assignedQuantity).toBe(6);

    const details = await admin.get(`/api/v1/items/${computerId}`).expect(200);
    expect(details.body.data.holdings).toHaveLength(2);
    expect(details.body.data.holdings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 4, location: "Head Office" }),
        expect.objectContaining({ quantity: 2, location: "Site Office B" }),
      ]),
    );
    expect(details.body.data.history.map((entry: { type: string }) => entry.type)).toEqual(
      expect.arrayContaining(["OUT", "IN", "UPDATE", "TRANSFER"]),
    );

    const deletedAssignment = await admin
      .delete(`/api/v1/stock/holdings/${rahimHoldingId}`)
      .expect(200);
    expect(deletedAssignment.body.data).toMatchObject({ returnedQuantity: 2 });
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 25,
      availableQuantity: 21,
      assignedQuantity: 4,
    });

    const correctedQuantity = await admin
      .patch(`/api/v1/items/${computerId}`)
      .send({ quantity: 24 })
      .expect(200);
    expect(correctedQuantity.body.data).toMatchObject({
      quantity: 24,
      availableQuantity: 20,
      assignedQuantity: 4,
    });

    const repeatedQuantity = await admin
      .patch(`/api/v1/items/${computerId}`)
      .send({ quantity: 24 })
      .expect(200);
    expect(repeatedQuantity.body.data.availableQuantity).toBe(20);

    const storedWithRahim = await admin
      .post("/api/v1/stock/out")
      .send({
        itemId: computerId,
        userId: rahimId,
        quantity: 6,
        location: "Store Room A",
        purpose: "STORE",
      })
      .expect(201);
    const rahimStoreHoldingId = storedWithRahim.body.data._id as string;
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      quantity: 24,
      availableQuantity: 20,
      assignedQuantity: 4,
      storedQuantity: 6,
    });

    await admin
      .patch(`/api/v1/stock/holdings/${rahimStoreHoldingId}`)
      .send({ quantity: 6, location: "Store Room A", purpose: "USE" })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      availableQuantity: 14,
      assignedQuantity: 10,
      storedQuantity: 0,
    });

    await admin
      .patch(`/api/v1/stock/holdings/${rahimStoreHoldingId}`)
      .send({ quantity: 8, location: "Store Room A", purpose: "STORE" })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      availableQuantity: 20,
      assignedQuantity: 4,
      storedQuantity: 8,
    });

    await admin
      .post("/api/v1/stock/in")
      .send({ holdingId: rahimStoreHoldingId, quantity: 3 })
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      availableQuantity: 20,
      assignedQuantity: 4,
      storedQuantity: 5,
    });

    const storedToUseTransfer = await admin
      .post("/api/v1/stock/transfer")
      .send({
        holdingId: rahimStoreHoldingId,
        toUserId: karimId,
        quantity: 2,
        location: "Project Site C",
        purpose: "USE",
      })
      .expect(200);
    const karimUseHoldingId = storedToUseTransfer.body.data._id as string;
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      availableQuantity: 18,
      assignedQuantity: 6,
      storedQuantity: 3,
    });

    await admin.delete(`/api/v1/stock/holdings/${karimUseHoldingId}`).expect(200);
    await admin
      .delete(`/api/v1/stock/holdings/${rahimStoreHoldingId}`)
      .expect(200);
    computer = await Item.findById(computerId).lean();
    expect(computer).toMatchObject({
      availableQuantity: 20,
      assignedQuantity: 4,
      storedQuantity: 0,
    });

    const purposeDetails = await admin
      .get(`/api/v1/items/${computerId}`)
      .expect(200);
    expect(
      purposeDetails.body.data.history.map((entry: { type: string }) => entry.type),
    ).toContain("STORE");

    const detailsAfterDelete = await admin
      .get(`/api/v1/items/${computerId}`)
      .expect(200);
    expect(detailsAfterDelete.body.data.holdings).toHaveLength(1);
    expect(
      detailsAfterDelete.body.data.history.map((entry: { type: string }) => entry.type),
    ).toContain("DELETE");

    await admin.delete(`/api/v1/items/${computerId}`).expect(400);

    const spareItem = await admin
      .post("/api/v1/items")
      .send({
        name: "Spare Mouse",
        quantity: 2,
        unitPrice: 800,
        location: "Main Warehouse",
      })
      .expect(201);
    await admin.delete(`/api/v1/items/${spareItem.body.data._id}`).expect(200);

    const temporaryUser = await admin
      .post("/api/v1/users")
      .send({
        name: "Temporary User",
        email: "temporary@example.com",
        password: "user12345",
        role: "USER",
      })
      .expect(201);
    await admin.delete(`/api/v1/users/${temporaryUser.body.data._id}`).expect(200);

    const dashboard = await admin
      .get("/api/v1/dashboard/admin-summary")
      .expect(200);
    expect(dashboard.body.data).toMatchObject({
      totalItemTypes: 1,
      totalAvailableUnits: 20,
      totalAssignedUnits: 4,
      totalInventoryValue: 1200000,
      totalAssignedInventoryValue: 200000,
      totalStoredUnits: 0,
      totalUsers: 3,
    });

    const rakib = request.agent(app);
    await rakib
      .post("/api/v1/auth/login")
      .send({ email: "rakib@example.com", password: "user12345" })
      .expect(200);
    const myItems = await rakib.get("/api/v1/dashboard/my-items").expect(200);
    expect(myItems.body.data).toMatchObject({
      totalItems: 4,
      totalValue: 200000,
    });
    expect(myItems.body.data.items[0]).toMatchObject({
      itemName: "Computer",
      quantity: 4,
      location: "Head Office",
      purpose: "USE",
    });

    await rakib.get("/api/v1/items").expect(403);
    await rakib.get("/api/v1/users").expect(403);
    await rakib.post("/api/v1/auth/logout").expect(200);
    await rakib.get("/api/v1/auth/me").expect(401);

    await admin
      .delete("/api/v1/system/database")
      .send({ confirmation: "WRONG" })
      .expect(400);

    const cleared = await admin
      .delete("/api/v1/system/database")
      .send({ confirmation: "CLEAR DATABASE" })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      deletedItems: 2,
      deletedAssignments: 1,
      deletedUsers: 4,
    });
    expect(await Item.countDocuments()).toBe(0);
    expect(await Holding.countDocuments()).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(1);
    const retainedAdmin = await admin.get("/api/v1/auth/me").expect(200);
    expect(retainedAdmin.body.data.email).toBe("admin@example.com");
  }, 30_000);
});
