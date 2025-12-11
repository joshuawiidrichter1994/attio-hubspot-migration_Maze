const HubSpotAPI = require('./utils/hubspot-api');
const AttioAPI = require('./utils/attio-api');
const fs = require('fs');
const path = require('path');

class DryRunMeetingProcessor {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.attio = new AttioAPI();
    this.wouldCreate = 0;
    this.wouldUpdate = 0;
    this.wouldSkip = 0;
    this.wouldAddAssociations = 0;
  }

  /**
   * Get fresh data from Attio
   */
  async getFreshAttioMeetings() {
    console.log('📥 [DRY RUN] Fetching fresh meetings from Attio...');
    
    try {
      const meetings = await this.attio.getAllMeetings();
      console.log(`   ✅ Found ${meetings.length} meetings in Attio`);
      return meetings;
    } catch (error) {
      console.error('❌ Error fetching Attio meetings:', error.message);
      throw error;
    }
  }

  /**
   * Get fresh data from HubSpot
   */
  async getFreshHubSpotMeetings() {
    console.log('📥 [DRY RUN] Fetching fresh meetings from HubSpot...');
    
    try {
      const meetings = await this.hubspot.getAllMeetings();
      console.log(`   ✅ Found ${meetings.length} meetings in HubSpot`);
      return meetings;
    } catch (error) {
      console.error('❌ Error fetching HubSpot meetings:', error.message);
      throw error;
    }
  }

  /**
   * Get video files from local directory (for dry run)
   */
  async getUploadedVideos() {
    console.log('📥 [DRY RUN] Checking local video files...');
    
    try {
      const videosDir = path.join(__dirname, '..', 'videos');
      
      if (!fs.existsSync(videosDir)) {
        console.log(`   ⚠️ Videos directory not found: ${videosDir}`);
        return [];
      }
      
      const files = fs.readdirSync(videosDir);
      const videos = files.filter(file => file.endsWith('.mp4')).map(file => ({
        name: file,
        url: `file://${path.join(videosDir, file)}`  // Simulated URL
      }));
      
      console.log(`   ✅ Found ${videos.length} video files locally`);
      return videos;
      
    } catch (error) {
      console.error('❌ Error checking video files:', error.message);
      return [];  // Return empty array instead of throwing
    }
  }

  /**
   * Cross-check Attio meetings against HubSpot
   */
  verifyMeetingSync(attioMeetings, hubspotMeetings) {
    console.log('🔍 [DRY RUN] Cross-checking meeting sync between Attio and HubSpot...');
    
    const hubspotByAttioId = new Map();
    
    // Look for Attio IDs in the meeting body content (how they were originally matched)
    hubspotMeetings.forEach(meeting => {
      const body = meeting.properties.hs_meeting_body || '';
      
      // Look for patterns like "Recording ID: attio-meeting-id_call-id" or similar
      const attioIdPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
      const matches = body.match(attioIdPattern);
      
      if (matches && matches.length > 0) {
        // Use the first UUID found as the Attio meeting ID
        const attioId = matches[0];
        hubspotByAttioId.set(attioId, meeting);
      }
    });
    
    const missingInHubSpot = [];
    const existingInHubSpot = [];
    
    attioMeetings.forEach(attioMeeting => {
      const attioId = attioMeeting.id.meeting_id; // Use meeting_id not identifier
      if (!hubspotByAttioId.has(attioId)) {
        missingInHubSpot.push(attioMeeting);
      } else {
        existingInHubSpot.push({
          attioMeeting,
          hubspotMeeting: hubspotByAttioId.get(attioId)
        });
      }
    });
    
    console.log(`   📊 Attio meetings: ${attioMeetings.length}`);
    console.log(`   📊 HubSpot meetings with Attio ID in body: ${hubspotByAttioId.size}`);
    console.log(`   ✅ Existing in HubSpot: ${existingInHubSpot.length}`);
    console.log(`   🆕 Would create in HubSpot: ${missingInHubSpot.length}`);
    
    if (missingInHubSpot.length > 0) {
      console.log('\\n🆕 [DRY RUN] New meetings that would be created:');
      missingInHubSpot.slice(0, 10).forEach((meeting, i) => {
        const title = meeting.values?.title?.[0]?.value || 'Untitled';
        const startTime = meeting.values?.start_time?.[0]?.value || 'No date';
        console.log(`   ${i + 1}. ${title} (${startTime.substring(0, 10)})`);
      });
      if (missingInHubSpot.length > 10) {
        console.log(`   ... and ${missingInHubSpot.length - 10} more`);
      }
    }
    
    return { hubspotByAttioId, missingInHubSpot, existingInHubSpot };
  }

  /**
   * Match videos to meetings based on filename structure
   */
  matchVideosToMeetings(videos, hubspotMeetings) {
    console.log('🔗 [DRY RUN] Matching videos to meetings...');
    
    const hubspotByAttioId = new Map();
    
    // Build mapping using body content matching
    hubspotMeetings.forEach(meeting => {
      const body = meeting.properties.hs_meeting_body || '';
      const attioIdPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
      const matches = body.match(attioIdPattern);
      
      if (matches && matches.length > 0) {
        const attioId = matches[0];
        hubspotByAttioId.set(attioId, meeting);
      }
    });
    
    const videoMatches = [];
    const unmatchedVideos = [];
    
    videos.forEach(video => {
      // Extract meeting ID from filename (before the first underscore)
      const filenameParts = video.name.split('_');
      if (filenameParts.length >= 2) {
        const meetingId = filenameParts[0];
        const hubspotMeeting = hubspotByAttioId.get(meetingId);
        
        if (hubspotMeeting) {
          videoMatches.push({
            video,
            meeting: hubspotMeeting,
            attioMeetingId: meetingId,
            attioCallId: filenameParts[1]?.replace('.mp4', '')
          });
        } else {
          unmatchedVideos.push(video);
        }
      } else {
        unmatchedVideos.push(video);
      }
    });
    
    console.log(`   ✅ Would match ${videoMatches.length} videos to meetings`);
    console.log(`   ⚠️ Unmatched videos: ${unmatchedVideos.length}`);
    
    if (videoMatches.length > 0) {
      console.log('\\n🎥 [DRY RUN] Videos that would be processed:');
      videoMatches.slice(0, 5).forEach((match, i) => {
        const meetingTitle = match.meeting.properties.hs_meeting_title || 'Untitled';
        console.log(`   ${i + 1}. ${match.video.name} → ${meetingTitle.substring(0, 40)}...`);
      });
      if (videoMatches.length > 5) {
        console.log(`   ... and ${videoMatches.length - 5} more`);
      }
    }
    
    return { videoMatches, unmatchedVideos };
  }

  /**
   * Analyze what would be updated for video meetings
   */
  analyzeVideoUpdates(videoMatches) {
    console.log('\\n📝 [DRY RUN] Analyzing meeting updates for videos...');
    
    const wouldUpdate = [];
    const alreadyGood = [];
    
    videoMatches.forEach(match => {
      const currentBody = match.meeting.properties.hs_meeting_body || '';
      const hasVideoLink = currentBody.includes('https://api-eu1.hubspot.com/filemanager/api/v2/files/');
      const hasProperFormat = currentBody.includes('Call recording') && 
                              currentBody.includes('Video link:') && 
                              currentBody.includes('Transcript:');
      
      if (!hasVideoLink || !hasProperFormat) {
        wouldUpdate.push(match);
      } else {
        alreadyGood.push(match);
      }
    });
    
    console.log(`   🔄 Would update: ${wouldUpdate.length} meetings with videos`);
    console.log(`   ✅ Already good: ${alreadyGood.length} meetings with videos`);
    
    if (wouldUpdate.length > 0) {
      console.log('\\n📝 [DRY RUN] Meetings that would get video updates:');
      wouldUpdate.slice(0, 5).forEach((match, i) => {
        const meetingTitle = match.meeting.properties.hs_meeting_title || 'Untitled';
        const currentBody = match.meeting.properties.hs_meeting_body || '';
        const reason = !currentBody.includes('https://api-eu1.hubspot.com/filemanager/api/v2/files/') 
          ? 'No video link' 
          : 'Wrong format';
        console.log(`   ${i + 1}. ${meetingTitle.substring(0, 40)}... (${reason})`);
      });
      if (wouldUpdate.length > 5) {
        console.log(`   ... and ${wouldUpdate.length - 5} more`);
      }
    }
    
    this.wouldUpdate += wouldUpdate.length;
    this.wouldSkip += alreadyGood.length;
    
    return { wouldUpdate, alreadyGood };
  }

  /**
   * Analyze meetings without recordings
   */
  analyzeMeetingsWithoutRecordings(hubspotMeetings, videoMatches) {
    console.log('\\n🧹 [DRY RUN] Analyzing meetings without recordings...');
    
    const meetingsWithVideos = new Set(videoMatches.map(vm => vm.meeting.id));
    
    // Filter meetings that have Attio IDs (were migrated) but don't have videos
    const meetingsWithoutVideos = hubspotMeetings.filter(meeting => {
      const body = meeting.properties.hs_meeting_body || '';
      const hasAttioId = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/.test(body);
      return hasAttioId && !meetingsWithVideos.has(meeting.id);
    });
    
    console.log(`   📊 Found ${meetingsWithoutVideos.length} meetings without recordings`);
    
    const wouldClean = [];
    const alreadyClean = [];
    
    meetingsWithoutVideos.forEach(meeting => {
      const currentBody = meeting.properties.hs_meeting_body || '';
      const needsCleaning = currentBody.includes('📹') || 
                           currentBody.includes('placeholder-url-') ||
                           currentBody.includes('Recording ID:') ||
                           currentBody.includes('MEETING RECORDING');
      
      if (needsCleaning) {
        wouldClean.push(meeting);
      } else {
        alreadyClean.push(meeting);
      }
    });
    
    console.log(`   🧹 Would clean: ${wouldClean.length} meetings`);
    console.log(`   ✅ Already clean: ${alreadyClean.length} meetings`);
    
    if (wouldClean.length > 0) {
      console.log('\\n🧹 [DRY RUN] Meetings that would be cleaned:');
      wouldClean.slice(0, 5).forEach((meeting, i) => {
        const title = meeting.properties.hs_meeting_title || 'Untitled';
        console.log(`   ${i + 1}. ${title.substring(0, 50)}...`);
      });
      if (wouldClean.length > 5) {
        console.log(`   ... and ${wouldClean.length - 5} more`);
      }
    }
    
    this.wouldUpdate += wouldClean.length;
    this.wouldSkip += alreadyClean.length;
    
    return { wouldClean, alreadyClean };
  }

  /**
   * Simulate association checking
   */
  async simulateAssociationCheck(existingMeetings) {
    console.log('\\n🔗 [DRY RUN] Simulating association verification...');
    
    // Just check a sample to avoid too many API calls
    const sampleSize = Math.min(5, existingMeetings.length);
    console.log(`   📊 Checking associations for ${sampleSize} sample meetings...`);
    
    let wouldAddAssociations = 0;
    
    for (let i = 0; i < sampleSize; i++) {
      const { hubspotMeeting, attioMeeting } = existingMeetings[i];
      
      try {
        // Get existing associations
        const existingAssociations = await this.hubspot.client.get(`/crm/v4/objects/meetings/${hubspotMeeting.id}/associations`);
        
        const existingContacts = new Set();
        const existingCompanies = new Set();
        const existingDeals = new Set();
        
        existingAssociations.data.results.forEach(assoc => {
          if (assoc.toObjectType === 'contacts') {
            existingContacts.add(assoc.toObjectId);
          } else if (assoc.toObjectType === 'companies') {
            existingCompanies.add(assoc.toObjectId);
          } else if (assoc.toObjectType === 'deals') {
            existingDeals.add(assoc.toObjectId);
          }
        });
        
        const participants = attioMeeting.values.participants || [];
        const companies = attioMeeting.values.companies || [];
        const deals = attioMeeting.values.deals || [];
        
        const missingCount = participants.length + companies.length + deals.length - 
                            existingContacts.size - existingCompanies.size - existingDeals.size;
        
        if (missingCount > 0) {
          wouldAddAssociations += missingCount;
          const title = hubspotMeeting.properties.hs_meeting_title || 'Untitled';
          console.log(`     Would add ${missingCount} associations to: ${title.substring(0, 30)}...`);
        }
        
      } catch (error) {
        console.log(`     ❌ Error checking ${hubspotMeeting.id}: ${error.message}`);
      }
      
      // Rate limiting for sample
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (sampleSize < existingMeetings.length) {
      const estimated = Math.round((wouldAddAssociations / sampleSize) * existingMeetings.length);
      console.log(`   📊 Estimated ${estimated} total associations would be added across all meetings`);
      this.wouldAddAssociations = estimated;
    } else {
      this.wouldAddAssociations = wouldAddAssociations;
    }
  }

  /**
   * Main dry run process
   */
  async dryRun() {
    console.log('🧪 STARTING DRY RUN - NO CHANGES WILL BE MADE\\n');
    console.log('='.repeat(60));
    
    try {
      // Step 1: Get fresh data from all sources
      console.log('\\n📥 STEP 1: Fetching fresh data from all sources\\n');
      const [attioMeetings, hubspotMeetings, uploadedVideos] = await Promise.all([
        this.getFreshAttioMeetings(),
        this.getFreshHubSpotMeetings(),
        this.getUploadedVideos()
      ]);
      
      // Step 2: Verify meeting sync and identify new meetings
      console.log('\\n🔍 STEP 2: Analyzing meeting synchronization\\n');
      const { hubspotByAttioId, missingInHubSpot, existingInHubSpot } = this.verifyMeetingSync(attioMeetings, hubspotMeetings);
      
      this.wouldCreate = missingInHubSpot.length;
      
      // Step 3: Check associations for existing meetings (sample)
      if (existingInHubSpot.length > 0) {
        await this.simulateAssociationCheck(existingInHubSpot);
      }
      
      // Step 4: Match videos to meetings
      console.log('\\n🔗 STEP 4: Analyzing video matches\\n');
      const { videoMatches, unmatchedVideos } = this.matchVideosToMeetings(uploadedVideos, hubspotMeetings);
      
      // Step 5: Analyze video updates
      const { wouldUpdate: videoUpdates } = this.analyzeVideoUpdates(videoMatches);
      
      // Step 6: Analyze meetings without recordings
      const { wouldClean } = this.analyzeMeetingsWithoutRecordings(hubspotMeetings, videoMatches);
      
      // Final Summary
      console.log('\\n' + '='.repeat(60));
      console.log('🧪 DRY RUN SUMMARY - WHAT WOULD HAPPEN:');
      console.log('='.repeat(60));
      console.log(`🆕 New meetings to create: ${this.wouldCreate}`);
      console.log(`🔗 Association additions estimated: ${this.wouldAddAssociations}`);
      console.log(`📝 Meetings to update: ${this.wouldUpdate}`);
      console.log(`⏭️ Meetings to skip (already good): ${this.wouldSkip}`);
      console.log(`🎥 Videos to process: ${videoMatches.length}`);
      console.log(`⚠️ Unmatched videos: ${unmatchedVideos.length}`);
      console.log('='.repeat(60));
      console.log('\\n🧪 This was a DRY RUN - no actual changes were made');
      console.log('✨ Run the real script when you\'re ready to apply these changes');

    } catch (error) {
      console.error('\\n💥 Error during dry run:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const processor = new DryRunMeetingProcessor();
  
  try {
    await processor.dryRun();
  } catch (error) {
    console.error('\\n💥 Dry run failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = DryRunMeetingProcessor;