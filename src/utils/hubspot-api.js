require('dotenv').config();
const axios = require('axios');

class HubSpotAPI {
  constructor() {
    this.accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    this.baseURL = process.env.HUBSPOT_BASE_URL;
    
    if (!this.accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN is required in .env file');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Retry wrapper for network requests with exponential backoff
   * @param {Function} apiCall - The API call function to retry
   * @param {string} operation - Description of the operation for logging
   * @param {number} maxRetries - Maximum number of retry attempts
   * @param {number} baseDelay - Base delay in milliseconds
   */
  async retryWithBackoff(apiCall, operation = 'API call', maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Check if this is a retryable error
        const isNetworkError = error.code === 'ECONNRESET' || 
                              error.code === 'ENOTFOUND' || 
                              error.code === 'ETIMEDOUT' ||
                              error.code === 'ECONNREFUSED' ||
                              (error.response?.status >= 500 && error.response?.status <= 599);
        
        if (!isNetworkError || attempt === maxRetries) {
          console.error(`❌ ${operation} failed after ${attempt} retries:`, error.message);
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`⚠️  ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message || error.code}`);
        console.warn(`   Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async getMeetings(limit = 100, offset = 0) {
    return this.retryWithBackoff(async () => {
      const response = await this.client.get('/engagements/v1/engagements/paged', {
        params: {
          limit: limit,
          offset: offset
        }
      });
      
      // Filter to only return meeting engagements
      const meetings = response.data.results.filter(eng => eng.engagement?.type === 'MEETING');
      
      return {
        results: meetings,
        hasMore: response.data.hasMore,
        offset: response.data.offset
      };
    }, `HubSpot legacy meetings fetch (limit=${limit}, offset=${offset})`);
  }

  async getAllMeetings() {
    let allMeetings = [];
    
    // Fetch legacy engagement meetings
    console.log('📥 Fetching legacy engagement meetings...');
    let offset = 0;
    let hasMore = true;
    
    do {
      const response = await this.getMeetings(100, offset);
      allMeetings = allMeetings.concat(response.results);
      hasMore = response.hasMore;
      offset = response.offset;
      
      console.log(`Fetched ${response.results.length} legacy meetings (Total legacy: ${allMeetings.length})`);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    } while (hasMore);
    
    // Fetch new CRM meetings
    console.log('📥 Fetching new CRM meetings...');
    const crmMeetings = await this.getAllCRMMeetings();
    
    console.log(`📊 Total meetings: ${allMeetings.length} legacy + ${crmMeetings.length} CRM = ${allMeetings.length + crmMeetings.length}`);
    
    return [...allMeetings, ...crmMeetings];
  }
  
  async getCRMMeetings(limit = 100, after = null) {
    return this.retryWithBackoff(async () => {
      let url = `/crm/v3/objects/meetings?limit=${limit}&properties=hs_meeting_title,hs_meeting_body,hs_timestamp,hs_meeting_start_time,hs_meeting_end_time,hs_meeting_location,attio_meeting_id,hs_internal_meeting_notes,hubspot_owner_id`;
      if (after) {
        url += `&after=${after}`;
      }
      
      const response = await this.client.get(url);
      return response.data;
    }, `HubSpot CRM meetings fetch (limit=${limit}, after=${after || 'null'})`);
  }

  async getAllCRMMeetings() {
    let allCRMMeetings = [];
    let after = null;
    
    do {
      const response = await this.getCRMMeetings(100, after);
      allCRMMeetings = allCRMMeetings.concat(response.results);
      after = response.paging?.next?.after || null;
      
      console.log(`Fetched ${response.results.length} CRM meetings (Total CRM: ${allCRMMeetings.length})`);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
    
    return allCRMMeetings;
  }

  async getCompanies(limit = 100, after = null) {
    return this.retryWithBackoff(async () => {
      let url = `/crm/v3/objects/companies?limit=${limit}&properties=name,domain,attio_company_id`;
      if (after) {
        url += `&after=${after}`;
      }
      
      const response = await this.client.get(url);
      return response.data;
    }, `HubSpot companies fetch (limit=${limit}, after=${after || 'null'})`);
  }

  async getAllCompanies() {
    let allCompanies = [];
    let after = null;
    
    do {
      const response = await this.getCompanies(100, after);
      allCompanies = allCompanies.concat(response.results);
      after = response.paging?.next?.after || null;
      
      console.log(`Fetched ${response.results.length} companies from HubSpot (Total: ${allCompanies.length})`);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
    
    return allCompanies;
  }

  async getDeals(limit = 100, after = null) {
    return this.retryWithBackoff(async () => {
      let url = `/crm/v3/objects/deals?limit=${limit}&properties=dealname,dealstage,amount,attio_deal_id`;
      if (after) {
        url += `&after=${after}`;
      }
      
      const response = await this.client.get(url);
      return response.data;
    }, `HubSpot deals fetch (limit=${limit}, after=${after || 'null'})`);
  }

  async getAllDeals() {
    let allDeals = [];
    let after = null;
    
    do {
      const response = await this.getDeals(100, after);
      allDeals = allDeals.concat(response.results);
      after = response.paging?.next?.after || null;
      
      console.log(`Fetched ${response.results.length} deals from HubSpot (Total: ${allDeals.length})`);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
    
    return allDeals;
  }

  async getContacts(limit = 100, after = null) {
    return this.retryWithBackoff(async () => {
      let url = `/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,attio_contact_id`;
      if (after) {
        url += `&after=${after}`;
      }
      
      const response = await this.client.get(url);
      return response.data;
    }, `HubSpot contacts fetch (limit=${limit}, after=${after || 'null'})`);
  }

  async getAllContacts() {
    let allContacts = [];
    let after = null;
    
    do {
      const response = await this.getContacts(100, after);
      allContacts = allContacts.concat(response.results);
      after = response.paging?.next?.after || null;
      
      console.log(`Fetched ${response.results.length} contacts from HubSpot (Total: ${allContacts.length})`);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
    
    return allContacts;
  }

  async createAssociation(fromObjectType, fromObjectId, toObjectType, toObjectId, associationType = 'meeting_to_company') {
    try {
      const associationTypeId = this.getAssociationTypeId(associationType);
      
      const associationData = [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: associationTypeId
        }
      ];

      const response = await this.client.put(
        `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}`,
        associationData
      );
      
      return response.data;
    } catch (error) {
      console.error(`Error creating association ${fromObjectType}:${fromObjectId} -> ${toObjectType}:${toObjectId}:`, error.message);
      if (error.response?.data) {
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  getAssociationTypeId(associationType) {
    const associationTypes = {
      'meeting_to_company': 188,   // Meeting to Company (correct HubSpot ID)
      'meeting_to_deal': 212,      // Meeting to Deal (correct HubSpot ID)  
      'meeting_to_contact': 200,   // Meeting to Contact (correct HubSpot ID)
      'company_to_meeting': 187,   // Company to Meeting (reverse)
      'deal_to_meeting': 211,      // Deal to Meeting (reverse)
      'contact_to_meeting': 199    // Contact to Meeting (reverse)
    };
    
    return associationTypes[associationType] || 188; // Default to meeting_to_company
  }

  async batchCreateAssociations(associations, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < associations.length; i += batchSize) {
      const batch = associations.slice(i, i + batchSize);
      
      console.log(`Processing association batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(associations.length/batchSize)}`);
      
      const batchPromises = batch.map(async (association) => {
        try {
          return await this.createAssociation(
            association.fromObjectType,
            association.fromObjectId,
            association.toObjectType,
            association.toObjectId,
            association.associationType
          );
        } catch (error) {
          console.error(`Failed to create association:`, association, error.message);
          return { error: error.message, association };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    return results;
  }

  /**
   * Upload a file to HubSpot File Manager
   */
  async uploadFile(filePath, fileName) {
    return this.retryWithBackoff(async () => {
      const FormData = require('form-data');
      const fs = require('fs');
      
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      form.append('fileName', fileName);
      form.append('options', JSON.stringify({
        access: 'PUBLIC_NOT_INDEXABLE',
        ttl: 'P3M'
      }));

      const response = await this.client.post('/files/v3/files', form, {
        headers: {
          ...form.getHeaders(),
          'Content-Type': `multipart/form-data; boundary=${form._boundary}`
        }
      });

      console.log(`✅ File uploaded successfully: ${fileName}`);
      return response.data;
    }, `file upload: ${fileName}`);
  }

  /**
   * Delete a meeting by ID
   * @param {string} meetingId - The HubSpot meeting ID to delete
   */
  async deleteMeeting(meetingId) {
    try {
      const response = await this.client.delete(`/engagements/v1/engagements/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting meeting ${meetingId}:`, error.response?.data?.message || error.message);
      throw error;
    }
  }
}

module.exports = HubSpotAPI;