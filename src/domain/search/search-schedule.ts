import { z } from "zod";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const searchScheduleSchema = z
  .object({
    enabled: z.boolean(),
    scheduledTime: z.string().regex(timePattern),
    timeZone: z.string().trim().min(1).max(100),
    maxQueries: z.coerce.number().int().min(1).max(50),
    resultsPerQuery: z.coerce.number().int().min(1).max(10),
  })
  .superRefine((value, context) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: "fuso horário inválido",
      });
    }
  });

export type SearchScheduleInput = z.infer<typeof searchScheduleSchema>;

export function parseSearchSchedule(value: unknown) {
  return searchScheduleSchema.parse(value);
}

export function calculateNextRunAt(
  scheduledTime: string,
  timeZone: string,
  after: Date,
) {
  const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = new Date(after);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  for (let minute = 0; minute < 60 * 48; minute += 1) {
    const candidate = new Date(start.getTime() + minute * 60_000);
    const parts = formatter.formatToParts(candidate);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const currentMinute = Number(
      parts.find((part) => part.type === "minute")?.value,
    );
    if (hour === targetHour && currentMinute === targetMinute) return candidate;
  }
  throw new Error("Não foi possível calcular a próxima execução.");
}
