import { useState } from "react";
import { useProductStore } from "../../store/productStore";
import { Trash2, Send, Bell, Mail, Smartphone } from 'lucide-react';

const NotificationsModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [notifications] = useState([
    { id: '1', title: 'System Maintenance', message: 'The servers will be down for 30 minutes tonight at 2 AM.', targetAudience: 'All Users', type: 'in_app', priority: 'high', sentAt: '2026-07-22T10:00:00Z' },
    { id: '2', title: 'Welcome to Version 2.0', message: 'Check out the new features we just launched!', targetAudience: 'Premium Only', type: 'email', priority: 'normal', sentAt: '2026-07-20T10:00:00Z' },
  ]);

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'push': return <Smartphone className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Broadcast Notifications</h3>
          <p className="text-slate-500 text-sm mt-1">Send announcements to {isAllApplications ? 'all platform users' : 'users of ' + selectedProduct?.displayName}</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
          <Send className="w-4 h-4" /> NEW BROADCAST
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
            <tr>
              <th className="px-6 py-4">Title & Message</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Audience</th>
              <th className="px-6 py-4">Sent At</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {notifications.map(n => (
              <tr key={n.id} className="hover:bg-slate-800/20">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${n.priority === 'high' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                    <div className="font-bold text-white text-sm">{n.title}</div>
                  </div>
                  <div className="text-slate-500 line-clamp-1">{n.message}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase text-[10px]">
                    {getTypeIcon(n.type)}
                    {n.type.replace('_', ' ')}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-300 font-medium">
                  {n.targetAudience}
                </td>
                <td className="px-6 py-4 text-slate-400">
                  {new Date(n.sentAt).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <button className="text-rose-500 hover:text-rose-400 p-2 rounded-lg hover:bg-rose-500/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NotificationsModule;