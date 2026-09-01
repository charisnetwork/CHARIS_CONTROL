import { useEffect, useState } from "react";
import { useProductStore } from "../../store/productStore";
import { fetchProductCustomers } from "../../services/productApi";
import { Download, Search, RefreshCw, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

const CustomersModule = () => {
  const { selectedProduct, isAllApplications } = useProductStore();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchProductCustomers(selectedProduct, isAllApplications);
      setCustomers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProduct, isAllApplications]);

  const handleExport = (type: 'csv' | 'xlsx') => {
    const ws = XLSX.utils.json_to_sheet(customers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `Customers_Export.${type}`);
  };

  const filtered = customers.filter(c => 
    c.company.toLowerCase().includes(search.toLowerCase()) || 
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, email, phone..." 
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white focus:border-indigo-500 outline-none transition-colors"
            />
          </div>
          <button className="bg-slate-900 border border-slate-800 hover:border-indigo-500 text-slate-300 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => handleExport('csv')}
            className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/20 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button 
            onClick={() => handleExport('xlsx')}
            className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" /> EXCEL
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center text-indigo-500 font-black items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" /> FETCHING CUSTOMERS...
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-950/50 text-slate-500 font-bold uppercase">
              <tr>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Plan & Status</th>
                {isAllApplications && <th className="px-6 py-4">Source Product</th>}
                <th className="px-6 py-4">Registered Date</th>
                <th className="px-6 py-4">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-800/20">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white text-sm">{c.company}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">{c.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-300 font-bold">{c.owner}</div>
                    <div className="text-slate-400">{c.email}</div>
                    <div className="text-indigo-400 font-medium">{c.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="mb-1">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase">
                        {c.plan}
                      </span>
                    </div>
                    <span className={`text-[10px] font-black uppercase ${
                      c.subscriptionStatus === 'Active' ? 'text-emerald-500' : 
                      c.subscriptionStatus === 'Expired' ? 'text-rose-500' : 'text-amber-500'
                    }`}>
                      {c.subscriptionStatus}
                    </span>
                  </td>
                  {isAllApplications && (
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {c.sourceProduct}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-4 text-slate-400">{new Date(c.registeredDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-slate-400">{new Date(c.lastLogin).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomersModule;