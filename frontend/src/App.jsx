import { useState } from 'react'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchLoads = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/loads')
      const data = await response.json()
      setLoads(data.data || [])
    } catch (error) {
      console.error('Error fetching loads:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'DISPATCHED': 'bg-blue-100 text-blue-800',
      'IN_TRANSIT': 'bg-purple-100 text-purple-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-gray-100 text-gray-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const [view, setView] = useState('dashboard'); // 'dashboard' or 'loads'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Shippity</h1>
          <p className="text-gray-600 mt-2">Auto Transport Broker Dashboard</p>
        </div>

        {/* Navigation */}
        <div className="mb-6 flex space-x-4">
          <button
            onClick={() => setView('dashboard')}
            className={`px-4 py-2 rounded-lg ${
              view === 'dashboard' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            System Dashboard
          </button>
          <button
            onClick={() => setView('loads')}
            className={`px-4 py-2 rounded-lg ${
              view === 'loads' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Loads
          </button>
        </div>

        {/* Dashboard View */}
        {view === 'dashboard' && <Dashboard />}

        {/* Loads View */}
        {view === 'loads' && (
          <>
        <div className="mb-6">
          <button
            onClick={fetchLoads}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh Loads'}
          </button>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Active Loads</h2>
          </div>
          
          {loads.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500">No loads found. Check your database connection.</p>
            </div>
          )}

          {loads.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vehicle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loads.map((load) => (
                    <tr key={load.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {load.order_id || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {load.vehicle_year} {load.vehicle_make} {load.vehicle_model}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {load.customer_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(load.status)}`}>
                          {load.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(load.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">🚀 Getting Started</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✅ Backend server running on port 3000</li>
            <li>✅ Database connection configured</li>
            <li>🔄 Next: Connect Super Dispatch webhook</li>
            <li>🔄 Next: Setup Twilio for SMS</li>
          </ul>
        </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App

