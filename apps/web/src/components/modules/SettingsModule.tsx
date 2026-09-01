
import { useProductStore } from "../../store/productStore";
import { Settings, Shield, Server, Mail, HardDrive, Users, Activity } from 'lucide-react';

const SettingsModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();

  const settingsTabs = [
    { id: 'general', name: 'General Settings', icon: Settings, desc: 'Company details and brand configurations.' },
    { id: 'api', name: 'API Endpoints', icon: Server, desc: 'Manage registered product Webhooks and APIs.' },
    { id: 'email', name: 'Email Config', icon: Mail, desc: 'SMTP, SendGrid, and Mailgun integrations.' },
    { id: 'storage', name: 'Storage & Backups', icon: HardDrive, desc: 'AWS S3 / Cloudinary configurations.' },
    { id: 'security', name: 'Security & Audit', icon: Shield, desc: 'Audit logs, 2FA, and access policies.' },
    { id: 'staff', name: 'Staff & Roles', icon: Users, desc: 'Manage Charis internal admin accounts.' },
    { id: 'system', name: 'System Info', icon: Activity, desc: 'Server health, memory usage, and build version.' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Platform Configuration</h3>
          <p className="text-slate-500 text-sm mt-1">
            {isAllApplications ? 'Manage global system settings and integrations.' : `Manage API and settings specific to ${selectedProduct?.displayName}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {settingsTabs.map(tab => (
          <button key={tab.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl hover:border-indigo-500/50 hover:bg-slate-900 text-left transition-all group">
            <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all mb-4">
              <tab.icon className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-white mb-2">{tab.name}</h4>
            <p className="text-slate-500 text-xs font-medium">{tab.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SettingsModule;