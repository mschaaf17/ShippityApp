import { useState, useEffect } from 'react';

function ApiDocs() {
  const [apiInfo, setApiInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');
  const [copiedCode, setCopiedCode] = useState(null);
  
  // Company name selector - defaults to "Partner" or saved value
  const [companyName, setCompanyName] = useState(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      return localStorage.getItem('apiDocs_companyName') || 'Partner';
    }
    return 'Partner';
  });
  
  // Common company presets
  const companyPresets = ['Partner', 'Kingbee', 'Custom'];

  useEffect(() => {
    // Fetch API info from backend endpoint
    fetch('/api/docs')
      .then(res => res.json())
      .then(data => {
        setApiInfo(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching API info:', err);
        setLoading(false);
      });
  }, []);
  
  // Save company name to localStorage when changed
  useEffect(() => {
    if (typeof window !== 'undefined' && companyName) {
      localStorage.setItem('apiDocs_companyName', companyName);
    }
  }, [companyName]);
  
  // Helper function to capitalize first letter of company name for display
  const capitalizeCompanyName = (name) => {
    if (!name || typeof name !== 'string') return name;
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };
  
  // Helper function to replace generic text with company name
  const replaceCompanyName = (text) => {
    if (!text || typeof text !== 'string') return text;
    // Capitalize first letter of company name for display
    const capitalizedName = capitalizeCompanyName(companyName);
    return text
      .replace(/Partner/g, capitalizedName)
      .replace(/partner/g, capitalizedName) // Use capitalized version for lowercase "partner" too
      .replace(/PARTNER/g, companyName.toUpperCase())
      .replace(/kingbee/gi, capitalizedName) // Use capitalized version
      .replace(/Kingbee/g, capitalizedName);
  };
  
  // Helper function for navigation button text (capitalized first letter)
  const getCompanyNameForNav = () => {
    return capitalizeCompanyName(companyName);
  };
  
  // Helper function to replace kingbee/partner in URLs for display
  // NOTE: URLs remain lowercase to match actual API endpoints
  const replaceUrlCompanyName = (url) => {
    if (!url || typeof url !== 'string') return url;
    // Replace /kingbee/ or /partner/ in paths (lowercase for URLs)
    let result = url.replace(/\/kingbee\//gi, `/${companyName.toLowerCase()}/`);
    result = result.replace(/\/partner\//gi, `/${companyName.toLowerCase()}/`);
    // Replace -kingbee or -partner in paths (keep lowercase for actual API endpoints)
    result = result.replace(/-kingbee/gi, `-${companyName.toLowerCase()}`);
    result = result.replace(/-partner/gi, `-${companyName.toLowerCase()}`);
    return result;
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading API documentation...</p>
        </div>
      </div>
    );
  }

  if (!apiInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error loading API documentation</p>
        </div>
      </div>
    );
  }

  const baseUrl = apiInfo.base_url || window.location.origin;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <h1 className="text-4xl font-bold text-white">Shipity Logistics API</h1>
              <p className="text-blue-200 mt-1 text-lg">Auto Transport Broker API Documentation</p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              {/* Company Name Selector */}
              <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 rounded-lg border-2 border-blue-500 shadow-lg ring-2 ring-blue-400/50">
                <label htmlFor="company-name" className="text-sm font-semibold text-white whitespace-nowrap">
                  Company:
                </label>
                <select
                  id="company-name"
                  value={companyPresets.includes(companyName) ? companyName : 'Custom'}
                  onChange={(e) => {
                    if (e.target.value === 'Custom') {
                      // Show input for custom name
                      setCompanyName('');
                    } else {
                      setCompanyName(e.target.value);
                    }
                  }}
                  className="px-3 py-1.5 border-2 border-white/30 rounded-lg text-sm font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-white min-w-[120px] shadow-md hover:bg-blue-50 hover:border-white transition-all cursor-pointer"
                >
                  {companyPresets.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
                {(!companyPresets.includes(companyName) || companyName === '') ? (
                  <input
                    type="text"
                    placeholder="Enter company name"
                    value={companyName || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      setCompanyName(value || 'Partner');
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        setCompanyName('Partner');
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="px-3 py-1.5 border-2 border-white/30 rounded-lg text-sm font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-white min-w-[150px] shadow-md hover:bg-blue-50 hover:border-white transition-all"
                    autoFocus={companyName === ''}
                  />
                ) : null}
              </div>
              <div className="text-right">
                <div className="text-sm text-blue-200">Version</div>
                <div className="text-lg font-semibold text-white">{apiInfo.version}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md border border-slate-200 p-4 sticky top-8">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveSection('overview')}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all font-medium ${
                    activeSection === 'overview'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveSection('kingbee')}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all font-medium ${
                    activeSection === 'kingbee'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {getCompanyNameForNav()} Integration
                </button>
                <button
                  onClick={() => setActiveSection('webhooks')}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all font-medium ${
                    activeSection === 'webhooks'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  Webhooks
                </button>
                <button
                  onClick={() => setActiveSection('api-calls')}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all font-medium ${
                    activeSection === 'api-calls'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  API Calls Reference
                </button>
                <button
                  onClick={() => setActiveSection('examples')}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all font-medium ${
                    activeSection === 'examples'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  Quick Start
                </button>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Overview Section */}
            {activeSection === 'overview' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-4">API Overview</h2>
                  <p className="text-slate-600 mb-6">{apiInfo.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="text-sm font-semibold text-slate-500 mb-1">Base URL</div>
                      <div className="text-lg font-mono text-slate-900 break-all">{baseUrl}</div>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="text-sm font-semibold text-slate-500 mb-1">Version</div>
                      <div className="text-lg font-semibold text-slate-900">{apiInfo.version}</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Authentication</h3>
                    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 mb-4">
                      <p className="text-sm font-semibold text-blue-900 mb-2">🔐 API Key Required for Order Submission</p>
                      <p className="text-sm text-blue-800 mb-2">
                        The <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono">POST /api/kingbee/orders</code> endpoint requires API key authentication.
                      </p>
                      <p className="text-xs text-blue-700 mb-2">
                        Provide your API key using one of these headers:
                      </p>
                      <div className="space-y-2">
                        <div className="bg-white rounded border border-blue-200 p-2">
                          <code className="text-xs text-blue-900">X-API-Key: your-api-key-here</code>
                        </div>
                        <div className="bg-white rounded border border-blue-200 p-2">
                          <code className="text-xs text-blue-900">Authorization: Bearer your-api-key-here</code>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 italic mt-3">
                        Contact us to receive your API key. It will be sent separately for security.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Quick Health Check</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <code className="text-sm text-slate-800 font-mono">GET {baseUrl}/health</code>
                        <button
                          onClick={() => copyToClipboard(`curl ${baseUrl}/health`, 'health')}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md"
                        >
                          {copiedCode === 'health' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                  <h3 className="text-xl font-semibold text-slate-900 mb-4">Available Endpoints</h3>
                  <div className="space-y-3">
                    {apiInfo.documentation?.health_check && (
                      <div className="border-l-4 border-green-500 pl-4 py-2 bg-green-50 rounded-r-lg">
                        <div className="font-semibold text-slate-900">{apiInfo.documentation.health_check.method} {apiInfo.documentation.health_check.endpoint}</div>
                        <div className="text-sm text-slate-600">{apiInfo.documentation.health_check.description}</div>
                      </div>
                    )}
                    {apiInfo.documentation?.partner_integration && (
                      <div className="border-l-4 border-blue-600 pl-4 py-2 bg-blue-50 rounded-r-lg">
                        <div className="font-semibold text-slate-900">{replaceCompanyName('Partner Integration')} Endpoints</div>
                        <div className="text-sm text-slate-600">See {replaceCompanyName('Partner Integration')} section for details</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Partner Integration Section */}
            {activeSection === 'kingbee' && apiInfo.documentation?.partner_integration && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">{getCompanyNameForNav()} Integration API</h2>
                  <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full mb-6"></div>
                  
                  {/* Authentication */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Authentication</h3>
                    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 mb-4">
                      <p className="text-sm font-semibold text-blue-900 mb-2">🔐 API Key Required</p>
                      <p className="text-sm text-blue-800 mb-3">
                        The order submission endpoint requires API key authentication. Provide your API key in one of two ways:
                      </p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-white rounded border border-blue-200 p-2">
                          <code className="text-xs text-blue-900">X-API-Key: your-api-key-here</code>
                        </div>
                        <div className="bg-white rounded border border-blue-200 p-2">
                          <code className="text-xs text-blue-900">Authorization: Bearer your-api-key-here</code>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 italic">
                        Contact us to receive your API key. It will be sent separately for security.
                      </p>
                    </div>
                  </div>
                  
                  {/* Submit Order */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Submit Order</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <code className="text-sm font-semibold text-blue-600">
                            POST {baseUrl}{replaceUrlCompanyName(apiInfo.documentation.partner_integration.endpoints.submit_order.url)}
                          </code>
                          
                        </div>
                        <button
                          onClick={() => copyToClipboard(
                            `curl -X POST ${baseUrl}${apiInfo.documentation.partner_integration.endpoints.submit_order.url} \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: your-api-key-here" \\\n  -d '${JSON.stringify(apiInfo.documentation.partner_integration.endpoints.submit_order.example_request, null, 2).replace(/KB-12345/g, `${companyName.substring(0, 3).toUpperCase()}-12345`).replace(/kingbee/gi, companyName.toLowerCase())}'`,
                            'submit-order'
                          )}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md ml-4"
                        >
                          {copiedCode === 'submit-order' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">
                        {replaceCompanyName(apiInfo.documentation.partner_integration.endpoints.submit_order.description)}
                      </p>
                      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg border border-slate-700 overflow-x-auto text-xs">
                        {JSON.stringify(apiInfo.documentation.partner_integration.endpoints.submit_order.example_request, null, 2).replace(/KB-12345/g, `${companyName.substring(0, 3).toUpperCase()}-12345`).replace(/kingbee/gi, companyName.toLowerCase())}
                      </pre>
                    </div>
                  </div>

                  {/* Configure Webhook */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Configure Webhook</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <code className="text-sm font-semibold text-blue-700 font-mono">
                            POST {baseUrl}{replaceUrlCompanyName(apiInfo.documentation.partner_integration.endpoints.configure_webhook.url)}
                          </code>
                        
                        </div>
                        <button
                          onClick={() => copyToClipboard(
                            `curl -X POST ${baseUrl}${apiInfo.documentation.partner_integration.endpoints.configure_webhook.url} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(apiInfo.documentation.partner_integration.endpoints.configure_webhook.example_request, null, 2).replace(/kingbee/gi, companyName.toLowerCase())}'`,
                            'webhook-config'
                          )}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md ml-4"
                        >
                          {copiedCode === 'webhook-config' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">
                        {replaceCompanyName(apiInfo.documentation.partner_integration.endpoints.configure_webhook.description)}
                      </p>
                      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg border border-slate-700 overflow-x-auto text-xs">
                        {JSON.stringify(apiInfo.documentation.partner_integration.endpoints.configure_webhook.example_request, null, 2)
                          .replace(/kingbee/gi, companyName.toLowerCase())
                          .replace(/partner/gi, companyName.toLowerCase())}
                      </pre>
                    </div>
                  </div>

                  {/* Webhook Payload Format */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Webhook Payload Format</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <p className="text-sm text-slate-600 mb-3">
                        This is the JSON payload sent to your webhook URL when order status changes:
                      </p>
                      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg border border-slate-700 overflow-x-auto text-xs">
                        {JSON.stringify(apiInfo.documentation.partner_integration.webhook_payload_format, null, 2).replace(/KB-12345/g, `${companyName.substring(0, 3).toUpperCase()}-12345`).replace(/PARTNER-12345/g, `${companyName.substring(0, 3).toUpperCase()}-12345`)}
                      </pre>
                    </div>
                  </div>

                  {/* Status Mapping */}
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Status Mapping</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <p className="text-sm text-slate-600 mb-3">
                        Super Dispatch statuses are mapped to {replaceCompanyName('partner')} format:
                      </p>
                      <div className="space-y-2">
                        {Object.entries(apiInfo.documentation.partner_integration.status_mapping).map(([partnerStatus, superDispatchStatuses]) => (
                          <div key={partnerStatus} className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                            <div className="font-semibold text-slate-900 mb-1">
                              <span className="inline-block px-3 py-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md text-sm mr-2 font-medium shadow-sm">
                                {partnerStatus}
                              </span>
                            </div>
                            <div className="text-sm text-slate-600">
                              Maps from: {superDispatchStatuses.join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Webhooks Section */}
            {activeSection === 'webhooks' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Webhooks</h2>
                  <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full mb-6"></div>
                  
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Receiving Webhooks</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <p className="text-sm text-slate-600 mb-4">
                        Configure your webhook URL to receive real-time order status updates:
                      </p>
                      <div className="space-y-4">
                        <div>
                          <div className="font-semibold text-slate-900 mb-2">1. Set up your webhook endpoint</div>
                          <p className="text-sm text-slate-600 mb-2">
                            Create an endpoint that accepts POST requests and returns 200 OK:
                          </p>
                          <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg border border-slate-700 text-xs">
{`POST https://your-domain.com/webhooks/${companyName.toLowerCase()}
Content-Type: application/json

{
  "order_id": "K112025FL1",
  "status": "picked_up",
  "reference_id": "${companyName.toUpperCase().substring(0, 3)}-12345",
  ...
}`}
                          </pre>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 mb-2">2. Configure webhook URL in Shipity</div>
                          <p className="text-sm text-slate-600 mb-2">
                            Use the Configure Webhook endpoint to register your URL:
                          </p>
                          <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg border border-slate-700 text-xs">
{`POST ${baseUrl}/api/${companyName.toLowerCase()}/webhook-config
Content-Type: application/json

{
  "webhook_url": "https://your-domain.com/webhooks/${companyName.toLowerCase()}",
  "secret_token": "optional-secret-for-security"
}`}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Manual Orders Setup</h3>
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                      <p className="text-sm text-slate-700 mb-4">
                        For orders created manually in Super Dispatch (not via API), you need to add a <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono">lot_number</code> to enable webhooks:
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <div className="font-semibold text-slate-900 mb-2">Option 1: Add `lot_number` in Super Dispatch (Recommended)</div>
                          <ol className="list-decimal list-inside text-sm text-slate-700 space-y-2 ml-2">
                            <li>Open the order in Super Dispatch UI</li>
                            <li>Edit the vehicle information</li>
                            <li>Add <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono">lot_number</code> field with your reference ID (e.g., "{companyName.toUpperCase().substring(0, 3)}-12345")</li>
                            <li>Save the order</li>
                          </ol>
                          <p className="text-xs text-slate-600 mt-2 italic">
                            When Super Dispatch sends status updates, the <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">lot_number</code> automatically becomes the <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">reference_id</code> in webhooks sent to {replaceCompanyName('partner')}.
                          </p>
                        </div>

                        <div>
                          <div className="font-semibold text-slate-900 mb-2">Option 2: Add `reference_id` via API</div>
                          <p className="text-sm text-slate-700 mb-2">
                            If the order is already created, you can add a <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono">reference_id</code> using:
                          </p>
                          <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg border border-slate-700 text-xs mt-2">
{`PUT ${baseUrl}/api/${companyName.toLowerCase()}/loads/:orderId/reference-id
Content-Type: application/json

{
  "reference_id": "${companyName.toUpperCase().substring(0, 3)}-12345"
}`}
                          </pre>
                          <p className="text-xs text-slate-600 mt-2 italic">
                            Once <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">reference_id</code> is set, webhooks will be sent automatically for all future status updates.
                          </p>
                        </div>

                        <div className="bg-blue-100 border-l-4 border-blue-500 p-3 rounded-r">
                          <p className="text-sm font-semibold text-blue-900 mb-1">💡 Important:</p>
                          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                            <li>Webhooks are only sent for orders that have a <code className="bg-blue-200 px-1 py-0.5 rounded font-mono">reference_id</code></li>
                            <li>Orders created via API automatically get webhooks (from <code className="bg-blue-200 px-1 py-0.5 rounded font-mono">issue_number</code>)</li>
                            <li>Manual orders need <code className="bg-blue-200 px-1 py-0.5 rounded font-mono">lot_number</code> (Option 1) or <code className="bg-blue-200 px-1 py-0.5 rounded font-mono">reference_id</code> (Option 2) to enable webhooks</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Super Dispatch Webhooks</h3>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <p className="text-sm text-slate-600 mb-2">
                        Super Dispatch sends webhooks to Shipity at:
                      </p>
                      <code className="text-sm text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 font-mono">
                        POST {baseUrl}/api/webhooks/superdispatch
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API Calls Reference Section */}
            {activeSection === 'api-calls' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">API Calls Reference</h2>
                  <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full mb-6"></div>
                  <p className="text-slate-600 mb-6">
                    Quick reference for all API calls you can use for testing and managing orders, webhooks, and manual orders.
                  </p>

                  {/* Health & Status Checks */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">Health & Status Checks</h3>
                    <div className="space-y-3">
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-blue-600">GET {baseUrl}/health</code>
                          <button
                            onClick={() => copyToClipboard(`curl ${baseUrl}/health`, 'health-check')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all"
                          >
                            {copiedCode === 'health-check' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">Basic health check</p>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-blue-600">GET {baseUrl}/api/health</code>
                          <button
                            onClick={() => copyToClipboard(`curl ${baseUrl}/api/health`, 'api-health')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all"
                          >
                            {copiedCode === 'api-health' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">Comprehensive health check (database, Super Dispatch, Twilio, OpenAI)</p>
                      </div>
                    </div>
                  </div>

                  {/* Webhook Configuration */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">Webhook Configuration</h3>
                    <div className="space-y-3">
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">GET {baseUrl}{replaceUrlCompanyName('/api/kingbee/webhook-config')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl ${baseUrl}/api/kingbee/webhook-config`, 'get-webhook-config')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'get-webhook-config' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">Get current webhook configuration</p>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">POST {baseUrl}{replaceUrlCompanyName('/api/kingbee/webhook-config')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl -X POST ${baseUrl}/api/kingbee/webhook-config \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "webhook_url": "https://your-domain.com/webhooks/${companyName.toLowerCase()}",\n    "secret_token": "optional-secret"\n  }'`, 'set-webhook-config')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'set-webhook-config' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mb-2 mt-2">Configure webhook URL</p>
                        <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs mt-2 overflow-x-auto">
{`{
  "webhook_url": "https://your-domain.com/webhooks/${companyName.toLowerCase()}",
  "secret_token": "optional-secret"
}`}
                        </pre>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">GET {baseUrl}{replaceUrlCompanyName('/api/kingbee/webhook-deliveries')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl "${baseUrl}/api/kingbee/webhook-deliveries?limit=10"`, 'webhook-deliveries')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'webhook-deliveries' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">View webhook delivery logs (add ?limit=10 or ?status=SUCCESS)</p>
                      </div>
                    </div>
                  </div>

                  {/* Manual Orders Setup */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">Manual Orders Setup</h3>
                    <div className="space-y-3">
                      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">PUT {baseUrl}{replaceUrlCompanyName('/api/kingbee/loads/:orderId/reference-id')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl -X PUT "${baseUrl}/api/kingbee/loads/KTESTFL/reference-id" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "reference_id": "${companyName.toUpperCase().substring(0, 3)}-12345"\n  }'`, 'set-reference-id')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'set-reference-id' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 mb-2 mt-2">Add/update reference_id for a manually created order (enables webhooks)</p>
                        <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs mt-2 overflow-x-auto">
{`{
  "reference_id": "${companyName.toUpperCase().substring(0, 3)}-12345"
}`}
                        </pre>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-blue-600">POST {baseUrl}/api/loads/superdispatch/sync/:guid</code>
                          <button
                            onClick={() => copyToClipboard(`curl -X POST "${baseUrl}/api/loads/superdispatch/sync/219e7b23-2627-43fc-8f9b-e2e7d0bcf271"`, 'sync-order')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all"
                          >
                            {copiedCode === 'sync-order' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">Sync order from Super Dispatch by GUID (use GUID from Super Dispatch URL)</p>
                      </div>
                    </div>
                  </div>

                  {/* Testing & Debugging */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">Testing & Debugging</h3>
                    <div className="space-y-3">
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">GET {baseUrl}{replaceUrlCompanyName('/api/loads/:orderId/preview-kingbee')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl "${baseUrl}/api/loads/KTESTFL/preview-kingbee"`, 'preview-webhook')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'preview-webhook' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">Preview what would be sent to {replaceCompanyName('partner')} via webhook for this order</p>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">POST {baseUrl}{replaceUrlCompanyName('/api/kingbee/loads/:orderId/send-webhook')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl -X POST "${baseUrl}/api/kingbee/loads/KTESTFL/send-webhook"`, 'manual-webhook')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'manual-webhook' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">Manually trigger webhook (uses database data)</p>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">POST {baseUrl}{replaceUrlCompanyName('/api/kingbee/loads/:orderId/send-webhook?sync=true&guid=GUID')}</code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`curl -X POST "${baseUrl}/api/kingbee/loads/KTESTFL/send-webhook?sync=true&guid=219e7b23-2627-43fc-8f9b-e2e7d0bcf271"`, 'sync-webhook')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'sync-webhook' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">Manually trigger webhook after syncing latest data from Super Dispatch</p>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-blue-600">GET {baseUrl}/api/loads/:orderId</code>
                          <button
                            onClick={() => copyToClipboard(`curl "${baseUrl}/api/loads/KTESTFL"`, 'get-load')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all"
                          >
                            {copiedCode === 'get-load' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">Get order details by order_id or UUID</p>
                      </div>
                    </div>
                  </div>

                  {/* Order Management */}
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">Order Management</h3>
                    <div className="space-y-3">
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex-1">
                            <code className="text-sm font-semibold text-blue-600 block mb-1">POST {baseUrl}{replaceUrlCompanyName('/api/kingbee/orders')}</code>
                          </div>
                          <button
                            onClick={() => {
                              const prefix = companyName.toUpperCase().substring(0, 3);
                              copyToClipboard(`curl -X POST ${baseUrl}/api/kingbee/orders \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: your-api-key-here" \\\n  -d '{\n    "vehicles": [{"vin": "1FTBR1C82MKA69174", "issue_number": "${prefix}-12345"}],\n    "pickup": {"address": "123 Main St, City, ST 12345", "pickup_notes": "Optional"},\n    "delivery": {"address": "456 Oak Ave, City, ST 12345", "delivery_notes": "Optional"}\n  }'`, 'submit-order');
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all whitespace-nowrap"
                          >
                            {copiedCode === 'submit-order' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mb-2 mt-2">
                          Submit order(s) from {replaceCompanyName('partner')} (creates in Super Dispatch automatically)
                          <span className="text-blue-600 font-semibold block mt-1">⚠️ Requires API key authentication</span>
                        </p>
                        <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs mt-2 overflow-x-auto">
{`{
  "vehicles": [{
    "vin": "1FTBR1C82MKA69174",
    "issue_number": "${companyName.toUpperCase().substring(0, 3)}-12345"
  }],
  "pickup": {
    "address": "123 Main St, City, ST 12345",
    "pickup_notes": "Optional"
  },
  "delivery": {
    "address": "456 Oak Ave, City, ST 12345",
    "delivery_notes": "Optional"
  }
}`}
                        </pre>
                        <p className="text-xs text-blue-600 mt-2 italic">
                          💡 Don't forget to include the <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">X-API-Key</code> header when copying the curl command above.
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-blue-600">GET {baseUrl}/api/loads</code>
                          <button
                            onClick={() => copyToClipboard(`curl "${baseUrl}/api/loads?limit=10"`, 'list-loads')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all"
                          >
                            {copiedCode === 'list-loads' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">List all orders (add ?status=NEW or ?limit=10 for filtering)</p>
                      </div>
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r">
                    <p className="text-sm font-semibold text-blue-900 mb-2">💡 Tips:</p>
                    <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                      <li>Replace <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">:orderId</code> with actual order ID (e.g., "KTESTFL")</li>
                      <li>Replace <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">GUID</code> with Super Dispatch GUID from URL</li>
                      <li>Add <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">| python3 -m json.tool</code> for formatted JSON output</li>
                      <li>For production: Replace <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">{baseUrl}</code> with your actual domain</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Start Section */}
            {activeSection === 'examples' && apiInfo.quick_start && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Quick Start Guide</h2>
                  <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full mb-6"></div>
                  
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">{replaceCompanyName('Partner')} Setup (4 Steps)</h3>
                    <div className="space-y-4">
                      {apiInfo.quick_start.partner_setup.map((step, index) => (
                        <div key={index} className="flex items-start space-x-4">
                          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-full flex items-center justify-center font-semibold shadow-md">
                            {index + 1}
                          </div>
                          <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-4">
                            <p className="text-slate-800">{replaceUrlCompanyName(replaceCompanyName(step))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-4">Testing</h3>
                    <div className="space-y-4">
                      {apiInfo.quick_start.testing.map((step, index) => (
                        <div key={index} className="flex items-start space-x-4">
                          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-600 to-green-700 text-white rounded-full flex items-center justify-center font-semibold shadow-md">
                            {index + 1}
                          </div>
                          <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-4">
                            <p className="text-slate-800">{replaceUrlCompanyName(replaceCompanyName(step))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-6 shadow-md">
                  <h3 className="text-lg font-semibold text-blue-900 mb-3">📚 Full Documentation</h3>
                  <p className="text-blue-800 text-sm mb-3">
                    For complete API documentation, examples, and integration guides, contact support for {replaceCompanyName('partner')}-specific documentation.
                  </p>
                  <div className="flex items-center space-x-2 text-sm text-blue-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Base URL: <code className="bg-blue-200 px-2 py-1 rounded border border-blue-300 font-mono">{baseUrl}</code></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-slate-800 to-slate-900 border-t border-slate-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-slate-300">
            <p className="text-white font-medium">Shipity Logistics API v{apiInfo.version} • Auto Transport Broker Platform</p>
            <p className="mt-1">Documentation generated automatically from API</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ApiDocs;

