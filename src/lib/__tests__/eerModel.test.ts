import { describe, expect, it } from "vitest";
import {
  eerEdges,
  findRefTable,
  generateCreateSql,
  layoutEer,
  validateModel,
  type EerModel,
  type EerTable,
} from "@/lib/eerModel";

function table(
  partial: Pick<EerTable, "schema" | "name" | "ref"> & {
    details: EerTable["details"];
  },
): EerTable {
  return {
    ...partial,
    x: 0,
    y: 0,
    w: 230,
    h: 60,
  };
}

const model: EerModel = {
  engine: "mysql",
  truncated: false,
  tables: [
    table({
      schema: "db",
      name: "users",
      ref: "db.users",
      details: {
        columns: [
          {
            name: "id",
            dataType: "INT",
            nullable: false,
            isPk: true,
            defaultValue: null,
          },
        ],
        indexes: [],
        foreignKeys: [],
      },
    }),
    table({
      schema: "db",
      name: "orders",
      ref: "db.orders",
      details: {
        columns: [
          {
            name: "id",
            dataType: "INT",
            nullable: false,
            isPk: true,
            defaultValue: null,
          },
          {
            name: "user_id",
            dataType: "INT",
            nullable: false,
            isPk: false,
            defaultValue: null,
          },
        ],
        indexes: [],
        foreignKeys: [
          {
            name: "fk_orders_user",
            columns: ["user_id"],
            refTable: "db.users",
            refColumns: ["id"],
          },
        ],
      },
    }),
  ],
};

describe("eerModel", () => {
  it("layouts and finds edges", () => {
    layoutEer(model.tables);
    expect(model.tables[1].x).not.toBeUndefined();
    expect(findRefTable(model, model.tables[1], "db.users")?.name).toBe(
      "users",
    );
    expect(eerEdges(model).length).toBe(1);
  });

  it("generates SQL and validates", () => {
    expect(generateCreateSql(model)).toMatch(/CREATE TABLE/);
    expect(validateModel(model)).toEqual([]);
    const broken: EerModel = {
      ...model,
      tables: [
        table({
          ...model.tables[0],
          details: {
            columns: [
              {
                name: "name",
                dataType: "TEXT",
                nullable: true,
                isPk: false,
                defaultValue: null,
              },
            ],
            indexes: [],
            foreignKeys: [],
          },
        }),
      ],
    };
    expect(validateModel(broken).some((m) => /primary key/i.test(m))).toBe(
      true,
    );
  });
});
