'use client';

import { useClientProfile, useClientInvoices, useClientPosts, useClientIncidents } from '../hooks/useClientData';
import { FileText, Users, AlertTriangle, IndianRupee } from 'lucide-react';

export default function ClientDashboard() {
  const { data: profile, isLoading: profileLoading } = useClientProfile();
  const { data: invoices, isLoading: invoicesLoading } = useClientInvoices(profile?.client_name);
  const { data: posts, isLoading: postsLoading } = useClientPosts(profile?.post_ids);
  const { data: incidents, isLoading: incidentsLoading } = useClientIncidents(profile?.id);

  const isLoading = profileLoading || invoicesLoading || postsLoading || incidentsLoading;

  const totalDue = invoices
    ?.filter((inv: any) => inv.status === 'pending' || inv.status === 'overdue')
    .reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0) || 0;

  const overdueCount = invoices?.filter((inv: any) => inv.status === 'overdue').length || 0;
  const activePosts = posts?.filter((p: any) => p.status === 'active').length || 0;
  const openIncidents = incidents?.filter((i: any) => i.status !== 'resolved' && i.status !== 'closed').length || 0;

  if (profileLoading || !profile) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Outstanding',
      value: `₹${totalDue.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
      subtitle: overdueCount > 0 ? `${overdueCount} overdue` : 'All current',
    },
    {
      label: 'Active Posts',
      value: activePosts.toString(),
      icon: Users,
      color: 'text-green-600 bg-green-50 dark:bg-green-900/20',
      subtitle: `${posts?.length || 0} total posts`,
    },
    {
      label: 'Invoices',
      value: (invoices?.length || 0).toString(),
      icon: FileText,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
      subtitle: `${invoices?.length || 0} total`,
    },
    {
      label: 'Open Incidents',
      value: openIncidents.toString(),
      icon: AlertTriangle,
      color: openIncidents > 0 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-gray-600 bg-gray-50 dark:bg-gray-800',
      subtitle: openIncidents > 0 ? 'Pending resolution' : 'None reported',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-foreground dark:text-white">
          Welcome, {profile?.contact_person}
        </h2>
        <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
          {profile?.company_name || profile?.client_name} · {profile?.email}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground dark:text-gray-400 uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-foreground dark:text-white mt-1">
                  {stat.value}
                </p>
                <p className="text-xs text-gray-400 mt-1">{stat.subtitle}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Invoices */}
      {invoices && invoices.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-foreground dark:text-white">Recent Invoices</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {invoices.slice(0, 5).map((inv: any) => (
              <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground dark:text-white">
                    {inv.reference_number || 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground">{inv.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground dark:text-white">
                    ₹{(inv.total_amount || 0).toLocaleString('en-IN')}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === 'received' ? 'bg-green-100 text-green-700' :
                    inv.status === 'overdue' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
