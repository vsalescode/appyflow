import { describe, expect, it } from "vitest";

import { calculateNextRunAt, parseSearchSchedule } from "./search-schedule";

describe("search schedule", () => {
  it("valida horário, fuso e limites", () => {
    expect(
      parseSearchSchedule({
        enabled: true,
        scheduledTime: "09:30",
        timeZone: "America/Sao_Paulo",
        maxQueries: "12",
        resultsPerQuery: "8",
      }),
    ).toMatchObject({ maxQueries: 12, resultsPerQuery: 8 });
    expect(() =>
      parseSearchSchedule({
        enabled: true,
        scheduledTime: "25:00",
        timeZone: "Invalid/Zone",
        maxQueries: 0,
        resultsPerQuery: 11,
      }),
    ).toThrow();
  });

  it("calcula a próxima execução no fuso escolhido", () => {
    expect(
      calculateNextRunAt(
        "09:00",
        "America/Sao_Paulo",
        new Date("2026-09-22T12:00:00.000Z"),
      ),
    ).toEqual(new Date("2026-09-23T12:00:00.000Z"));
    expect(
      calculateNextRunAt("09:00", "UTC", new Date("2026-09-22T08:59:00Z")),
    ).toEqual(new Date("2026-09-22T09:00:00.000Z"));
  });
});
