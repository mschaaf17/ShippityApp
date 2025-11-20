const axios = require('axios');
require('dotenv').config();

const SUPER_DISPATCH_CLIENT_ID = process.env.SUPER_DISPATCH_CLIENT_ID;
const SUPER_DISPATCH_CLIENT_SECRET = process.env.SUPER_DISPATCH_CLIENT_SECRET;
const API_BASE_URL = 'https://api.shipper.superdispatch.com';

/**
 * Super Dispatch API client with OAuth 2.0 authentication
 */
class SuperDispatchClient {
  constructor() {
    this.clientId = SUPER_DISPATCH_CLIENT_ID;
    this.clientSecret = SUPER_DISPATCH_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Debug: Log when credentials are loaded (hide secret for security)
    if (this.clientId && this.clientSecret) {
      console.log('🔑 Super Dispatch credentials loaded:', {
        clientId: this.clientId.substring(0, 8) + '...',
        hasSecret: !!this.clientSecret
      });
    } else {
      console.warn('⚠️ Super Dispatch credentials NOT found in environment variables');
    }
    
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get OAuth 2.0 access token
   */
  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      console.log('♻️  Using cached OAuth token (not expired yet)');
      return this.accessToken;
    }

    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error('Super Dispatch Client ID or Client Secret not configured');
      }

      console.log('🔐 Requesting OAuth token from Super Dispatch...', {
        usingClientId: this.clientId.substring(0, 8) + '...',
        endpoint: `${API_BASE_URL}/oauth/token`
      });

      const response = await axios.post(
        `${API_BASE_URL}/oauth/token?grant_type=client_credentials`,
        {},
        {
          auth: {
            username: this.clientId,      // ← CLIENT ID USED HERE
            password: this.clientSecret   // ← CLIENT SECRET USED HERE (Basic Auth)
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('✅ Super Dispatch OAuth token obtained');
      return this.accessToken;
      
    } catch (error) {
      console.error('❌ Error getting Super Dispatch OAuth token:', error.message);
      if (error.response) {
        console.error('OAuth token request failed:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      throw error;
    }
  }

  /**
   * Make authenticated request to Super Dispatch API
   */
  async makeRequest(method, endpoint, data = null, customHeaders = {}) {
    const token = await this.getAccessToken();  // ← Gets token using credentials
    
    try {
      const headers = {
        'Authorization': `Bearer ${token}`,  // ← TOKEN USED HERE (not credentials!)
        ...customHeaders
      };
      
      // Debug: Log API call (hide full token for security)
      console.log(`🌐 Making ${method} request to Super Dispatch:`, {
        endpoint,
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
      });
      
      // Only add Content-Type if not already set and we have data
      if (!customHeaders['Content-Type'] && data && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
      }
      
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
        headers
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Super Dispatch API error (${method} ${endpoint}):`, error.message);
      if (error.response) {
        console.error('API response details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.config?.url || `${this.client.defaults.baseURL}${endpoint}`
        });
        
        // Log validation details if present
        if (error.response.data?.data?.details) {
          console.error('🔍 Validation error details:', JSON.stringify(error.response.data.data.details, null, 2));
        }
        
        // Include full error details in thrown error
        const errorMsg = error.response.data?.message || 
                        error.response.data?.error || 
                        error.response.data?.data?.message ||
                        error.message;
        
        const apiError = new Error(errorMsg);
        apiError.status = error.response.status;
        apiError.responseData = error.response.data;
        // Include validation details in the error for easier debugging
        if (error.response.data?.data?.details) {
          apiError.validationDetails = error.response.data.data.details;
        }
        throw apiError;
      }
      throw error;
    }
  }

  /**
   * Get an order by GUID (Super Dispatch uses "orders" not "loads")
   */
  async getLoad(orderGuid) {
    try {
      return await this.makeRequest('GET', `/v1/public/orders/${orderGuid}`);
    } catch (error) {
      console.error('Error fetching order from Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Get all orders (with filters)
   * Super Dispatch API uses "/v1/public/orders" endpoint
   * See: https://developer.superdispatch.com/
   * 
   * Note: Super Dispatch API requires certain query parameters.
   * The 400 error "UnsatisfiedServletRequestParameterException" indicates
   * required parameters are missing. Try common pagination parameters.
   */
  async getAllLoads(params = {}) {
    try {
      let endpoint = '/v1/public/orders';
      
      // Super Dispatch API appears to require query parameters
      // Try common pagination parameters if not provided
      const queryParams = new URLSearchParams();
      
      // Add pagination if provided, otherwise use defaults
      if (params.limit !== undefined) {
        queryParams.append('limit', params.limit);
      } else {
        queryParams.append('limit', '10');  // Default limit
      }
      
      if (params.offset !== undefined) {
        queryParams.append('offset', params.offset);
      } else {
        queryParams.append('offset', '0');  // Default offset
      }
      
      // Add any other provided params
      Object.keys(params).forEach(key => {
        if (key !== 'limit' && key !== 'offset' && params[key] !== undefined) {
          queryParams.append(key, params[key]);
        }
      });
      
      endpoint = `${endpoint}?${queryParams.toString()}`;
      
      console.log(`📡 Calling Super Dispatch API: ${endpoint}`);
      
      return await this.makeRequest('GET', endpoint);
    } catch (error) {
      console.error('Error fetching orders from Super Dispatch:', error.message);
      if (error.response) {
        console.error('Super Dispatch API response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
        
        // If 400 error with parameter exception, suggest checking API docs
        if (error.response.status === 400 && error.response.data?.type?.includes('UnsatisfiedServletRequestParameterException')) {
          console.error('\n💡 TIP: Super Dispatch API requires specific query parameters.');
          console.error('   Check the API documentation for required parameters:');
          console.error('   https://developer.superdispatch.com/reference/');
        }
      }
      throw error;
    }
  }

  /**
   * Create an order in Super Dispatch
   * Super Dispatch API uses "/v1/public/orders" endpoint
   * See: https://developer.superdispatch.com/
   */
  async createLoad(orderData) {
    try {
      return await this.makeRequest('POST', '/v1/public/orders', orderData);
    } catch (error) {
      console.error('Error creating order in Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Update an order in Super Dispatch (partial update using PATCH)
   * Super Dispatch uses PATCH with application/merge-patch+json for partial updates
   * See: https://developer.superdispatch.com/
   */
  async updateLoad(orderGuid, updates) {
    try {
      return await this.makeRequest('PATCH', `/v1/public/orders/${orderGuid}`, updates, {
        'Content-Type': 'application/merge-patch+json'
      });
    } catch (error) {
      console.error('Error updating order in Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Search carriers
   * See: https://developer.superdispatch.com/reference/fullsearchcarriers
   */
  async searchCarriers(query) {
    try {
      return await this.makeRequest('GET', `/v1/public/carriers/full_search?query=${encodeURIComponent(query)}`);
    } catch (error) {
      console.error('Error searching carriers:', error.message);
      throw error;
    }
  }

  /**
   * Get carrier details by GUID
   */
  async getCarrier(carrierGuid) {
    try {
      return await this.makeRequest('GET', `/v1/public/carriers/${carrierGuid}`);
    } catch (error) {
      console.error('Error fetching carrier:', error.message);
      throw error;
    }
  }

  /**
   * Get BOL (Bill of Lading) for an order
   * Super Dispatch API: GET /v1/public/orders/<order_guid>/bol
   */
  async getBOL(orderGuid) {
    try {
      return await this.makeRequest('GET', `/v1/public/orders/${orderGuid}/bol`);
    } catch (error) {
      console.error('Error fetching BOL from Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Mark an order as paid to carrier
   * Super Dispatch API: PUT /v1/public/orders/<order_guid>/mark_as_paid
   */
  async markAsPaid(orderGuid, paymentData) {
    try {
      return await this.makeRequest('PUT', `/v1/public/orders/${orderGuid}/mark_as_paid`, paymentData);
    } catch (error) {
      console.error('Error marking order as paid in Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Send load offer to a carrier
   * Super Dispatch API: POST /v1/public/orders/<order_guid>/offers
   */
  async sendLoadOffer(orderGuid, offerData) {
    try {
      return await this.makeRequest('POST', `/v1/public/orders/${orderGuid}/offers`, offerData);
    } catch (error) {
      console.error('Error sending load offer in Super Dispatch:', error.message);
      throw error;
    }
  }
}

module.exports = new SuperDispatchClient();