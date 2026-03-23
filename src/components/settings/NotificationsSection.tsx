import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import AccordionSection from "@/components/AccordionSection";
import type { MealReminders } from "@/hooks/useMealReminders";

interface NotificationsSectionProps {
  mealReminders: MealReminders;
  updateReminders: (data: Partial<MealReminders>) => Promise<void>;
}

export default function NotificationsSection({
  mealReminders,
  updateReminders,
}: NotificationsSectionProps) {
  return (
    <AccordionSection icon={<Bell className="w-5 h-5 text-primary" />} title="Meal Reminders" subtitle="Notification timings & timezone">
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Enable reminders</p>
            <p className="text-xs text-muted-foreground">Get notified when it's time to eat</p>
          </div>
          <button
            onClick={async () => {
              const next = !mealReminders.enabled;
              if (next && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
              }
              await updateReminders({ enabled: next });
            }}
            className={cn("w-10 h-6 rounded-full transition-colors relative", mealReminders.enabled ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", mealReminders.enabled ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        {mealReminders.enabled && (
          <>
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
              <div key={meal} className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateReminders({ [meal]: { ...mealReminders[meal], enabled: !mealReminders[meal].enabled } })}
                    className={cn("w-8 h-5 rounded-full transition-colors relative", mealReminders[meal].enabled ? "bg-primary" : "bg-muted border border-border")}
                  >
                    <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform shadow-sm", mealReminders[meal].enabled ? "translate-x-[14px]" : "translate-x-[3px]")} />
                  </button>
                  <span className="text-sm text-foreground capitalize">{meal}</span>
                </div>
                <input
                  type="time"
                  value={mealReminders[meal].time}
                  onChange={(e) => updateReminders({ [meal]: { ...mealReminders[meal], time: e.target.value } })}
                  className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
                  disabled={!mealReminders[meal].enabled}
                />
              </div>
            ))}

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
              <span className="text-sm text-foreground">Timezone</span>
              <p className="text-xs text-muted-foreground">{mealReminders.timezone}</p>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Notifications work best when installed as an app
            </p>
          </>
        )}
      </div>
    </AccordionSection>
  );
}
