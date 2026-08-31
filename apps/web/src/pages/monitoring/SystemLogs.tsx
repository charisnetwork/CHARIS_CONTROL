import { DataTable, type ColumnDef } from '../../components/DataTable';
import { Activity } from 'lucide-react';

interface Log {
  id: string;
  productName: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  createdAt: string;
}

export function SystemLogs() {
  const mockLogs: Log[] = [
    { id: '1', productName: 'Bill Easy', endpoint: '/api/v1/invoices', method: 'POST', statusCode: 201, responseTime: 120, createdAt: new Date().toISOString() },
    { id: '2', productName: 'BuildTrack Civil', endpoint: '/api/v1/projects', method: 'GET', statusCode: 200, responseTime: 85, createdAt: new Date().toISOString() },
    { id: '3', productName: 'Bill Easy', endpoint: '/health', method: 'GET', statusCode: 500, responseTime: 5000, createdAt: new Date().toISOString() },
  ];

  const columns: ColumnDef<Log>[] = [
    {
      key: 'productName',
      label: 'Service',
      render: (row) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center text-pink-400">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-medium">{row.productName}</span>
        </div>
      )
    },
    {
      key: 'method',
      label: 'Endpoint',
      render: (row) => (
        <div>
          <span className="font-mono text-xs font-bold text-gray-400 mr-2">{row.method}</span>
          <span className="font-mono text-sm">{row.endpoint}</span>
        </div>
      )
    },
    {
      key: 'statusCode',
      label: 'Status',
      render: (row) => (
        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
          row.statusCode >= 400 
            ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        }`}>
          {row.statusCode}
        </span>
      )
    },
    {
      key: 'responseTime',
      label: 'Latency',
      render: (row) => <span className={row.responseTime > 1000 ? 'text-red-400' : 'text-gray-300'}>{row.responseTime}ms</span>
    }
  ];

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-2xl font-semibold text-white tracking-tight">API Monitoring</h2>
        <p className="text-gray-400 text-sm mt-1">Real-time health and API logs across all registered products.</p>
      </div>
      <DataTable columns={columns} data={mockLogs} pageSize={10} />
    </div>
  );
}
