require('dotenv').config();
const axios = require('axios');

class AttioAPI {
  constructor() {
    this.apiKey = process.env.ATTIO_API_KEY;
    this.baseURL = process.env.ATTIO_BASE_URL || 'https://api.attio.com';
    
    if (!this.apiKey) {
      throw new Error('ATTIO_API_KEY is required in .env file');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
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
          console.error(`❌ Attio ${operation} failed after ${attempt} retries:`, error.message);
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`⚠️  Attio ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message || error.code}`);
        console.warn(`   Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async getMeetings(cursor = null) {
    return this.retryWithBackoff(async () => {
      const params = {
        limit: 200 // Max allowed by API
      };
      if (cursor) {
        params.cursor = cursor;
      }
      
      console.log(`🔗 Attio API call: ${this.baseURL}/v2/meetings`);
      const response = await this.client.get('/v2/meetings', { params });
      return response.data;
    }, `meetings fetch (cursor=${cursor || 'null'})`);
  }

  async getCalls(cursor = null) {
    return this.retryWithBackoff(async () => {
      const params = {
        limit: 200 // Max allowed by API
      };
      if (cursor) {
        params.cursor = cursor;
      }
      
      console.log(`🔗 Attio API call: ${this.baseURL}/v2/calls`);
      const response = await this.client.get('/v2/calls', { params });
      return response.data;
    }, `calls fetch (cursor=${cursor || 'null'})`);
  }



  async getAllCalls(maxDate = null) {
    let allCalls = [];
    let cursor = null;
    
    // Set max date to TODAY unless specified otherwise
    const cutoffDate = maxDate ? new Date(maxDate) : new Date();
    cutoffDate.setHours(0, 0, 0, 0); // Start of today
    
    console.log(`📅 Filtering calls to exclude anything scheduled after: ${cutoffDate.toISOString()}`);
    
    do {
      const response = await this.getCalls(cursor);
      
      // Filter out calls scheduled in the future (after cutoff)
      const filteredCalls = response.data.filter(call => {
        try {
          // Calls use the same date structure as meetings
          const callDate = this.extractMeetingDate(call); // Reuse same method
          if (!callDate) {
            const callId = call.id?.call_id || call.id || 'unknown';
            console.warn(`⚠️  Rejecting call without valid date: ${callId}`);
            return false; // REJECT if we can't determine date
          }
          
          const callDateTime = new Date(callDate);
          
          // Reject calls scheduled after the cutoff date
          if (callDateTime > cutoffDate) {
            const callId = call.id?.call_id || call.id || 'unknown';
            console.warn(`⚠️  Skipping future call: ${callId} scheduled for ${callDateTime.toISOString()} (beyond ${cutoffDate.toISOString()})`);
            return false;
          }
          
          // Also reject obviously invalid dates
          if (callDateTime.getFullYear() > new Date().getFullYear() + 1) {
            const callId = call.id?.call_id || call.id || 'unknown';
            console.warn(`⚠️  Skipping invalid future call: ${callId} scheduled for year ${callDateTime.getFullYear()}`);
            return false;
          }
          
          return true;
        } catch (error) {
          const callId = call.id?.call_id || call.id || 'unknown';
          console.warn(`Warning: Could not parse date for call ${callId}:`, error.message);
          return true; // Keep if we can't parse
        }
      });
      
      allCalls = allCalls.concat(filteredCalls);
      cursor = response.pagination?.next_cursor || null;
      
      const filteredCount = response.data.length - filteredCalls.length;
      if (filteredCount > 0) {
        console.log(`📊 Fetched ${response.data.length} calls, filtered out ${filteredCount} future calls, kept ${filteredCalls.length} (Valid total: ${allCalls.length})`);
      } else {
        console.log(`📊 Fetched ${response.data.length} calls (Valid total: ${allCalls.length})`);
      }
      
      // Add delay to respect rate limits and prevent connection resets
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (cursor);
    
    console.log(`🎯 Final call count after future date filtering: ${allCalls.length}`);
    return allCalls;
  }

  async getAllMeetings(maxDate = null) {
    let allMeetings = [];
    let cursor = null;
    
    // Set max date to RIGHT NOW unless specified otherwise
    // Block any meetings past this exact moment
    const cutoffDate = maxDate ? new Date(maxDate) : new Date();
    // No time manipulation - use the exact current timestamp
    
    console.log(`📅 Filtering meetings to exclude anything scheduled after: ${cutoffDate.toISOString()}`);
    
    do {
      const response = await this.getMeetings(cursor);
      
      // Filter out meetings scheduled in the future (after cutoff)
      const filteredMeetings = response.data.filter(meeting => {
        try {
          const meetingDate = this.extractMeetingDate(meeting);
          if (!meetingDate) {
            const meetingId = meeting.id?.meeting_id || meeting.id || 'unknown';
            console.warn(`⚠️  Rejecting meeting without valid date: ${meetingId}`);
            return false; // REJECT if we can't determine date
          }
          
          const meetingDateTime = new Date(meetingDate);
          
          // Reject meetings scheduled after the cutoff date (future meetings should NOT be migrated)
          if (meetingDateTime > cutoffDate) {
            const meetingId = meeting.id?.meeting_id || meeting.id || 'unknown';
            console.warn(`⚠️  Skipping future meeting: ${meetingId} scheduled for ${meetingDateTime.toISOString()} (beyond ${cutoffDate.toISOString()})`);
            return false;
          }
          
          // Also reject obviously invalid dates (like year 2086)
          if (meetingDateTime.getFullYear() > new Date().getFullYear() + 1) {
            const meetingId = meeting.id?.meeting_id || meeting.id || 'unknown';
            console.warn(`⚠️  Skipping invalid future meeting: ${meetingId} scheduled for year ${meetingDateTime.getFullYear()}`);
            return false;
          }
          
          return true;
        } catch (error) {
          const meetingId = meeting.id?.meeting_id || meeting.id || 'unknown';
          console.warn(`Warning: Could not parse date for meeting ${meetingId}:`, error.message);
          return true; // Keep if we can't parse
        }
      });
      
      allMeetings = allMeetings.concat(filteredMeetings);
      cursor = response.pagination?.next_cursor || null;
      
      const filteredCount = response.data.length - filteredMeetings.length;
      if (filteredCount > 0) {
        console.log(`📊 Fetched ${response.data.length} meetings, filtered out ${filteredCount} future meetings, kept ${filteredMeetings.length} (Valid total: ${allMeetings.length})`);
      } else {
        console.log(`📊 Fetched ${response.data.length} meetings (Valid total: ${allMeetings.length})`);
      }
      
      // Add delay to respect rate limits and prevent connection resets
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (cursor);
    
    console.log(`🎯 Final meeting count after future date filtering: ${allMeetings.length}`);
    console.log(`🎯 Valid meetings ready for processing: ${allMeetings.length}`);
    return allMeetings;
  }

  async getAllMeetingsAndCalls(maxDate = null) {
    console.log('🔄 Fetching ALL Attio data: Meetings + Calls...');
    
    // Fetch both datasets in parallel
    const [meetings, calls] = await Promise.all([
      this.getAllMeetings(maxDate),
      this.getAllCalls(maxDate)
    ]);
    
    console.log(`📊 Dataset counts: ${meetings.length} meetings, ${calls.length} calls`);
    
    // Normalize calls to look like meetings for unified processing
    const normalizedCalls = calls.map(call => {
      // Add type identifier to distinguish source
      return {
        ...call,
        _source_type: 'call', // Mark as call for debugging
        // Map call ID structure to meeting-like structure if needed
        id: call.id?.call_id ? { meeting_id: call.id.call_id } : call.id
      };
    });
    
    // Add source type to meetings too
    const normalizedMeetings = meetings.map(meeting => ({
      ...meeting,
      _source_type: 'meeting'
    }));
    
    // Combine datasets
    const combined = [...normalizedMeetings, ...normalizedCalls];
    
    // Simple deduplication by ID (prefer meetings over calls if same ID)
    const seenIds = new Set();
    const dedupedRecords = [];
    
    // Process meetings first (they take priority)
    normalizedMeetings.forEach(meeting => {
      const id = meeting.id?.meeting_id || meeting.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        dedupedRecords.push(meeting);
      }
    });
    
    // Then process calls (only add if ID not already seen)
    normalizedCalls.forEach(call => {
      const id = call.id?.meeting_id || call.id?.call_id || call.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        dedupedRecords.push(call);
      }
    });
    
    const duplicateCount = combined.length - dedupedRecords.length;
    
    console.log(`🎯 Combined dataset: ${combined.length} total records`);
    console.log(`🔄 After deduplication: ${dedupedRecords.length} unique records`);
    if (duplicateCount > 0) {
      console.log(`🗑️  Removed ${duplicateCount} duplicate records`);
    }
    console.log(`📈 Final count ready for migration: ${dedupedRecords.length}`);
    
    return dedupedRecords;
  }

  async getCompanies(cursor = null) {
    return this.retryWithBackoff(async () => {
      let url = '/v2/objects/companies';
      if (cursor) {
        url += `?cursor=${cursor}`;
      }
      
      const response = await this.client.get(url);
      return response.data;
    }, `companies fetch (cursor=${cursor || 'null'})`);
  }

  async getAllCompanies() {
    let allCompanies = [];
    let cursor = null;
    
    do {
      const response = await this.getCompanies(cursor);
      allCompanies = allCompanies.concat(response.data);
      cursor = response.pagination?.next_cursor || null;
      
      console.log(`Fetched ${response.data.length} companies from Attio (Total: ${allCompanies.length})`);
      
      // Add delay to respect rate limits and prevent connection resets
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (cursor);
    
    return allCompanies;
  }

  async getDeals(cursor = null) {
    return this.retryWithBackoff(async () => {
      let url = '/v2/objects/deals';
      if (cursor) {
        url += `?cursor=${cursor}`;
      }
      
      const response = await this.client.get(url);
      return response.data;
    }, `deals fetch (cursor=${cursor || 'null'})`);
  }

  async getAllDeals() {
    let allDeals = [];
    let cursor = null;
    
    do {
      const response = await this.getDeals(cursor);
      allDeals = allDeals.concat(response.data);
      cursor = response.pagination?.next_cursor || null;
      
      console.log(`Fetched ${response.data.length} deals from Attio (Total: ${allDeals.length})`);
      
      // Add delay to respect rate limits and prevent connection resets
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (cursor);
    
    return allDeals;
  }

  /**
   * Extract meeting date from Attio meeting object
   * @param {Object} meeting - Attio meeting object
   * @returns {Date|null} - Meeting start date or null if not found
   */
  extractMeetingDate(meeting) {
    try {
      // Check direct start object structure (Attio meetings API format)
      if (meeting.start) {
        // For timed meetings: start.datetime
        if (meeting.start.datetime) {
          return new Date(meeting.start.datetime);
        }
        // For all-day meetings: start.date
        if (meeting.start.date) {
          return new Date(meeting.start.date);
        }
        // Legacy: if start is a string directly
        if (typeof meeting.start === 'string') {
          return new Date(meeting.start);
        }
        // Legacy: if start has timestamp property
        if (typeof meeting.start === 'object' && meeting.start.timestamp) {
          return new Date(meeting.start.timestamp);
        }
      }

      // Check values object (backup - some APIs use nested values)
      if (meeting.values) {
        // Try start_time in values
        if (meeting.values.start_time) {
          if (typeof meeting.values.start_time === 'object' && meeting.values.start_time.timestamp) {
            return new Date(meeting.values.start_time.timestamp);
          }
          if (typeof meeting.values.start_time === 'string') {
            return new Date(meeting.values.start_time);
          }
        }
        
        // Try start in values
        if (meeting.values.start) {
          if (typeof meeting.values.start === 'object' && meeting.values.start.timestamp) {
            return new Date(meeting.values.start.timestamp);
          }
          if (typeof meeting.values.start === 'string') {
            return new Date(meeting.values.start);
          }
        }

        // Try start_at in values
        if (meeting.values.start_at) {
          if (typeof meeting.values.start_at === 'object' && meeting.values.start_at.timestamp) {
            return new Date(meeting.values.start_at.timestamp);
          }
          if (typeof meeting.values.start_at === 'string') {
            return new Date(meeting.values.start_at);
          }
        }
      }

      // Try attributes object
      if (meeting.attributes) {
        if (meeting.attributes.start_time) {
          return new Date(meeting.attributes.start_time);
        }
        if (meeting.attributes.start) {
          return new Date(meeting.attributes.start);
        }
      }

      // Try direct properties
      if (meeting.start_time) {
        if (typeof meeting.start_time === 'object' && meeting.start_time.timestamp) {
          return new Date(meeting.start_time.timestamp);
        }
        if (typeof meeting.start_time === 'string') {
          return new Date(meeting.start_time);
        }
      }

      if (meeting.start) {
        if (typeof meeting.start === 'object' && meeting.start.timestamp) {
          return new Date(meeting.start.timestamp);
        }
        if (typeof meeting.start === 'string') {
          return new Date(meeting.start);
        }
      }

      if (meeting.start_at) {
        if (typeof meeting.start_at === 'object' && meeting.start_at.timestamp) {
          return new Date(meeting.start_at.timestamp);
        }
        if (typeof meeting.start_at === 'string') {
          return new Date(meeting.start_at);
        }
      }

      // NO FALLBACK to created_at - only meetings with actual start dates should be migrated
      return null;
    } catch (error) {
      console.warn(`Warning: Could not extract date from meeting ${meeting.id?.meeting_id || 'unknown'}:`, error.message);
      return null;
    }
  }

  async getCallRecordingsForMeeting(meetingId) {
    return this.retryWithBackoff(async () => {
      console.log(`🎥 Fetching call recordings for meeting: ${meetingId}`);
      const response = await this.client.get(`/v2/meetings/${meetingId}/call_recordings`);
      return response.data.data || [];
    }, `call recordings fetch for meeting ${meetingId}`);
  }

  async getAttioTranscript(callRecordingId) {
    return this.retryWithBackoff(async () => {
      console.log(`📝 Fetching transcript for call recording: ${callRecordingId}`);
      const response = await this.client.get(`/v2/call_recordings/${callRecordingId}/transcript`);
      return response.data;
    }, `transcript fetch for call recording ${callRecordingId}`);
  }
}

module.exports = AttioAPI;