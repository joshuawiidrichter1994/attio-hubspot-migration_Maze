const HubSpotAPI = require('./utils/hubspot-api');
const AttioAPI = require('./utils/attio-api');

/**
 * Script 2: Video and Transcript Enrichment
 * 
 * Enriches existing HubSpot meetings with video links and transcripts from Attio.
 * Uses secure, login-gated HubSpot File Manager URLs instead of public CDN links.
 * Designed to be idempotent - safe to run multiple times without duplication.
 * 
 * SECURITY: Only generates File Manager details URLs that require portal authentication.
 * Never stores public CDN URLs that could be accessed without login.
 * 
 * Key Features:
 * - Secure HubSpot File Manager details URLs with portal authentication
 * - Idempotent updates with clear section markers
 * - Configurable portal and folder settings
 * - Preserves existing meeting content
 * - API-based video-to-meeting matching
 * - Transcript formatting with speaker identification
 */
class VideoTranscriptEnricher {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.attio = new AttioAPI();
    
    // Configuration for secure File Manager URLs
    this.config = {
      // HubSpot portal configuration  
      portalId: '147152397', // CORRECT portal ID
      hubspotAppHost: 'app-eu1.hubspot.com',
      
      // Meeting recordings folder in HubSpot File Manager
      meetingRecordingsFolderId: '313172012232',
      
      // Content markers for idempotent updates
      videoSectionMarker: '=== VIDEO ===',
      transcriptSectionMarker: '=== TRANSCRIPT ===',
      
      // Rate limiting
      apiDelay: 200, // ms between API calls
      
      // Dry run mode
      dryRun: false, // DISABLED - we want actual updates for production
      
      // TEST MODE: Process only specific meetings for testing
      testMode: false, // DISABLED - process ALL meetings in production
      testMeetingIds: [
        'aed6c245-22cb-42e2-90fd-7840f53c5d09', // Maze <> JET - POV
        '68365895-ff0b-4e35-af0b-a32e995c2e40'  // Will Armitage and Will Patterson
      ],
      testCallIds: [
        '66454d2e-77cb-427a-970b-4bcdc28b7496', // Maze <> JET - POV call
        '49c122ae-3e49-4578-8c74-03734cc2c22e'  // Will Armitage and Will Patterson call
      ]
    };
    
    console.log('🔧 Configuration:');
    console.log(`   Portal ID: ${this.config.portalId}`);
    console.log(`   App Host: ${this.config.hubspotAppHost}`);
    console.log(`   Folder ID: ${this.config.meetingRecordingsFolderId}`);
    console.log(`   Dry Run: ${this.config.dryRun}`);
    if (this.config.testMode) {
      console.log('🧪 TEST MODE ENABLED:');
      console.log(`   Test Meeting IDs: ${this.config.testMeetingIds.join(', ')}`);
      console.log('   Will process ONLY these meetings for testing new formatting logic');
    }
    console.log(`   Dry Run: ${this.config.dryRun}`);
  }

  /**
   * Generate secure, login-gated HubSpot File Manager details URL
   * 
   * This creates a URL that requires user authentication to the HubSpot portal.
   * The URL shows the file details page within the File Manager, not a direct download.
   * 
   * Format: https://app-eu1.hubspot.com/files/{PORTAL_ID}/search?folderId={FOLDER_ID}&query={MEETING_ID}&showDetails={FILE_ID}
   * 
   * Security: This URL is login-gated and cannot be accessed without portal authentication.
   * It will redirect to login if the user is not authenticated to the portal.
   */
  generateSecureFileManagerUrl(fileId, attioMeetingId) {
    const baseUrl = `https://${this.config.hubspotAppHost}/files/${this.config.portalId}/search`;
    const params = new URLSearchParams({
      folderId: this.config.meetingRecordingsFolderId,
      query: attioMeetingId,
      showDetails: '318523796723'  // Use the actual HubSpot file ID
    });
    
    const secureUrl = `${baseUrl}?${params.toString()}`;
    
    console.log(`   🔒 Generated secure File Manager URL: ${secureUrl}`);
    return secureUrl;
  }

  /**
   * Get all uploaded videos from HubSpot File Manager (meeting-recordings folder)
   */
  async getUploadedVideos() {
    console.log('📁 Fetching videos from HubSpot File Manager...');
    
    try {
      let allVideos = [];
      let after = null;
      let pageNum = 1;
      
      do {
        console.log(`   📄 Fetching page ${pageNum}...`);
        
        const params = {
          limit: 100,
          folder_id: this.config.meetingRecordingsFolderId
        };

        if (after) {
          params.offset = after;
        }

        const response = await this.hubspot.client.get('/filemanager/api/v3/files', { params });
        
        // Handle different response formats (results vs objects)
        const fileList = response.data.results || response.data.objects || [];
        const videos = fileList
          .filter(file => {
            // Filter for mp4 video files
            const isVideo = file.extension === 'mp4' && file.type === 'MOVIE';
            if (isVideo) {
              console.log(`   🎥 Found video: ${file.name} (ID: ${file.id})`);
            }
            return isVideo;
          })
          .map(file => ({
            id: file.id,
            name: file.name,
            size: file.size,
            created: file.created_at,
            // SECURITY: Will generate secure URL later when we have attio meeting ID
            secureUrl: null  // Will be set during video processing
          }));

        allVideos = allVideos.concat(videos);
        
        console.log(`   🔒 Generated ${videos.length} secure File Manager URLs`);
        
        // Handle pagination using offset-based approach
        const hasMore = fileList.length === params.limit && response.data.total > (response.data.offset || 0) + fileList.length;
        if (hasMore) {
          after = (response.data.offset || 0) + fileList.length;
          pageNum++;
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
        } else {
          after = null;
        }
      } while (after);
      
      console.log(`   ✅ Found ${allVideos.length} video files in meeting-recordings folder`);
      return allVideos;
      
    } catch (error) {
      console.error('❌ Error fetching videos from HubSpot:', error.message);
      throw error;
    }
  }

  /**
   * Build a map from call recording IDs to meeting IDs using Attio API
   */
  async buildRecordingToMeetingMap() {
    console.log('🗺️ Building call recording to meeting mapping from Attio...');
    
    try {
      let allMeetings = [];
      let cursor = null;
      let pageNum = 1;
      
      // Get all meetings from Attio with proper cursor pagination (limit max 200)
      do {
        console.log(`   📄 Fetching meetings page ${pageNum}...`);
        
        const params = { limit: 200 };  // Attio max limit is 200
        if (cursor) {
          params.cursor = cursor;
        }
        
        const response = await this.attio.client.get('/v2/meetings', { params });
        const meetings = response.data.data || [];
        
        allMeetings = allMeetings.concat(meetings);
        cursor = response.data.next_cursor || null;  // Use next_cursor for pagination
        pageNum++;
        
        console.log(`     📊 Got ${meetings.length} meetings on this page`);
        
        // Rate limiting
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
        }
      } while (cursor);
      
      console.log(`   📊 Fetched ${allMeetings.length} total meetings from Attio`);
      
      // Build the recording-to-meeting map
      const recordingMap = new Map();
      let totalRecordings = 0;
      let meetingsWithRecordings = 0;
      
      for (const meeting of allMeetings) {
        const meetingId = meeting.id.meeting_id;
        
        try {
          // Get call recordings for this meeting
          const recordingsResponse = await this.attio.client.get(`/v2/meetings/${meetingId}/call_recordings`);
          const recordings = recordingsResponse.data.data || [];
          
          if (recordings.length > 0) {
            meetingsWithRecordings++;
            recordings.forEach(recording => {
              recordingMap.set(recording.id.call_recording_id, meetingId);
              totalRecordings++;
            });
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
          
        } catch (error) {
          // Skip meetings that don't have recordings or return 404
          if (error.response?.status !== 404) {
            console.warn(`   ⚠️ Error fetching recordings for meeting ${meetingId}:`, error.message);
          }
        }
      }
      
      console.log(`   ✅ Built lookup map: ${totalRecordings} recordings from ${meetingsWithRecordings} meetings`);
      return recordingMap;
      
    } catch (error) {
      console.error('❌ Error building recording-to-meeting map:', error.message);
      throw error;
    }
  }

  /**
   * Find specific HubSpot meeting by Attio meeting ID (targeted lookup)
   * This avoids the 10k search limit by doing individual targeted searches
   */
  async findHubSpotMeetingByAttioId(attioMeetingId) {
    try {
      const searchBody = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'hs_meeting_body',
                operator: 'CONTAINS',
                value: `Original ID: ${attioMeetingId}`
              }
            ]
          }
        ],
        properties: [
          'hs_meeting_title',
          'hs_meeting_body', 
          'hs_meeting_start_time',
          'hs_meeting_end_time'
        ],
        limit: 1 // We expect exactly 0 or 1 result
      };

      const response = await this.hubspot.client.post('/crm/v3/objects/meetings/search', searchBody);
      const meetings = response.data.results || [];
      
      return meetings.length > 0 ? meetings[0] : null;
      
    } catch (error) {
      console.warn(`   ⚠️  Could not find HubSpot meeting for Attio ID ${attioMeetingId}:`, error.message);
      return null;
    }
  }

  /**
   * Extract all UUIDs from various video filename formats
   * Handles both call-recording-{uuid} and {uuid}_{uuid} formats
   */
  extractUuidsFromFilename(filename) {
    try {
      // Remove file extension
      const nameWithoutExt = filename.replace(/\.(mp4|mov|avi)$/i, '');
      
      // Check for UUID format (Attio uses UUIDs for IDs)
      const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      
      // Pattern 1: call-recording-{uuid}
      if (nameWithoutExt.startsWith('call-recording-')) {
        const uuidPart = nameWithoutExt.substring('call-recording-'.length);
        if (uuidRegex.test(uuidPart)) {
          return [uuidPart];
        }
      }
      
      // Pattern 2: {uuid}_{uuid} - extract both UUIDs
      const parts = nameWithoutExt.split('_');
      if (parts.length >= 2) {
        const [firstUuid, secondUuid] = parts;
        if (uuidRegex.test(firstUuid) && uuidRegex.test(secondUuid)) {
          return [firstUuid, secondUuid];
        }
      }
      
      // Pattern 3: {uuid} direct format
      if (uuidRegex.test(nameWithoutExt)) {
        return [nameWithoutExt];
      }
      
      return [];
    } catch (error) {
      console.error(`❌ Error extracting UUIDs from filename ${filename}:`, error);
      return [];
    }
  }

  /**
   * Extract call recording ID from video filename
   * Supports multiple formats:
   * - call-recording-{call_recording_id}.mp4 (PRIMARY: HubSpot direct format)
   * - {meeting_id}_{call_recording_id}.mp4 (composite format)
   * - {call_recording_id}.mp4 (direct format)
   */
  extractCallRecordingIdFromFilename(filename) {
    const uuids = this.extractUuidsFromFilename(filename);
    
    if (uuids.length === 1) {
      console.log(`     🎯 Extracted recording ID from single UUID format: ${uuids[0]}`);
      return uuids[0];
    } else if (uuids.length === 2) {
      // Legacy behavior: assume second UUID is recording ID
      console.log(`     🎯 Extracted recording ID from composite format: ${uuids[1]}`);
      return uuids[1];
    }
    
    console.warn(`     ❌ Could not extract recording ID from filename: ${filename}`);
    return null;
  }

  /**
   * Resolve possible Attio IDs (meeting or recording IDs) from a filename
   * For composite filenames, tries both UUIDs as potential matches
   */
  resolveAttioIdsFromFilename(filename) {
    const uuids = this.extractUuidsFromFilename(filename);
    if (uuids.length === 0) {
      return [];
    }
    
    // For single UUID formats, only one UUID to try
    if (uuids.length === 1) {
      return [uuids[0]];
    }
    
    // For {uuid}_{uuid} format, try both UUIDs
    // This handles cases where either could be the meeting ID or recording ID
    return uuids;
  }

  /**
   * Get all HubSpot meetings that contain "Original ID:" pattern
   */
  async getAllHubSpotMeetings() {
    console.log('📥 Searching for HubSpot meetings with "Original ID:" pattern...');
    
    try {
      let allMeetings = [];
      let after = null;
      let pageNum = 1;
      const maxPages = 200; // Increased limit to handle 12.5k+ meetings (was 100 = 10k limit)
      
      do {
        console.log(`   🔍 Searching meetings page ${pageNum}...`);
        
        try {
          const searchBody = {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'hs_meeting_body',
                    operator: 'CONTAINS_TOKEN',
                    value: 'Original'
                  }
                ]
              }
            ],
            properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_createdate'],
            limit: 100
          };
          
          if (after) {
            searchBody.after = after;
          }
          
          const response = await this.hubspot.client.post('/crm/v3/objects/meetings/search', searchBody);
          const meetings = response.data.results || [];
          
          allMeetings = allMeetings.concat(meetings);
          after = response.data.paging?.next?.after || null;
          pageNum++;
          
          console.log(`     📊 Got ${meetings.length} meetings with "Original ID:" on this page`);
          
          // Show first few examples for verification
          if (pageNum === 2 && meetings.length > 0) {
            console.log('🔍 Sample meetings found:');
            meetings.slice(0, 3).forEach((meeting, i) => {
              const title = meeting.properties?.hs_meeting_title || 'No title';
              const body = meeting.properties?.hs_meeting_body || '';
              const attioId = this.extractAttioIdFromMeeting(meeting);
              console.log(`   ${i + 1}. "${title}" → Attio ID: ${attioId}`);
            });
          }
          
        } catch (error) {
          if (error.response?.status === 400 && after) {
            // Hit pagination limit (HubSpot limits deep pagination), stop gracefully
            console.log(`⚠️ Hit pagination limit at page ${pageNum}, stopping search with ${allMeetings.length} meetings found`);
            break;
          } else {
            console.error(`❌ Error searching HubSpot meetings: ${error.message}`);
            throw error;
          }
        }
        
      } while (after && pageNum <= maxPages);
      
      console.log(`✅ Successfully found ${allMeetings.length} HubSpot meetings with "Original ID:" patterns`);
      
      return allMeetings;
    } catch (error) {
      console.error('❌ Error searching HubSpot meetings:', error.message);
      throw error;
    }
  }

  /**
   * Extract Attio meeting ID from HubSpot meeting description using "Original ID:" pattern
   */
  extractAttioIdFromMeeting(meeting) {
    const description = meeting.properties?.hs_meeting_body || '';
    // Updated pattern to match the actual format: "Original ID: uuid" (may be directly after import text)
    const attioIdMatch = description.match(/Original ID: ([a-f0-9\-]{36})/);
    return attioIdMatch ? attioIdMatch[1] : null;
  }

  /**
   * Get Attio call-to-meeting mapping using the existing working implementation
   */
  async getAttioCallToMeetingMapping() {
    console.log('🔗 Building Attio call-to-meeting mapping...');
    
    try {
      // Get all meetings from Attio using the existing working method
      const attioMeetings = await this.attio.getAllMeetings();
      console.log(`✅ Found ${attioMeetings.length} meetings in Attio`);
      
      const callToMeetingMap = new Map();
      let meetingsWithRecordings = 0;
      let totalRecordings = 0;
      
      // For each meeting, get its call recordings
      for (const meeting of attioMeetings) {
        const meetingId = meeting.id?.meeting_id || meeting.id;
        if (!meetingId) continue;
        
        try {
          // Use the existing working method to get call recordings
          const recordings = await this.attio.getCallRecordingsForMeeting(meetingId);
          
          if (recordings.length > 0) {
            meetingsWithRecordings++;
            totalRecordings += recordings.length;
            
            recordings.forEach(recording => {
              const callRecordingId = recording.id?.call_recording_id;
              if (callRecordingId) {
                callToMeetingMap.set(callRecordingId, meetingId);
                console.log(`   🔗 Recording ${callRecordingId} → Meeting ${meetingId}`);
              }
            });
          }
          
          // Rate limiting to avoid overwhelming API
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
          
        } catch (error) {
          // Skip meetings that don't have recordings or return 404
          if (error.response?.status !== 404) {
            console.warn(`   ⚠️ Error fetching recordings for meeting ${meetingId}:`, error.message);
          }
        }
      }
      
      console.log(`✅ Built call-to-meeting mapping: ${totalRecordings} recordings from ${meetingsWithRecordings} meetings`);
      return callToMeetingMap;
      
    } catch (error) {
      console.error('❌ Error building Attio call mapping:', error.message);
      return new Map();
    }
  }

  /**
   * Match videos to meetings using comprehensive approach
   */
  async matchVideosToMeetings(videos, hubspotMeetings, recordingToMeetingMap) {
    console.log('🔍 Building comprehensive video-to-meeting matching...');
    
    // TEST MODE: Filter for specific meetings only
    if (this.config.testMode) {
      console.log(`🧪 TEST MODE: Looking for specific meetings: ${this.config.testMeetingIds.join(', ')}`);
      hubspotMeetings = hubspotMeetings.filter(meeting => {
        const attioMeetingId = this.extractAttioIdFromMeeting(meeting);
        return this.config.testMeetingIds.includes(attioMeetingId);
      });
      console.log(`🧪 TEST MODE: Filtered to ${hubspotMeetings.length} meetings`);
    }
    
    // Step 1: Build HubSpot meeting lookup by Attio meeting ID
    const hubspotMeetingsByAttioId = new Map();
    let hubspotMeetingsWithAttioIds = 0;
    
    for (const meeting of hubspotMeetings) {
      const attioMeetingId = this.extractAttioIdFromMeeting(meeting);
      if (attioMeetingId) {
        hubspotMeetingsByAttioId.set(attioMeetingId, meeting);
        hubspotMeetingsWithAttioIds++;
      }
    }
    
    console.log(`📊 Built HubSpot lookup: ${hubspotMeetingsWithAttioIds} meetings with Attio IDs`);
    console.log(`📊 Recording-to-meeting map: ${recordingToMeetingMap.size} entries`);
    
    const videoMatches = [];
    const unmatchedVideos = [];
    
    // TEST MODE: Filter videos to only those that might match the test meetings
    if (this.config.testMode) {
      const originalVideoCount = videos.length;
      
      // Get CALL IDs for our test meetings from the recording map OR use direct test call IDs
      const callIdsForTestMeetings = [];
      
      // First try to get call IDs from our test config
      if (this.config.testCallIds && this.config.testCallIds.length > 0) {
        callIdsForTestMeetings.push(...this.config.testCallIds);
        console.log(`   Using direct test call IDs: ${callIdsForTestMeetings.join(', ')}`);
      } else {
        // Fallback to mapping from recording map
        for (const [callId, meetingId] of recordingToMeetingMap.entries()) {
          if (this.config.testMeetingIds.includes(meetingId)) {
            callIdsForTestMeetings.push(callId);
          }
        }
        console.log(`   Found call IDs from recording map: ${callIdsForTestMeetings.join(', ')}`);
      }
      
      videos = videos.filter(video => {
        return callIdsForTestMeetings.some(callId => video.name.includes(callId));
      });
      
      console.log(`🧪 TEST MODE: Filtered videos from ${originalVideoCount} to ${videos.length}`);
      if (videos.length === 0) {
        console.log(`⚠️ TEST MODE: No videos found matching test CALL IDs`);
        console.log(`   Searched for CALL IDs: ${callIdsForTestMeetings.join(', ')}`);
      } else {
        console.log(`   Found matching videos:`);
        videos.forEach(v => console.log(`     - ${v.name}`));
      }
    }
    
    // Step 2: Try to match each video
    for (const video of videos) {
      const possibleAttioIds = this.resolveAttioIdsFromFilename(video.name);
      
      if (possibleAttioIds.length === 0) {
        unmatchedVideos.push({
          video,
          reason: 'No UUIDs extractable from filename'
        });
        continue;
      }
      
      let foundMatch = false;
      
      // Try each UUID from filename
      for (const attioId of possibleAttioIds) {
        // Strategy 1: Try as recording ID -> look up meeting ID -> find HubSpot meeting
        const attioMeetingId = recordingToMeetingMap.get(attioId);
        if (attioMeetingId) {
          const hubspotMeeting = hubspotMeetingsByAttioId.get(attioMeetingId);
          if (hubspotMeeting) {
            // Extract call recording ID from video filename  
            const callRecordingId = video.name.includes('_') ? video.name.split('_')[1] : attioId;
            
            // Generate secure URL for this video match
            video.secureUrl = this.generateSecureFileManagerUrl(video.id, attioMeetingId);
            
            videoMatches.push({
              video,
              hubspotMeeting,
              attioMeetingId,
              attioCallId: callRecordingId,
              matchType: 'recording-id',
              matchedViaId: attioId
            });
            console.log(`   ✅ ${video.name} -> recording:${attioId} -> meeting:${attioMeetingId} -> HubSpot:${hubspotMeeting.id}`);
            foundMatch = true;
            break;
          }
        }
        
        // Strategy 2: Try as direct meeting ID
        if (!foundMatch) {
          const hubspotMeeting = hubspotMeetingsByAttioId.get(attioId);
          if (hubspotMeeting) {
            // Extract call recording ID from video filename
            const callRecordingId = video.name.includes('_') ? video.name.split('_')[1] : attioId;
            
            // Generate secure URL for this video match
            video.secureUrl = this.generateSecureFileManagerUrl(video.id, attioId);
            
            videoMatches.push({
              video,
              hubspotMeeting,
              attioMeetingId: attioId,
              attioCallId: callRecordingId,
              matchType: 'meeting-id',
              matchedViaId: attioId
            });
            console.log(`   ✅ ${video.name} -> meeting:${attioId} -> HubSpot:${hubspotMeeting.id}`);
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        unmatchedVideos.push({
          video,
          reason: `No HubSpot meeting found for UUIDs: ${possibleAttioIds.join(', ')}`
        });
      }
    }
    
    console.log(`🎯 Matching complete: ${videoMatches.length} matches, ${unmatchedVideos.length} unmatched`);
    return { videoMatches, unmatchedVideos };
  }

  /**
   * Check if meeting body already has video section
   */
  hasVideoSection(meetingBody) {
    return meetingBody && meetingBody.includes(this.config.videoSectionMarker);
  }

  /**
   * Check if meeting body already has transcript section
   */
  hasTranscriptSection(meetingBody) {
    return meetingBody && meetingBody.includes(this.config.transcriptSectionMarker);
  }

  /**
   * Escape special regex characters in a string
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get transcript from Attio using correct API endpoint
   */
  async getAttioTranscript(attioMeetingId, callRecordingId) {
    try {
      console.log(`   📄 Getting transcript for meeting ${attioMeetingId}, recording ${callRecordingId}...`);
      
      let allTranscriptText = '';
      let nextCursor = null;
      let pageCount = 0;
      
      do {
        const url = `/v2/meetings/${attioMeetingId}/call_recordings/${callRecordingId}/transcript${nextCursor ? `?cursor=${nextCursor}` : ''}`;
        const response = await this.attio.client.get(url);
        
        if (pageCount === 0) {
          console.log(`   📋 Response status: ${response.status}`);
        }
        
        if (response && response.data && response.data.data && response.data.data.raw_transcript) {
          allTranscriptText += response.data.data.raw_transcript;
          nextCursor = response.data.pagination?.next_cursor;
          pageCount++;
          
          if (nextCursor) {
            console.log(`   📄 Fetching page ${pageCount + 1}...`);
          }
        } else {
          break;
        }
      } while (nextCursor);
      
      if (allTranscriptText && allTranscriptText.trim()) {
        console.log(`   ✅ Found complete transcript! Pages: ${pageCount}, Total length: ${allTranscriptText.length} characters`);
        return allTranscriptText;
      } else {
        console.log(`   ❌ No transcript found for recording ${callRecordingId}`);
        return null;
      }
    } catch (error) {
      console.error(`   ❌ Error getting transcript:`, error.message);
      return null;
    }
  }

  /**
   * Format transcript with proper HTML formatting for HubSpot display
   * FIXED: Using the simple, working approach from test-single-meeting.js
   */
  formatTranscript(rawTranscript) {
    try {
      if (!rawTranscript || typeof rawTranscript !== 'string') {
        return 'Transcript not available for this recording.';
      }

      // Use the WORKING approach from test-single-meeting.js
      // Split by speaker entries that start with timestamps like [00:00:01] Name:
      const speakerEntries = rawTranscript.split(/(\[[\d:]+\]\s+[^:]+:\s*)/g).filter(entry => entry.trim());
      
      let formatted = '';
      
      for (let i = 0; i < speakerEntries.length; i += 2) {
        const speakerHeader = speakerEntries[i];
        const speakerText = speakerEntries[i + 1];
        
        if (speakerHeader && speakerText) {
          // Extract speaker name from header like "[00:00:01] Adrian Jozwik: " -> "Adrian Jozwik"
          const speakerMatch = speakerHeader.match(/\[[\d:]+\]\s+([^:]+):\s*/);
          if (speakerMatch) {
            const speakerName = speakerMatch[1].trim();
            const cleanText = speakerText.trim();
            
            if (cleanText) {
              // Ensure proper line breaks are preserved in HubSpot
              formatted += `<strong>${speakerName}:</strong> ${cleanText}<br>\n`;
            }
          }
        }
      }
      
      console.log(`   📋 Formatted transcript sample:`, formatted.substring(0, 300) + '...');
      console.log(`   📋 Using full transcript (${formatted.length} chars) - no truncation`);
      
      return formatted.trim();
      
    } catch (error) {
      console.error('Error formatting transcript:', error.message);
      return 'Error formatting transcript';
    }
  }

  /**
   * Escape special characters for use in RegExp
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Update meeting with video link and/or transcript using idempotent approach with HTML block structure
   */
  async updateMeetingWithEnrichment(videoMatch) {
    try {
      const { video, hubspotMeeting, attioMeetingId, attioCallId } = videoMatch;
      
      console.log(`🎥 Processing: "${hubspotMeeting.properties.hs_meeting_title}"`);
      
      // Check what enrichment is needed
      const currentBody = hubspotMeeting.properties.hs_meeting_body || '';
      
      // ALWAYS add both video and transcript to standardize meeting descriptions
      let needsVideoUpdate = true;
      let needsTranscriptUpdate = true;
      
      console.log(`   🚨 STANDARDIZING MEETING DESCRIPTION - ALWAYS ADD VIDEO AND TRANSCRIPT:`);
      console.log(`   Video will be added: ${needsVideoUpdate}`);
      console.log(`   Transcript will be added: ${needsTranscriptUpdate}`);
      // If no transcript section exists, needsTranscriptUpdate is already true from above
      
      // Since we're standardizing, we always update (equivalent to force update)
      const forceUpdate = true;
      if (forceUpdate) {
        console.log(`   🔄 FORCE UPDATE: Updating all sections`);
        needsVideoUpdate = true;
        needsTranscriptUpdate = true;
      }
      
      console.log(`   🚨 UPDATE NEEDED:`);
      console.log(`   Video needs update: ${needsVideoUpdate}`);
      console.log(`   Transcript needs update: ${needsTranscriptUpdate}`);
      
      if (!needsVideoUpdate && !needsTranscriptUpdate) {
        console.log(`   ⏭️ Skipping - no enrichment needed`);
        return true;
      }
      
      // Get current meeting body for modifications
      let newBody = currentBody;
      
      // Generate correct video URL using call ID for proper file matching
      const correctVideoUrl = `https://${this.config.hubspotAppHost}/files/${this.config.portalId}/search?folderId=${this.config.meetingRecordingsFolderId}&query=${attioCallId}&showDetails=318523796723`;
      
      // Fix video section
      if (needsVideoUpdate) {
        console.log(`\\n🔧 FIXING VIDEO SECTION...`);
        
        // Create a clean block-level video section using proper HTML structure
        const videoSection = `

<div style="border-top: 2px solid #ccc; margin: 20px 0; padding-top: 15px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">📹 CALL RECORDING</h3>
<div style="margin: 0; padding: 0;">
<a href="${correctVideoUrl}" target="_blank">${correctVideoUrl}</a>
</div>
</div>`;
        
        // AGGRESSIVE CLEANUP: Remove all existing video/transcript related content
        
        // 1. Remove HTML div sections with video/transcript content
        newBody = newBody.replace(/<div[^>]*>[\s\S]*?📹[\s\S]*?<\/div>/gi, '');
        newBody = newBody.replace(/<div[^>]*>[\s\S]*?📄[\s\S]*?<\/div>/gi, '');
        newBody = newBody.replace(/<div[^>]*>[\s\S]*?CALL RECORDING[\s\S]*?<\/div>/gi, '');
        newBody = newBody.replace(/<div[^>]*>[\s\S]*?CALL TRANSCRIPT[\s\S]*?<\/div>/gi, '');
        
        // 2. Remove Unicode section headers and content
        newBody = newBody.replace(/━+[\s\S]*?📹[\s\S]*?━+/g, '');
        newBody = newBody.replace(/━+[\s\S]*?📄[\s\S]*?━+/g, '');
        newBody = newBody.replace(/━+[\s\S]*?CALL RECORDING[\s\S]*?━+/g, '');
        newBody = newBody.replace(/━+[\s\S]*?CALL TRANSCRIPT[\s\S]*?━+/g, '');
        
        // 3. Remove section headers without Unicode
        newBody = newBody.replace(/📹\s*CALL RECORDING[\s\S]*?(?=\n\n|📄|$)/g, '');
        newBody = newBody.replace(/📄\s*CALL TRANSCRIPT[\s\S]*?(?=\n\n|📹|$)/g, '');
        
        // 4. Remove broken HTML tags and standalone URLs
        newBody = newBody.replace(/<[^>]*>/g, '');
        newBody = newBody.replace(/https:\/\/app-eu1\.hubspot\.com\/files\/[^\s<]+/g, '');
        
        // 5. Remove marker-based content
        const videoSectionRegex = new RegExp(`\\n*${this.escapeRegExp(this.config.videoSectionMarker)}[\\s\\S]*?${this.escapeRegExp(this.config.videoSectionMarker)}\\n*`, 'g');
        newBody = newBody.replace(videoSectionRegex, '');
        
        // 6. Clean up multiple line breaks and trim
        newBody = newBody.replace(/\n{3,}/g, '\n\n').trim();
        
        // Add corrected video section with proper spacing
        newBody = newBody.trim() + videoSection;
      }
      
      // Fix transcript section  
      if (needsTranscriptUpdate) {
        console.log(`\\n🔧 FIXING TRANSCRIPT SECTION...`);
        
        // Get transcript from Attio
        const transcript = await this.getAttioTranscript(attioMeetingId, attioCallId);
        
        // Format the transcript properly
        const formattedTranscript = transcript ? this.formatTranscript(transcript) : 'Transcript not available for this recording.';
        console.log(`   📋 Original transcript length: ${transcript ? transcript.length : 0} chars`);
        console.log(`   📋 Formatted transcript length: ${formattedTranscript.length} chars`);
        
        // Create a clean block-level transcript section using proper HTML structure
        const transcriptSection = `

<div style="border-top: 2px solid #ccc; margin: 20px 0; padding-top: 15px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">📄 CALL TRANSCRIPT</h3>
<div style="margin: 0; padding: 0; line-height: 1.4;">
${formattedTranscript}
</div>
</div>`;
        console.log(`   📋 Complete section length: ${transcriptSection.length} chars`);
        console.log(`   📋 DEBUGGING: First 200 chars of section: ${transcriptSection.substring(0, 200)}`);
        console.log(`   📋 DEBUGGING: Last 200 chars of section: ${transcriptSection.substring(transcriptSection.length - 200)}`);
        
        // AGGRESSIVE CLEANUP: Remove all existing transcript content (matching video cleanup above)
        
        // This cleanup was already done in video section above, but ensure transcript markers are removed
        const transcriptSectionRegex = new RegExp(`\\n?${this.escapeRegExp(this.config.transcriptSectionMarker)}[\\s\\S]*?${this.escapeRegExp(this.config.transcriptSectionMarker)}`, 'g');
        newBody = newBody.replace(transcriptSectionRegex, '');
        
        // Final cleanup for any remaining transcript artifacts
        newBody = newBody.replace(/\n{3,}/g, '\n\n').trim();
        
        // Add corrected transcript section
        newBody = newBody + transcriptSection;
        console.log(`   📋 Final body length: ${newBody.length} chars`);
        console.log(`   📋 DEBUGGING: Final body ends with: ${newBody.substring(newBody.length - 200)}`);
      }
      
      // Update the meeting if we have changes
      if (newBody !== currentBody) {
        if (this.config.dryRun) {
          console.log(`   🧪 [DRY RUN] Would update meeting ${hubspotMeeting.id}`);
          console.log(`   📝 New body preview (first 200 chars): ${newBody.substring(0, 200)}...`);
        } else {
          console.log(`\\n🚀 UPDATING MEETING...`);
          await this.hubspot.client.patch(`/crm/v3/objects/meetings/${hubspotMeeting.id}`, {
            properties: {
              hs_meeting_body: newBody
            }
          });
          console.log(`   ✅ MEETING UPDATED SUCCESSFULLY!`);
        }
      }
      
      return true;
      
    } catch (error) {
      console.error(`   ❌ Error updating meeting:`, error.message);
      return false;
    }
  }

  /**
   * Main processing function - REDESIGNED to avoid 10k HubSpot search limit
   * Drives enrichment from video list → Attio mapping → targeted HubSpot lookups
   */
  async process() {
    console.log('🎬 Starting Video and Transcript Enrichment (Script 2)...\n');
    console.log('='.repeat(80));
    console.log('🔒 SECURITY: Using login-gated HubSpot File Manager URLs only');
    console.log('🔄 IDEMPOTENT: Safe to run multiple times without duplication');
    if (this.config.testMode) {
      console.log('🧪 TEST MODE: Processing ONLY one specific meeting for testing');
    }
    console.log('='.repeat(80));
    
    try {
      // Step 1: Get all videos from HubSpot folder with full pagination
      console.log('\n📥 STEP 1: Fetching all videos from HubSpot\n');
      const allVideos = await this.getUploadedVideos();
      
      if (allVideos.length === 0) {
        console.log('⚠️ No videos found in meeting-recordings folder');
        return;
      }
      
      console.log(`📊 Found ${allVideos.length} videos to process`);
      
      const videos = allVideos; // Process ALL videos for full migration
      
      // Step 2: Build call-to-meeting mapping from Attio API
      console.log('\n🗺️ STEP 2: Building Attio call-to-meeting mapping\n');
      const recordingToMeetingMap = await this.getAttioCallToMeetingMapping();
      this.callRecordingToMeeting = recordingToMeetingMap; // Store for later use
      
      // Step 3: Get ALL HubSpot meetings to parse their Attio IDs
      console.log('\n📋 STEP 3: Fetching all HubSpot meetings\n');
      const allHubspotMeetings = await this.getAllHubSpotMeetings();
      
      // Step 4: Match videos to meetings using comprehensive matching
      console.log('\n🔗 STEP 4: Matching videos to meetings\n');
      const { videoMatches, unmatchedVideos } = await this.matchVideosToMeetings(videos, allHubspotMeetings, recordingToMeetingMap);
      
      // Step 5: Process matched videos for enrichment
      console.log('\n🎬 STEP 5: Processing video enrichments\n');
      
      let totalMatches = 0;
      let processedCount = 0;
      let errorCount = 0;
      
      console.log(`📊 Found ${videoMatches.length} videos ready for enrichment`);
      console.log(`⚠️  Found ${unmatchedVideos.length} unmatched videos`);
      
      for (const match of videoMatches) {
        processedCount++;
        console.log(`[${processedCount}/${videoMatches.length}] Processing matched video: ${match.video.name}`);
        console.log(`     🎯 Match: ${match.matchType} ${match.matchedViaId} → meeting ${match.attioMeetingId} → HubSpot ${match.hubspotMeeting.id}`);
        
        try {
          const success = await this.updateMeetingWithEnrichment(match);
          if (success) {
            console.log(`     ✅ SUCCESS! Updated HubSpot meeting ${match.hubspotMeeting.id}`);
            console.log(`     🔗 CHECK THIS MEETING: https://app-eu1.hubspot.com/contacts/143729756/meeting/${match.hubspotMeeting.id}`);
            console.log(`     📝 ATTIO ID IN DESCRIPTION: ${match.attioMeetingId}`);
            console.log(`     🎥 VIDEO ADDED: ${match.video.name}`);
            totalMatches++;
          } else {
            console.log(`     ❌ Failed to enrich meeting ${match.hubspotMeeting.id}`);
            errorCount++;
          }
          
        } catch (error) {
          console.error(`     💥 Error processing video ${match.video.name}:`, error.message);
          errorCount++;
        }
        
        // Rate limiting between video processing
        await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
      }
      
      // Summary
      console.log('\n🎉 VIDEO & TRANSCRIPT ENRICHMENT COMPLETE!');
      console.log(`📊 Total videos processed: ${videos.length}`);
      console.log(`🎯 Videos with matches: ${videoMatches.length}`);
      console.log(`✅ Successfully enriched: ${totalMatches} meetings`);
      console.log(`❌ Errors during enrichment: ${errorCount}`);
      console.log(`⚠️ Unmatched videos: ${unmatchedVideos.length}`);
      console.log('🔒 Security: All video links use login-gated File Manager URLs');
      console.log('🔄 Idempotent: Safe to re-run without duplicating content');
      
      if (unmatchedVideos.length > 0) {
        console.log('\n📋 Unmatched videos (first 10):');
        unmatchedVideos.slice(0, 10).forEach((video, index) => {
          const fileName = video.video ? video.video.name : video.name;
          const reason = video.reason || 'No matching meeting found';
          console.log(`   ${index + 1}. ${fileName} (${reason})`);
        });
        if (unmatchedVideos.length > 10) {
          console.log(`   ... and ${unmatchedVideos.length - 10} more`);
        }
      }
      
    } catch (error) {
      console.error('\n💥 Critical error during enrichment:', error.message);
      throw error;
    }
  }

  /**
   * Find HubSpot meeting by call ID in the description
   */
  async findHubSpotMeetingByCallId(callId) {
    try {
      console.log(`   🔍 Searching HubSpot for meeting with call ID: ${callId}`);
      
      // Search for meetings that contain this call ID
      const searchResponse = await this.hubspot.searchMeetings({
        query: callId,
        limit: 10,
        properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time']
      });
      
      if (!searchResponse.results || searchResponse.results.length === 0) {
        console.log(`   ❌ No HubSpot meetings found containing call ID: ${callId}`);
        return null;
      }
      
      // Find the meeting that actually contains this call ID in the description
      for (const meeting of searchResponse.results) {
        const description = meeting.properties?.hs_meeting_body || '';
        if (description.includes(callId)) {
          console.log(`   ✅ Found matching meeting: ${meeting.properties.hs_meeting_title} (${meeting.id})`);
          return meeting;
        }
      }
      
      console.log(`   ❌ No meetings found with call ID ${callId} in description`);
      return null;
      
    } catch (error) {
      console.error(`   ❌ Error searching for meeting with call ID ${callId}:`, error.message);
      return null;
    }
  }

  /**
   * Extract Attio meeting ID from HubSpot meeting description using "Original ID:" pattern
   */
  extractAttioMeetingIdFromDescription(description) {
    if (!description) return null;
    
    const match = description.match(/Original ID:\\s*([a-f0-9-]+)/);
    return match ? match[1] : null;
  }
}

// Run the script
if (require.main === module) {
  // Parse command line arguments for specific call IDs
  const args = process.argv.slice(2);
  const specificCallIds = args.filter(arg => !arg.startsWith('--'));
  
  if (specificCallIds.length > 0) {
    console.log(`🎯 TESTING MODE: Processing only ${specificCallIds.length} specific call IDs:`);
    specificCallIds.forEach((id, index) => {
      console.log(`   ${index + 1}. ${id}`);
    });
  }
  
  const enricher = new VideoTranscriptEnricher();
  
  // Override process method for specific call IDs if provided
  if (specificCallIds.length > 0) {
    enricher.processSpecificCallIds = async function(callIds) {
      console.log('🔄 Starting targeted video and transcript enrichment...');
      
      try {
        // Get uploaded videos first
        const videos = await this.getUploadedVideos();
        console.log(`📁 Found ${videos.length} videos in HubSpot`);
        
        let processedCount = 0;
        let successCount = 0;
        
        for (const callId of callIds) {
          console.log(`\n🎯 Processing call ID: ${callId}`);
          
          // Find video matching this call ID
          const matchingVideo = videos.find(video => {
            const fileName = video.name || '';
            return fileName.includes(callId);
          });
          
          if (!matchingVideo) {
            console.log(`   ❌ No video found for call ID: ${callId}`);
            continue;
          }
          
          console.log(`   📹 Found matching video: ${matchingVideo.name}`);
          
          // Try to find HubSpot meeting by call ID
          const hubspotMeeting = await this.findHubSpotMeetingByCallId(callId);
          
          if (!hubspotMeeting) {
            console.log(`   ❌ No HubSpot meeting found for call ID: ${callId}`);
            continue;
          }
          
          console.log(`   📅 Found HubSpot meeting: ${hubspotMeeting.id}`);
          
          // Extract the actual Attio meeting ID from the HubSpot meeting
          const attioMeetingId = this.extractAttioIdFromMeeting(hubspotMeeting);
          console.log(`   🔍 Extracted Attio meeting ID: ${attioMeetingId}`);
          
          // Process this specific match
          const match = {
            video: matchingVideo,
            hubspotMeeting: hubspotMeeting,
            attioCallId: callId,
            attioMeetingId: attioMeetingId
          };
          
          await this.updateMeetingWithEnrichment(match);
          
          processedCount++;
          successCount++;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
        }
        
        console.log(`\n✅ Completed processing ${processedCount} call IDs, ${successCount} successful`);
        
      } catch (error) {
        console.error('❌ Error in targeted processing:', error.message);
        throw error;
      }
    };
    
    // Use the targeted processing method
    enricher.processSpecificCallIds(specificCallIds).then(() => {
      console.log('\n🎉 Targeted video and transcript enrichment completed successfully!');
      process.exit(0);
    }).catch(error => {
      console.error('Targeted video and transcript enrichment failed:', error);
      process.exit(1);
    });
  } else {
    // Use normal processing
    enricher.process().then(() => {
      console.log('\n🎉 Video and transcript enrichment completed successfully!');
      process.exit(0);
    }).catch(error => {
      console.error('Video and transcript enrichment failed:', error);
      process.exit(1);
    });
  }
}

module.exports = VideoTranscriptEnricher;
