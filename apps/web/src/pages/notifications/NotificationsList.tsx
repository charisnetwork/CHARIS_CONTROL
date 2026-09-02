import { Bell, Send } from 'lucide-react';

export function NotificationsList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Bell className="w-8 h-8 text-primary" />
            Notifications
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Global notification center.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] text-sm font-medium">
          <Send className="w-4 h-4" /> Broadcast
        </button>
      </div>

      <div className="glass rounded-2xl p-6 border border-[var(--border-color)]">
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)] flex-col gap-4">
          <Bell className="w-12 h-12 opacity-20" />
          <p>System broadcasts and global notifications.</p>
        </div>
      </div>
    </div>
  );
}
