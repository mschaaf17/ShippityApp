import { useState, useEffect } from 'react';
import axios from 'axios';

function Dashboard() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch health status
      const healthRes = await axios.get('/api/health');
      setHealth(healthRes.data);

      // Fetch stats
      const statsRes = await axios.get('/api/stats');
      setStats(statsRes.data);

      // Fetch recent activity
      const activityRes = await axios.get('/api/activity/recent');
      setRecentActivity(activityRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'healthy' || status === 'connected') return 'text-green-600 bg-green-100';
    if (status === 'warning') return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getStatusIcon = (status) => {
    if (status === 'healthy' || status === 'connected') return '✅';
    if (status === 'warning') return '⚠️';
    return '❌';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Super Dispatch Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Super Dispatch</h3>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(health?.superDispatch?.status || 'unknown')}`}>
              {getStatusIcon(health?.superDispatch?.status || 'unknown')} {health?.superDispatch?.status || 'Unknown'}
            </span>
          </div>
          {health?.superDispatch?.lastWebhook && (
            <p className="text-xs text-gray-500">
              Last webhook: {new Date(health.superDispatch.lastWebhook).toLocaleTimeString()}
            </p>
          )}
          {health?.superDispatch?.error && (
            <p className="text-xs text-red-500 mt-1">{health.superDispatch.error}</p>
          )}
        </div>

        {/* Twilio Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Twilio SMS</h3>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(health?.twilio?.status || 'unknown')}`}>
              {getStatusIcon(health?.twilio?.status || 'unknown')} {health?.twilio?.status || 'Unknown'}
            </span>
          </div>
          {stats?.sms && (
            <p className="text-xs text-gray-500">
              Today: {stats.sms.sent} sent, {stats.sms.received} received
            </p>
          )}
        </div>

        {/* OpenAI Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">AI Assistant</h3>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(health?.openai?.status || 'unknown')}`}>
              {getStatusIcon(health?.openai?.status || 'unknown')} {health?.openai?.status || 'Unknown'}
            </span>
          </div>
          {stats?.ai && (
            <p className="text-xs text-gray-500">
              Today: {stats.ai.messagesProcessed} messages
            </p>
          )}
        </div>

        {/* Database Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Database</h3>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(health?.database?.status || 'unknown')}`}>
              {getStatusIcon(health?.database?.status || 'unknown')} {health?.database?.status || 'Unknown'}
            </span>
          </div>
          {stats?.database && (
            <p className="text-xs text-gray-500">
              {stats.database.totalLoads} loads, {stats.database.activeLoads} active
            </p>
          )}
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Loads Today</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.loads.today}</p>
            <p className="text-sm text-gray-500 mt-1">{stats.loads.thisWeek} this week</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">SMS Sent Today</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.sms.sent}</p>
            <p className="text-sm text-gray-500 mt-1">~${(stats.sms.sent * 0.0075).toFixed(2)} cost</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">AI Messages</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.ai.messagesProcessed}</p>
            <p className="text-sm text-gray-500 mt-1">~${(stats.ai.messagesProcessed * 0.002).toFixed(2)} cost</p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="p-6">
          {recentActivity.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                    activity.type === 'webhook' ? 'bg-blue-500' :
                    activity.type === 'sms' ? 'bg-green-500' :
                    activity.type === 'error' ? 'bg-red-500' : 'bg-gray-500'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500">{new Date(activity.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts/Warnings */}
      {health?.alerts && health.alerts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Alerts</h3>
          <ul className="space-y-1">
            {health.alerts.map((alert, idx) => (
              <li key={idx} className="text-sm text-yellow-700">{alert}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

