const HubSpotClient = require('./clients/HubSpotClient');
const AttioClient = require('./clients/AttioClient');

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
    this.hubspot = new HubSpotClient();
    this.attio = new AttioClient();
    
    // Configuration for secure File Manager URLs
    this.config = {
      // HubSpot portal configuration
      portalId: process.env.HUBSPOT_PORTAL_ID || '143729756',
      hubspotAppHost: process.env.HUBSPOT_APP_HOST || 'app-eu1.hubspot.com',
      
      // Meeting recordings folder in HubSpot File Manager
      meetingRecordingsFolderId: process.env.MEETING_RECORDINGS_FOLDER_ID || '313172012232',
      
      // Content markers for idempotent updates
      videoSectionMarker: '=== VIDEO ===',
      transcriptSectionMarker: '=== TRANSCRIPT ===',
      
      // Rate limiting
      apiDelay: 200, // ms between API calls
      
      // Dry run mode
      dryRun: process.env.DRY_RUN === 'true'
    };
    
    console.log('🔧 Configuration:');
    console.log(`   Portal ID: ${this.config.portalId}`);
    console.log(`   App Host: ${this.config.hubspotAppHost}`);
    console.log(`   Folder ID: ${this.config.meetingRecordingsFolderId}`);
    console.log(`   Dry Run: ${this.config.dryRun}`);
  }

  /**
   * Generate secure, login-gated HubSpot File Manager details URL
   * 
   * This creates a URL that requires user authentication to the HubSpot portal.
   * The URL shows the file details page within the File Manager, not a direct download.
   * 
   * Format: https://app-eu1.hubspot.com/files/{PORTAL_ID}/?folderId={FOLDER_ID}&showDetails={FILE_ID}
   * 
   * Security: This URL is login-gated and cannot be accessed without portal authentication.
   * It will redirect to login if the user is not authenticated to the portal.
   */
  generateSecureFileManagerUrl(fileId) {
    const baseUrl = `https://${this.config.hubspotAppHost}/files/${this.config.portalId}`;
    const params = new URLSearchParams({
      folderId: this.config.meetingRecordingsFolderId,
      showDetails: fileId
    });
    
    const secureUrl = `${baseUrl}/?${params.toString()}`;
    
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
          folder_id: this.config.meetingRecordingsFolderId,
          limit: 100
        };
        
        if (after) {
          params.after = after;
        }
        
        const response = await this.hubspot.client.get('/files/v3/files', { params });
        const videos = response.data.results
          .filter(file => {
            const isVideo = file.type === 'MOVIE' && file.extension?.toLowerCase() === 'mp4';
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
            // SECURITY: Use login-gated File Manager details URL, not public CDN
            secureUrl: this.generateSecureFileManagerUrl(file.id)
          }));
        
        allVideos = allVideos.concat(videos);
        
        after = response.data.paging?.next?.after;
        pageNum++;
        
        // Rate limiting
        if (after) {
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
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
      
      // Get all meetings from Attio
      do {
        console.log(`   📄 Fetching meetings page ${pageNum}...`);
        
        const params = { limit: 500 };
        if (cursor) {
          params.cursor = cursor;
        }
        
        const response = await this.attio.client.get('/v2/meetings', { params });
        const meetings = response.data.data || [];
        
        allMeetings = allMeetings.concat(meetings);
        cursor = response.data.next_cursor;
        pageNum++;
        
        // Rate limiting
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
        }
      } while (cursor);
      
      console.log(`   📊 Fetched ${allMeetings.length} meetings from Attio`);
      
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
   * Get all HubSpot meetings with Attio IDs that were imported by Script 1
   */
  async getHubSpotMeetingsWithAttioIds() {
    console.log('📥 Fetching HubSpot meetings with Attio IDs...');
    
    try {
      // Use search API to find meetings with Attio IDs - much more efficient than paginating all meetings
      const response = await this.hubspot.client.post('/crm/v3/objects/meetings/search', {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'hs_meeting_body',
                operator: 'CONTAINS_TOKEN',
                value: 'Meeting imported from Attio'
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
        limit: 200 // HubSpot max limit for search API
      });
      
      const meetings = response.data.results || [];
      console.log(`   ✅ Found ${meetings.length} meetings with Attio IDs`);
      return meetings;
      
    } catch (error) {
      console.error('❌ Error fetching HubSpot meetings:', error.message);
      throw error;
    }
  }

  /**
   * Extract call recording ID from video filename
   * Supports multiple formats:
   * - {meeting_id}_{call_recording_id}.mp4 (new format)
   * - {call_recording_id}.mp4 (direct format)
   */
  extractCallRecordingIdFromFilename(filename) {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.(mp4|mov|avi)$/i, '');
    
    // Skip obvious HubSpot format videos
    if (nameWithoutExt.startsWith('call-recording-')) {
      return null;
    }
    
    // Check for UUID format (Attio uses UUIDs for IDs)
    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    
    // Try format: {meeting_id}_{call_recording_id}
    const parts = nameWithoutExt.split('_');
    if (parts.length >= 2) {
      const [meetingId, callRecordingId] = parts;
      if (uuidRegex.test(meetingId) && uuidRegex.test(callRecordingId)) {
        return callRecordingId;
      }
    }
    
    // Try direct format: {call_recording_id}
    if (uuidRegex.test(nameWithoutExt)) {
      return nameWithoutExt;
    }
    
    return null;
  }

  /**
   * Extract Attio meeting ID from HubSpot meeting description using "Original ID:" pattern
   */
  extractAttioIdFromMeeting(meeting) {
    const description = meeting.properties?.hs_meeting_body || '';
    const attioIdMatch = description.match(/Meeting imported from Attio\. Original ID: ([a-f0-9\-]{36})/);
    return attioIdMatch ? attioIdMatch[1] : null;
  }

  /**
   * Match videos to meetings using API-based approach
   */
  async matchVideosToMeetings(videos, meetings, recordingToMeetingMap) {
    console.log('🔗 Matching videos to meetings using API-based lookup...');
    
    // Create map of HubSpot meetings by their Attio ID for quick lookup
    const meetingsByAttioId = new Map();
    meetings.forEach(meeting => {
      const attioId = this.extractAttioIdFromMeeting(meeting);
      if (attioId) {
        meetingsByAttioId.set(attioId, meeting);
      }
    });
    
    console.log(`   📄 Found ${meetingsByAttioId.size} meetings with Attio IDs`);
    
    const videoMatches = [];
    const unmatchedVideos = [];
    let attioFormatCount = 0;
    
    videos.forEach(video => {
      console.log(`   🔍 Checking video: "${video.name}"`);
      
      // Extract call_recording_id from filename
      const callRecordingId = this.extractCallRecordingIdFromFilename(video.name);
      
      if (callRecordingId) {
        attioFormatCount++;
        console.log(`   ✅ Found call recording ID: ${callRecordingId}`);
        
        // Use API mapping to find the meeting ID
        const attioMeetingId = recordingToMeetingMap.get(callRecordingId);
        
        if (attioMeetingId) {
          console.log(`   🔗 API mapped to meeting: ${attioMeetingId}`);
          
          // Find the HubSpot meeting with this Attio ID
          const meeting = meetingsByAttioId.get(attioMeetingId);
          
          if (meeting) {
            console.log(
              `   🎯 FINAL MATCH: video="${video.name}" ` +
              `callRecordingId=${callRecordingId} ` +
              `attioMeetingId=${attioMeetingId} ` +
              `hubspotMeetingId=${meeting.id} ` +
              `title="${meeting.properties.hs_meeting_title}"`
            );
            
            // Check if meeting already has video/transcript sections (idempotency check)
            const hasVideoAlready = this.hasVideoSection(meeting.properties.hs_meeting_body);
            const hasTranscriptAlready = this.hasTranscriptSection(meeting.properties.hs_meeting_body);
            
            if (!hasVideoAlready || !hasTranscriptAlready) {
              videoMatches.push({
                video,
                meeting,
                attioMeetingId,
                attioCallId: callRecordingId,
                needsVideo: !hasVideoAlready,
                needsTranscript: !hasTranscriptAlready
              });
            } else {
              console.log(`   ⏭️ Skipping - meeting already has complete video and transcript sections`);
            }
          } else {
            console.log(`   ❌ Meeting ${attioMeetingId} not found in HubSpot (may need migration)`);
            unmatchedVideos.push(video);
          }
        } else {
          console.log(`   ❌ No meeting mapping found for recording: ${callRecordingId}`);
          unmatchedVideos.push(video);
        }
      } else {
        console.log(`   ⏭️ Skipping non-Attio format: ${video.name}`);
        unmatchedVideos.push(video);
      }
    });
    
    console.log(`   ✅ Found ${attioFormatCount} Attio-format videos`);
    console.log(`   ✅ Found ${videoMatches.length} videos needing enrichment`);
    console.log(`   ⚠️ Unmatched/non-Attio videos: ${unmatchedVideos.length}`);
    
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
   * Get transcript from Attio
   */
  async getAttioTranscript(attioMeetingId, callRecordingId) {
    try {
      console.log(`   📄 Getting transcript for meeting ${attioMeetingId}, recording ${callRecordingId}...`);
      
      // Fetch transcript from Attio using the correct endpoint
      const response = await this.attio.client.get(`/v2/meetings/${attioMeetingId}/call_recordings/${callRecordingId}/transcript`);
      const transcript = response.data;
      
      if (transcript && transcript.length > 0) {
        return this.formatTranscript(transcript);
      }
      
      return null;
    } catch (error) {
      console.error(`   ❌ Error getting transcript for ${attioMeetingId}/${callRecordingId}:`, error.message);
      if (error.response?.status === 404) {
        console.log(`   💡 Transcript not available for this recording`);
      }
      return null;
    }
  }

  /**
   * Format transcript with proper speaker identification
   */
  formatTranscript(rawTranscript) {
    try {
      if (typeof rawTranscript === 'string') {
        return rawTranscript
          .replace(/<[^>]*>/g, '') 
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim();
      }
      
      if (Array.isArray(rawTranscript)) {
        const speakerSegments = new Map();
        let currentSpeaker = null;
        let currentText = [];
        
        rawTranscript.forEach(segment => {
          const speaker = segment.speaker || segment.name || 'Unknown Speaker';
          const text = (segment.text || segment.content || segment.word || '').trim();
          
          if (!text) return;
          
          if (speaker !== currentSpeaker) {
            // Finish previous speaker's segment
            if (currentSpeaker && currentText.length > 0) {
              if (!speakerSegments.has(currentSpeaker)) {
                speakerSegments.set(currentSpeaker, []);
              }
              speakerSegments.get(currentSpeaker).push(currentText.join(' '));
            }
            
            // Start new speaker
            currentSpeaker = speaker;
            currentText = [text];
          } else {
            currentText.push(text);
          }
        });
        
        // Don't forget the last speaker
        if (currentSpeaker && currentText.length > 0) {
          if (!speakerSegments.has(currentSpeaker)) {
            speakerSegments.set(currentSpeaker, []);
          }
          speakerSegments.get(currentSpeaker).push(currentText.join(' '));
        }
        
        // Format as speaker sections
        let formatted = '';
        speakerSegments.forEach((textSegments, speaker) => {
          formatted += `**${speaker}:** ${textSegments.join(' ')}\n\n`;
        });
        
        return formatted.trim();
      }
      
      return 'Transcript format not supported';
      
    } catch (error) {
      console.error('Error formatting transcript:', error.message);
      return 'Error formatting transcript';
    }
  }

  /**
   * Update meeting with video link and/or transcript using idempotent approach
   */
  async updateMeetingWithEnrichment(videoMatch) {
    try {
      const { video, meeting, attioMeetingId, attioCallId, needsVideo, needsTranscript } = videoMatch;
      
      console.log(`🎥 Processing: "${meeting.properties.hs_meeting_title}"`);
      console.log(`   📋 Needs video: ${needsVideo}, Needs transcript: ${needsTranscript}`);
      
      if (!needsVideo && !needsTranscript) {
        console.log(`   ⏭️ Skipping - no enrichment needed`);
        return true;
      }
      
      // Get current meeting body
      let currentBody = meeting.properties.hs_meeting_body || '';
      let newBody = currentBody;
      
      // Add video section if needed
      if (needsVideo) {
        console.log(`   🎥 Adding video section...`);
        const videoSection = `\n\n${this.config.videoSectionMarker}\nCall recording: ${video.secureUrl}\n${this.config.videoSectionMarker}`;
        newBody = currentBody + videoSection;
      }
      
      // Add transcript section if needed
      if (needsTranscript) {
        console.log(`   📄 Adding transcript section...`);
        
        // Get transcript from Attio
        const transcript = await this.getAttioTranscript(attioMeetingId, attioCallId);
        
        const transcriptContent = transcript || 'Transcript not available for this recording.';
        const transcriptSection = `\n\n${this.config.transcriptSectionMarker}\n${transcriptContent}\n${this.config.transcriptSectionMarker}`;
        
        newBody = newBody + transcriptSection;
      }
      
      // Update the meeting if we have changes
      if (newBody !== currentBody) {
        if (this.config.dryRun) {
          console.log(`   🧪 [DRY RUN] Would update meeting ${meeting.id}`);
          console.log(`   📝 New body preview (first 200 chars): ${newBody.substring(0, 200)}...`);
        } else {
          await this.hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.id}`, {
            properties: {
              hs_meeting_body: newBody
            }
          });
          console.log(`   ✅ Updated meeting ${meeting.id} with enrichment`);
        }
      }
      
      return true;
      
    } catch (error) {
      console.error(`   ❌ Error updating meeting:`, error.message);
      return false;
    }
  }

  /**
   * Main processing function
   */
  async process() {
    console.log('🎬 Starting Video and Transcript Enrichment (Script 2)...\n');
    console.log('='.repeat(80));
    console.log('🔒 SECURITY: Using login-gated HubSpot File Manager URLs only');
    console.log('🔄 IDEMPOTENT: Safe to run multiple times without duplication');
    console.log('='.repeat(80));
    
    try {
      // Step 1: Get all videos and meetings
      console.log('\n📥 STEP 1: Fetching videos and meetings\n');
      
      const [videos, meetings] = await Promise.all([
        this.getUploadedVideos(),
        this.getHubSpotMeetingsWithAttioIds()
      ]);
      
      if (videos.length === 0) {
        console.log('⚠️ No videos found in meeting-recordings folder');
        return;
      }
      
      if (meetings.length === 0) {
        console.log('⚠️ No meetings with Attio IDs found in HubSpot');
        return;
      }
      
      // Step 2: Build recording-to-meeting lookup map from Attio API
      console.log('\n🗺️ STEP 2: Building API-based lookup map\n');
      const recordingToMeetingMap = await this.buildRecordingToMeetingMap();
      
      // Step 3: Match videos to meetings
      console.log('\n🔗 STEP 3: Matching videos to meetings\n');
      
      const { videoMatches, unmatchedVideos } = await this.matchVideosToMeetings(videos, meetings, recordingToMeetingMap);
      
      if (videoMatches.length === 0) {
        console.log('✅ No meetings need enrichment - all videos and transcripts are already added!');
        return;
      }
      
      // Step 4: Process each video match
      console.log(`\n📝 STEP 4: Enriching ${videoMatches.length} meetings\n`);
      
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < videoMatches.length; i++) {
        const videoMatch = videoMatches[i];
        console.log(`[${i + 1}/${videoMatches.length}] Processing enrichment...`);
        
        const success = await this.updateMeetingWithEnrichment(videoMatch);
        
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, this.config.apiDelay));
      }
      
      // Summary
      console.log(`\n🎉 VIDEO & TRANSCRIPT ENRICHMENT COMPLETE!`);
      console.log(`✅ Successfully enriched: ${successCount} meetings`);
      console.log(`❌ Errors: ${errorCount} meetings`);
      console.log(`⚠️ Unmatched videos: ${unmatchedVideos.length}`);
      console.log(`🔒 Security: All video links use login-gated File Manager URLs`);
      console.log(`🔄 Idempotent: Safe to re-run without duplicating content`);
      
      if (unmatchedVideos.length > 0) {
        console.log('\n📋 Unmatched videos (first 5):');
        unmatchedVideos.slice(0, 5).forEach(video => {
          console.log(`   - ${video.name}`);
        });
        if (unmatchedVideos.length > 5) {
          console.log(`   ... and ${unmatchedVideos.length - 5} more`);
        }
      }
      
    } catch (error) {
      console.error('\n💥 Critical error during enrichment:', error.message);
      throw error;
    }
  }
}

// Run the script
if (require.main === module) {
  const enricher = new VideoTranscriptEnricher();
  enricher.process().then(() => {
    console.log('\n🎉 Video and transcript enrichment completed successfully!');
    process.exit(0);
  }).catch(error => {
    console.error('Video and transcript enrichment failed:', error);
    process.exit(1);
  });
}

module.exports = VideoTranscriptEnricher;