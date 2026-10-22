/** Local backup schedule reminders (triggers dump via UI, not OS cron). */

const KEY = "re-dbviewer.backup-schedule.v1";

export type BackupSchedule = {
  connectionId: string;
  intervalHours: number;
  lastRunAt: number | null;
  enabled: boolean;
};

export function loadSchedules(): BackupSchedule[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as BackupSchedule[];
  } catch {
    return [];
  }
}

export function saveSchedules(list: BackupSchedule[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function dueSchedules(now = Date.now()): BackupSchedule[] {
  return loadSchedules().filter((s) => {
    if (!s.enabled || s.intervalHours <= 0) return false;
    if (s.lastRunAt == null) return true;
    return now - s.lastRunAt >= s.intervalHours * 3600_000;
  });
}

export function markRan(connectionId: string, now = Date.now()): void {
  const list = loadSchedules().map((s) =>
    s.connectionId === connectionId ? { ...s, lastRunAt: now } : s,
  );
  saveSchedules(list);
}
