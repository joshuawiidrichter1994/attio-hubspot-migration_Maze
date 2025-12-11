/**
 * Script 2: Video Matching and Transcript Addition
 * 
 * This script:
 * 1. Gets all uploaded videos from HubSpot
 * 2. Gets all meetings from HubSpot that have Attio IDs
 * 3. Matches videos to meetings based on Attio call ID in filename
 * 4. Adds video link and transcript to meeting descriptions
 */

const HubSpotAPI = require('./utils/hubspot-api');
const AttioAPI = require('./utils/attio-api');

class VideoMatcher {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.attio = new AttioAPI();
  }

  /**
   * Get all uploaded videos from HubSpot
   */
  async getUploadedVideos() {
    console.log('📥 Fetching uploaded videos from HubSpot...');
    
    try {
      let allVideos = [];
      let after = undefined;
      
      do {
        const params = {
          limit: 100,
          folder_id: 313172012232, // meeting-recordings folder
          ...(after && { offset: after })
        };
        
        const response = await this.hubspot.client.get('/filemanager/api/v3/files', { params });
        
        // Try both 'results' and 'objects' as the API might use either
        const fileList = response.data.results || response.data.objects || [];
        
        const videos = fileList.filter(file => 
          file.extension === 'mp4' && file.type === 'MOVIE'
        ) || [];
        
        allVideos.push(...videos);
        
        // Handle pagination - check for next offset
        const hasMore = fileList.length === params.limit && response.data.total > (response.data.offset || 0) + fileList.length;
        if (hasMore) {
          after = (response.data.offset || 0) + fileList.length;
        } else {
          after = undefined;
        }
        
      } while (after);
      
      console.log(`   ✅ Found ${allVideos.length} uploaded videos`);
      return allVideos;
      
    } catch (error) {
      console.error('❌ Error fetching uploaded videos:', error.message);
      throw error;
    }
  }

  /**
   * Build a lookup map from call_recording_id to meeting_id using Attio API
   */
  async buildRecordingToMeetingMap() {
    console.log('🗺️ Building recording-to-meeting lookup map using Attio API...');
    
    try {
      // Get all meetings from Attio
      const attioMeetings = await this.attio.getAllMeetings();
      console.log(`   📊 Found ${attioMeetings.length} meetings in Attio`);
      
      const recordingMap = new Map();
      let meetingsWithRecordings = 0;
      let totalRecordings = 0;
      
      // For each meeting, get its call recordings
      for (const meeting of attioMeetings) {
        const meetingId = meeting.id?.meeting_id || meeting.id;
        if (!meetingId) continue;
        
        try {
          const recordings = await this.attio.getCallRecordingsForMeeting(meetingId);
          
          if (recordings.length > 0) {
            meetingsWithRecordings++;
            totalRecordings += recordings.length;
            
            recordings.forEach(recording => {
              const callRecordingId = recording.id?.call_recording_id;
              if (callRecordingId) {
                recordingMap.set(callRecordingId, meetingId);
                console.log(`   📝 Mapping: ${callRecordingId} → ${meetingId}`);
              }
            });
          }
          
          // Rate limiting to avoid overwhelming API
          await new Promise(resolve => setTimeout(resolve, 100));
          
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
   * Get all HubSpot meetings with Attio IDs
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
   * Match videos to meetings using the new API-based approach
   */
  async matchVideosToMeetingsNew(videos, meetings, recordingToMeetingMap) {
    console.log('🔗 Matching videos to meetings using API-based lookup...');
    
    // Create map of HubSpot meetings by their Attio ID for quick lookup
    const meetingsByAttioId = new Map();
    meetings.forEach(meeting => {
      const attioId = this.extractAttioIdFromMeeting(meeting);
      if (attioId) {
        meetingsByAttioId.set(attioId, meeting);
      }
    });
    
    console.log(`   📄 All meeting Attio IDs found in HubSpot:`);
    Array.from(meetingsByAttioId.keys()).forEach((id, index) => {
      console.log(`      ${index + 1}. ${id}`);
    });
    
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
            
            // Check if meeting already has video info
            const hasVideoAlready = meeting.properties.hs_meeting_body && 
                                   meeting.properties.hs_meeting_body.includes('Call recording:');
            
            if (!hasVideoAlready) {
              videoMatches.push({
                video,
                meeting,
                attioMeetingId,
                attioCallId: callRecordingId // Now this is the call_recording_id
              });
            } else {
              console.log(`   ⏭️ Skipping - meeting already has video attached`);
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
    console.log(`   ✅ Found ${videoMatches.length} videos to match with meetings`);
    console.log(`   ⚠️ Unmatched/non-Attio videos: ${unmatchedVideos.length}`);
    
    return { videoMatches, unmatchedVideos };
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
   * Extract Attio meeting ID from HubSpot meeting description
   */
  extractAttioIdFromMeeting(meeting) {
    const description = meeting.properties?.hs_meeting_body || '';
    const attioIdMatch = description.match(/Meeting imported from Attio\. Original ID: ([a-f0-9\-]{36})/);
    return attioIdMatch ? attioIdMatch[1] : null;
  }

  /**
   * Match videos to meetings using the old filename-based approach (fallback) based on Attio call ID in filename
   */
  matchVideosToMeetings(videos, meetings) {
    console.log('🔗 Matching videos to meetings...');
    
    const meetingsByAttioId = new Map();
    meetings.forEach(meeting => {
      const description = meeting.properties.hs_meeting_body || '';
      const attioIdMatch = description.match(/Meeting imported from Attio\. Original ID: ([a-f0-9\-]{36})/);
      if (attioIdMatch) {
        const attioId = attioIdMatch[1];
        meetingsByAttioId.set(attioId, meeting);
      }
    });
    
    console.log(`   📋 Found ${meetingsByAttioId.size} meetings with extracted Attio IDs`);
    
    // Debug: Show first 10 Attio IDs from meetings
    const meetingAttioIds = Array.from(meetingsByAttioId.keys());
    console.log(`   🔍 Sample meeting Attio IDs:`, meetingAttioIds.slice(0, 10));
    
    // Show all meeting IDs for comparison
    console.log(`   📄 All meeting Attio IDs found in HubSpot:`)
    meetingAttioIds.forEach((id, index) => {
      console.log(`      ${index + 1}. ${id}`);
    });
    
    // Debug: Show video meeting IDs we found
    const videoAttioIds = [];
    videos.forEach(video => {
      const filename = video.name.replace(/\.(mp4|mov|avi|mkv)$/i, '');
      
      // Check for Attio format: {meeting_id}_{call_id}
      const parts = filename.split('_');
      if (parts.length === 2) {
        const [meetingId, callId] = parts;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(meetingId) && uuidRegex.test(callId)) {
          videoAttioIds.push(meetingId);
          
          if (meetingsByAttioId.has(meetingId)) {
            console.log(`   🎯 MATCH FOUND for Attio ID: ${meetingId}`);
          }
        }
      }
    });
    
    console.log(`   ✅ Found ${videoAttioIds.length} Attio-format videos`);
    console.log(`   🔍 Sample video Attio IDs:`, [...new Set(videoAttioIds)].slice(0, 10));
    
    console.log(`\n   📊 COMPARISON SUMMARY:`);
    console.log(`   📁 Videos with Attio format: ${videoAttioIds.length}`);
    console.log(`   🏢 Meetings with Attio IDs: ${meetingsByAttioId.size}`);
    console.log(`   🎯 Matching IDs found: ${meetingsByAttioId.size > 0 && videoAttioIds.length > 0 ? 'Checking...' : 'None'}`);
    
    const videoMatches = [];
    const unmatchedVideos = [];
    let attioFormatCount = 0;
    
    videos.forEach(video => {
      console.log(`   🔍 Checking video: "${video.name}"`);
      
      // Check if this is an Attio-formatted video: {attio_meeting_id}_{attio_call_id}
      const filenameParts = video.name.split('_');
      
      if (filenameParts.length >= 2 && !video.name.startsWith('call-recording-')) {
        console.log(`   📝 Filename parts: [${filenameParts.slice(0, 2).join(', ')}]`);
        
        // This looks like an Attio format: meeting_id_call_id
        const meetingId = filenameParts[0];
        const callId = filenameParts[1];
        
        // Validate UUID format
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (uuidRegex.test(meetingId) && uuidRegex.test(callId)) {
          attioFormatCount++;
          console.log(`   ✅ Valid Attio format: ${meetingId} / ${callId}`);
          
          const meeting = meetingsByAttioId.get(meetingId);
          
          if (meeting) {
            // Check if meeting already has video info
            const hasVideoAlready = meeting.properties.hs_meeting_body && 
                                   meeting.properties.hs_meeting_body.includes('Call recording:');
            
            if (!hasVideoAlready) {
              videoMatches.push({
                video,
                meeting,
                attioMeetingId: meetingId,
                attioCallId: callId
              });
              console.log(`   ✅ Matched video "${video.name}" to meeting "${meeting.properties.hs_meeting_title}"`);
            } else {
              console.log(`   ⏭️ Meeting "${meeting.properties.hs_meeting_title}" already has video info, skipping`);
            }
          } else {
            console.log(`   ❌ No meeting found for Attio ID: ${meetingId}`);
            unmatchedVideos.push(video);
          }
        } else {
          console.log(`   ❌ Invalid UUID format for: ${meetingId} / ${callId}`);
          unmatchedVideos.push(video);
        }
      } else {
        console.log(`   ⏭️ Skipping non-Attio format: ${video.name}`);
        unmatchedVideos.push(video);
      }
    });
    
    console.log(`   ✅ Found ${attioFormatCount} Attio-format videos`);
    console.log(`   ✅ Found ${videoMatches.length} Attio videos to match with meetings`);
    console.log(`   ⚠️ Unmatched/non-Attio videos: ${unmatchedVideos.length}`);
    
    if (videoMatches.length > 0) {
      console.log(`\n   🎯 Video matches:`);
      videoMatches.forEach((match, index) => {
        console.log(`      ${index + 1}. ${match.video.name} → "${match.meeting.properties.hs_meeting_title}"`);
      });
    }
    
    return { videoMatches, unmatchedVideos };
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
   * Format transcript to proper sentences with speakers
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
   * Update meeting with video link and transcript
   */
  async updateMeetingWithVideo(videoMatch) {
    try {
      const { video, meeting, attioMeetingId, attioCallId } = videoMatch;
      
      console.log(`🎥 Processing: "${meeting.properties.hs_meeting_title}"`);
      
      // Get video URL
      const videoUrl = video.url || `https://app.hubspot.com/files/${video.id}`;
      
      // Get transcript from Attio
      const transcript = await this.getAttioTranscript(attioMeetingId, attioCallId);
      
      // Get original description
      const originalBody = meeting.properties.hs_meeting_body || '';
      
      // Create new description with video and transcript
      let newDescription = '';
      
      // Keep original content if it exists and doesn't already have recording info
      if (originalBody && !originalBody.includes('Call recording:')) {
        newDescription = originalBody + '\n\n';
      }
      
      // Add video and transcript section
      newDescription += '********************\n';
      newDescription += 'Call recording:\n';
      newDescription += `${videoUrl}\n\n`;
      newDescription += 'Transcript:\n';
      
      if (transcript) {
        newDescription += transcript;
      } else {
        newDescription += 'Transcript not available';
      }
      
      newDescription += '\n********************';
      
      // Update the meeting
      await this.hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.id}`, {
        properties: {
          hs_meeting_body: newDescription
        }
      });
      
      console.log(`   ✅ Updated meeting ${meeting.id} with video and transcript`);
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
    console.log('🎬 Starting video matching and transcript processing...\n');
    console.log('='.repeat(60));
    
    try {
      // Step 1: Get all videos and meetings
      console.log('\n📥 STEP 1: Fetching videos and meetings\n');
      
      const [videos, meetings] = await Promise.all([
        this.getUploadedVideos(),
        this.getHubSpotMeetingsWithAttioIds()
      ]);
      
      // Step 1.5: Build recording-to-meeting lookup map from Attio API
      console.log('\n🗺️ STEP 1.5: Building API-based lookup map\n');
      const recordingToMeetingMap = await this.buildRecordingToMeetingMap();
      
      // Step 2: Match videos to meetings using new API approach
      console.log('\n🔗 STEP 2: Matching videos to meetings using API lookup\n');
      
      const { videoMatches, unmatchedVideos } = await this.matchVideosToMeetingsNew(videos, meetings, recordingToMeetingMap);
      
      if (videoMatches.length === 0) {
        console.log('✅ No new videos to process - all videos are already matched!');
        return;
      }
      
      // Step 3: Process each video match
      console.log(`\n📝 STEP 3: Processing ${videoMatches.length} video matches\n`);
      
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < videoMatches.length; i++) {
        const videoMatch = videoMatches[i];
        console.log(`[${i + 1}/${videoMatches.length}] Processing video...`);
        
        const success = await this.updateMeetingWithVideo(videoMatch);
        
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Summary
      console.log(`\n🎉 VIDEO PROCESSING COMPLETE!`);
      console.log(`✅ Successfully processed: ${successCount} videos`);
      console.log(`❌ Errors: ${errorCount} videos`);
      console.log(`⚠️ Unmatched videos: ${unmatchedVideos.length}`);
      
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
      console.error('\n💥 Critical error during video processing:', error.message);
      throw error;
    }
  }
}

// Run the script
if (require.main === module) {
  const processor = new VideoMatcher();
  processor.process().then(() => {
    console.log('\n🎉 Video matching completed successfully!');
    process.exit(0);
  }).catch(error => {
    console.error('Video matching failed:', error);
    process.exit(1);
  });
}

module.exports = VideoMatcher;