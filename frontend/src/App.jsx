import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import ApiDocs from './components/ApiDocs'
import './App.css'

// Dashboard Component (original loads view)
function LoadsView() {
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
      // 'IN_TRANSIT': 'bg-purple-100 text-purple-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-gray-100 text-gray-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Shipity Dashboard</h1>
          <p className="text-gray-600 mt-2">Auto Transport Broker Dashboard</p>
        </div>

        <div className="mb-6 flex space-x-4">
          <Link
            to="/dashboard"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            System Dashboard
          </Link>
          <Link
            to="/loads"
            className="px-4 py-2 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
          >
            Loads
          </Link>
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
          >
            API Docs
          </Link>
        </div>

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
      </div>
    </div>
  )
}

// Main App with Router
function App() {
  return (
    <Router>
      <Routes>
        {/* API Documentation at root */}
        <Route path="/" element={<ApiDocs />} />
        
        {/* Dashboard routes */}
        <Route path="/dashboard" element={
          <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="mb-6 flex space-x-4">
                <Link to="/" className="px-4 py-2 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
                  API Docs
                </Link>
                <Link to="/dashboard" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  System Dashboard
                </Link>
                <Link to="/loads" className="px-4 py-2 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
                  Loads
                </Link>
              </div>
              <Dashboard />
            </div>
          </div>
        } />
        
        {/* Loads view */}
        <Route path="/loads" element={<LoadsView />} />
      </Routes>
    </Router>
  )
}

export default App
