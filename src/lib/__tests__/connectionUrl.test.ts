import { describe, expect, it } from "vitest";
import { buildConnectionUrl, parseConnectionUrl } from "@/lib/connectionUrl";

describe("connectionUrl", () => {
  it("parses mysql URL", () => {
    const p = parseConnectionUrl("mysql://root:secret@127.0.0.1:3306/demo");
    expect(p.engine).toBe("mysql");
    expect(p.config.host).toBe("127.0.0.1");
    expect(p.config.port).toBe(3306);
    expect(p.config.database).toBe("demo");
    expect(p.config.user).toBe("root");
  });

  it("parses sqlite path", () => {
    expect(parseConnectionUrl("/tmp/x.db").config.path).toBe("/tmp/x.db");
  });

  it("round-trips build", () => {
    const url = buildConnectionUrl("postgres", {
      host: "localhost",
      port: 5432,
      user: "u",
      password: "p",
      database: "db",
    });
    expect(url).toMatch(/^postgresql:/);
    expect(parseConnectionUrl(url).config.database).toBe("db");
  });
});
