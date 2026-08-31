import React from "react";
import { useProductStore } from "../../store/productStore";
import { FileText, Download, Calendar, Filter, PieChart } from 'lucide-react';

const ReportsModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();

  const reports = [
    { id: '1', name: 'Customer Report', description: 'Export complete customer lists and registration data.', icon: FileText },
    { id: '2', name: 'Subscription Report', description: 'Analyze active, expired, and suspended subscriptions.', icon: PieChart },
    { id: '3', name: 'Revenue Report', description: 'Financial statements, GST collection, and total MRR.', icon: FileText },
    { id: '4', name: 'Affiliate Report', description: 'Partner performance and commission statements.', icon: PieChart },
    { id: '5', name: 'Marketing Report', description: 'Ad campaign ROI and lead conversion metrics.', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-white">Business Reports</h3>
          <p className="text-slate-500 text-sm mt-1">Generate and export analytics for {isAllApplications ? 'all platform applications' : selectedProduct?.displayName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map(r => (
          <div key={r.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl hover:border-indigo-500/50 transition-all flex flex-col group">
            <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
              <r.icon className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-white mb-2">{r.name}</h4>
            <p className="text-slate-500 text-xs font-medium mb-6 flex-1">{r.description}</p>
            
            <div className="flex items-center gap-2 mb-4">
               <div className="flex bg-slate-950 p-1 rounded-xl flex-1">
                 <button className="flex-1 px-2 py-1 text-[10px] font-black uppercase text-indigo-400 bg-indigo-500/10 rounded-lg">Month</button>
                 <button className="flex-1 px-2 py-1 text-[10px] font-black uppercase text-slate-500 hover:text-white">Quarter</button>
                 <button className="flex-1 px-2 py-1 text-[10px] font-black uppercase text-slate-500 hover:text-white">Year</button>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <button className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all">
                <Download className="w-3 h-3" /> EXCEL
              </button>
              <button className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all">
                <Download className="w-3 h-3" /> PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportsModule;