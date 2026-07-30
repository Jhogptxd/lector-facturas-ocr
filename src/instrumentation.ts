/**
 * Next.js runs this once when the server boots. We use it to start the reminder
 * sweep that turns upcoming debt due dates into notifications.
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const FIRST_SWEEP_DELAY_MS = 10 * 1000; // let the server finish starting

// Dev hot-reload re-runs register(); keep the timer on globalThis so we never
// stack multiple schedulers.
const globalForScheduler = globalThis as unknown as {
  __cuarentaReminderTimer?: NodeJS.Timeout;
};

export async function register() {
  // Prisma cannot run on the edge runtime, and this only needs to happen once.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalForScheduler.__cuarentaReminderTimer) return;

  const { generateDueDateReminders } = await import("@/lib/reminders");

  const sweep = async () => {
    try {
      const { created } = await generateDueDateReminders();
      if (created > 0) {
        console.log(`[reminders] created ${created} due-date reminder(s)`);
      }
    } catch (error) {
      console.error("[reminders] sweep failed", error);
    }
  };

  setTimeout(sweep, FIRST_SWEEP_DELAY_MS).unref?.();

  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref?.();
  globalForScheduler.__cuarentaReminderTimer = timer;

  console.log("[reminders] scheduler registered");
}
