import { DataTable, type ColumnDef } from '../../components/DataTable';
import { Users } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
}

export function CustomersList() {
  const mockCustomers: Customer[] = [
    { id: '1', name: 'Acme Corp', email: 'admin@acme.com', status: 'ACTIVE', createdAt: new Date().toISOString() },
    { id: '2', name: 'Global Tech', email: 'billing@global.com', status: 'ACTIVE', createdAt: new Date().toISOString() },
  ];

  const columns: ColumnDef<Customer>[] = [
    {
      key: 'name',
      label: 'Customer',
      render: (row) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="text-xs text-gray-500">{row.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {row.status}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white tracking-tight">Customers</h2>
          <p className="text-gray-400 text-sm mt-1">Aggregated view of customers across all SaaS products.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg hover:border-primary transition-colors text-white text-sm font-medium">
          Filter by Product
        </button>
      </div>
      <DataTable columns={columns} data={mockCustomers} pageSize={10} />
    </div>
  );
}
