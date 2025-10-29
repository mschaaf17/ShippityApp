const axios = require('axios');
require('dotenv').config();

const SUPER_DISPATCH_API_KEY = process.env.SUPER_DISPATCH_API_KEY;
const API_BASE_URL = 'https://api.superdispatch.com/v1'; // Update with actual API URL

/**
 * Initialize Super Dispatch API client
 */
class SuperDispatchClient {
  constructor() {
    this.apiKey = SUPER_DISPATCH_API_KEY;
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get a load by ID
   */
  async getLoad(loadId) {
    try {
      const response = await this.client.get(`/loads/${loadId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching load from Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Get all loads (with filters)
   */
  async getAllLoads(params = {}) {
    try {
      const response = await this.client.get('/loads', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching loads from Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Create a load in Super Dispatch
   */
  async createLoad(loadData) {
    try {
      const response = await this.client.post('/loads', loadData);
      return response.data;
    } catch (error) {
      console.error('Error creating load in Super Dispatch:', error.message);
      throw error;
    }
  }

  /**
   * Update a load in Super Dispatch
   */
  async updateLoad(loadId, updates) {
    try {
      const response = await this.client.put(`/loads/${loadId}`, updates);
      return response.data;
    } catch (error) {
      console.error('Error updating load in Super Dispatch:', error.message);
      throw error;
    }
  }
}

module.exports = new SuperDispatchClient();

