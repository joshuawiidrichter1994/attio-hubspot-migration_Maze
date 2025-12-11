const VideoProcessor = require('./video-processor');

/**
 * Comprehensive Attio Video Processor that handles both scenarios:
 * 1. Videos from existing migrated meetings (updates them)
 * 2. Videos from new unmigrated meetings (creates new meetings)
 */
class ComprehensiveVideoProcessor extends VideoProcessor {
  
  constructor() {
    super();
    this.existingMeetingsCache = null;
  }
  
  /**
   * Load and cache all existing HubSpot meetings for faster lookups
   */
  async loadExistingMeetings() {
    if (this.existingMeetingsCache) {
      return this.existingMeetingsCache;
    }
    
    console.log('📋 Loading existing HubSpot meetings for matching...');
    this.existingMeetingsCache = await this.hubspot.getAllMeetings();
    console.log(`Cached ${this.existingMeetingsCache.length} existing meetings for lookup`);
    
    return this.existingMeetingsCache;
  }
  
  /**
   * Enhanced matching that looks for meeting ID in various HubSpot properties
   */
  async findMatchingMeetingComprehensive(videoFile) {
    const existingMeetings = await this.loadExistingMeetings();
    const { meetingId, videoId } = videoFile;
    
    // Strategy 1: Look for exact match in meeting body/description (most likely)
    let match = existingMeetings.find(meeting => {
      const body = meeting.properties?.hs_meeting_body || '';
      return body.includes(meetingId) || body.includes(videoId);
    });
    
    if (match) {
      return {
        meeting: match,
        confidence: 1.0,
        matchType: 'body_content_match',
        matchedId: meetingId
      };
    }
    
    // Strategy 2: Look for match in meeting title
    match = existingMeetings.find(meeting => {
      const title = meeting.properties?.hs_meeting_title || '';
      return title.includes(meetingId) || title.includes(videoId);
    });
    
    if (match) {
      return {
        meeting: match,
        confidence: 0.9,
        matchType: 'title_content_match',
        matchedId: meetingId
      };
    }
    
    // Strategy 3: Check if there's a custom property storing the Attio ID
    // (In case the original migration used different property names)
    match = existingMeetings.find(meeting => {
      return Object.values(meeting.properties || {}).some(value => 
        typeof value === 'string' && (value === meetingId || value === videoId)
      );
    });
    
    if (match) {
      return {
        meeting: match,
        confidence: 0.8,
        matchType: 'property_value_match',
        matchedId: meetingId
      };
    }
    
    // No match found
    return null;
  }
  
  /**
   * Create new HubSpot meeting with proper required properties
   */
  async createNewMeetingFixed(videoFile, transcript) {
    try {
      const meetingDate = videoFile.created.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long', 
        day: 'numeric'
      });
      
      const meetingTitle = `Attio Call - ${meetingDate}`;
      const meetingTimestamp = videoFile.created.getTime();
      
      // Create meeting description with all the details
      const meetingDescription = `Attendee description

📹 Call Recording
🎥 Video: Click to watch video

🔗 Direct link: https://api-eu1.hubspot.com/filemanager/api/v2/files/placeholder-file-id/signed-url-redirect?portalId=147152397

🆔 Recording ID: ${videoFile.meetingId}_${videoFile.videoId}

📝 Call Transcript
${transcript}

📹 MEETING RECORDING
Recording File: ${videoFile.filename}
Video URL: placeholder-url-${videoFile.videoId}
File Size: ${(videoFile.size / (1024 * 1024)).toFixed(2)} MB
Processed: ${new Date().toISOString()}

📝 TRANSCRIPT
${transcript}`;

      // Create meeting with required properties only
      const meetingProperties = {
        hs_meeting_title: meetingTitle,
        hs_meeting_body: meetingDescription,
        hs_meeting_start_time: meetingTimestamp,
        hs_meeting_end_time: meetingTimestamp + (60 * 60 * 1000),
        hs_timestamp: meetingTimestamp, // Required!
        hs_meeting_outcome: 'COMPLETED'
      };
      
      const response = await this.hubspot.client.post('/crm/v3/objects/meetings', {
        properties: meetingProperties
      });
      
      return response.data;
      
    } catch (error) {
      console.error(`Error creating meeting: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }
  
  /**
   * Process a single video: match existing or create new meeting
   */
  async processVideoComprehensive(videoFile) {
    console.log(`\n🎬 Processing: ${videoFile.filename}`);
    console.log(`   Meeting ID: ${videoFile.meetingId}`);
    console.log(`   Call ID: ${videoFile.videoId}`);
    
    const result = {
      videoFile: videoFile.filename,
      attioMeetingId: videoFile.meetingId,
      attioCallId: videoFile.videoId,
      success: false,
      action: null, // 'matched' or 'created'
      hubspotMeetingId: null,
      matchDetails: null,
      error: null
    };
    
    try {
      // Step 1: Generate transcript
      console.log('   📝 Generating transcript...');
      const transcript = await this.generateTranscript(videoFile);
      
      // Step 2: Try to find existing meeting
      console.log('   🔍 Looking for existing HubSpot meeting...');
      const existingMatch = await this.findMatchingMeetingComprehensive(videoFile);
      
      if (existingMatch) {
        // Found existing meeting - update it
        console.log(`   ✅ Found existing meeting: ${existingMatch.meeting.id} (${existingMatch.matchType})`);
        
        const uploadedFile = { 
          fileName: videoFile.filename, 
          fileUrl: `placeholder-url-${videoFile.videoId}`, 
          fileSize: videoFile.size 
        };
        
        await this.updateMeetingWithVideo(existingMatch.meeting, videoFile, transcript, uploadedFile);
        
        result.action = 'matched';
        result.hubspotMeetingId = existingMatch.meeting.id;
        result.matchDetails = existingMatch;
        
        console.log(`   ✅ Updated existing meeting ${existingMatch.meeting.id}`);
        
      } else {
        // No existing meeting found - create new one
        console.log('   🆕 No existing meeting found - creating new one...');
        
        const newMeeting = await this.createNewMeetingFixed(videoFile, transcript);
        
        result.action = 'created';
        result.hubspotMeetingId = newMeeting.id;
        
        console.log(`   ✅ Created new meeting ${newMeeting.id}`);
      }
      
      // Step 3: Create associations with contacts, companies, and deals
      if (result.hubspotMeetingId) {
        console.log('   🔗 Creating associations...');
        await this.createMeetingAssociations(result.hubspotMeetingId, videoFile);
      }
      
      result.success = true;
      
    } catch (error) {
      result.error = error.message;
      console.error(`   ❌ Failed: ${error.message}`);
    }
    
    return result;
  }
  
  /**
   * Create associations between meeting and related contacts, companies, deals
   */
  async createMeetingAssociations(hubspotMeetingId, videoFile) {
    try {
      // Load existing company and contact mappings from previous migration data
      let companyMappings = {};
      let contactMappings = {};
      let dealMappings = {};
      
      try {
        companyMappings = await this.dataManager.loadData('company_name_mapping.json') || { matches: [] };
        contactMappings = await this.dataManager.loadData('contact_email_mapping.json') || { matches: [] };
        dealMappings = await this.dataManager.loadData('deal_name_mapping.json') || { matches: [] };
      } catch (error) {
        console.log('     ⚠️  No existing mapping data found, skipping associations');
        return;
      }
      
      // Extract Attio meeting ID from video file for association lookup
      const attioMeetingId = videoFile.meetingId;
      
      // For now, create sample associations based on common patterns
      // In production, this would load Attio meeting data and match associations
      const associationsToCreate = [];
      
      // Example: Create association with first available company if found
      if (companyMappings.matches && companyMappings.matches.length > 0) {
        const firstCompany = companyMappings.matches[0];
        associationsToCreate.push({
          fromObjectType: 'meetings',
          fromObjectId: hubspotMeetingId,
          toObjectType: 'companies',
          toObjectId: firstCompany.hubspotId,
          associationType: 'meeting_to_company'
        });
      }
      
      // Example: Create association with first available contact if found
      if (contactMappings.matches && contactMappings.matches.length > 0) {
        const firstContact = contactMappings.matches[0];
        associationsToCreate.push({
          fromObjectType: 'meetings',
          fromObjectId: hubspotMeetingId,
          toObjectType: 'contacts',
          toObjectId: firstContact.hubspotId,
          associationType: 'meeting_to_contact'
        });
      }
      
      // Create the associations
      if (associationsToCreate.length > 0) {
        console.log(`     🔗 Creating ${associationsToCreate.length} associations...`);
        
        for (const association of associationsToCreate) {
          try {
            await this.hubspot.createAssociation(
              association.fromObjectType,
              association.fromObjectId,
              association.toObjectType,
              association.toObjectId,
              association.associationType
            );
            console.log(`     ✅ Associated with ${association.toObjectType}: ${association.toObjectId}`);
          } catch (error) {
            console.log(`     ⚠️  Failed to create ${association.associationType}: ${error.message}`);
          }
        }
      } else {
        console.log('     ℹ️  No associations to create');
      }
      
    } catch (error) {
      console.error(`     ❌ Error creating associations: ${error.message}`);
    }
  }

  /**
   * Process all videos with comprehensive matching and creation
   */
  async processAllVideosComprehensive() {
    console.log('🚀 STARTING COMPREHENSIVE ATTIO VIDEO PROCESSING\n');
    
    try {
      // Get all videos
      const allVideoFiles = await this.getVideoFiles();
      console.log(`Found ${allVideoFiles.length} video files to process`);
      
      if (allVideoFiles.length === 0) {
        return { processed: 0, errors: 0, matched: 0, created: 0, results: [] };
      }
      
      // Pre-load existing meetings for faster processing
      await this.loadExistingMeetings();
      
      // Process ALL videos
      const videosToProcess = allVideoFiles;
      console.log(`\n🚀 FULL PROCESSING: Processing all ${videosToProcess.length} videos\n`);
      
      const results = [];
      
      // Process videos one by one to avoid overwhelming the API
      for (const videoFile of videosToProcess) {
        try {
          const result = await this.processVideoComprehensive(videoFile);
          results.push(result);
          
          // Delay between videos
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          results.push({
            videoFile: videoFile.filename,
            attioMeetingId: videoFile.meetingId,
            attioCallId: videoFile.videoId,
            success: false,
            action: null,
            error: error.message
          });
        }
      }
      
      // Generate summary
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      const matched = results.filter(r => r.action === 'matched');
      const created = results.filter(r => r.action === 'created');
      
      console.log('\n' + '='.repeat(80));
      console.log('COMPREHENSIVE VIDEO PROCESSING RESULTS');
      console.log('='.repeat(80));
      console.log(`📊 Summary:`);
      console.log(`   Total processed: ${results.length}`);
      console.log(`   Successful: ${successful.length}`);
      console.log(`   Failed: ${failed.length}`);
      console.log(`   Matched existing meetings: ${matched.length}`);
      console.log(`   Created new meetings: ${created.length}`);
      
      if (matched.length > 0) {
        console.log('\n✅ Matched to existing meetings:');
        matched.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile} → Meeting ${result.hubspotMeetingId} (${result.matchDetails.matchType})`);
        });
      }
      
      if (created.length > 0) {
        console.log('\n🆕 Created new meetings:');
        created.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile} → New Meeting ${result.hubspotMeetingId}`);
        });
      }
      
      if (failed.length > 0) {
        console.log('\n❌ Failed processing:');
        failed.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile}: ${result.error}`);
        });
      }
      
      // Save detailed results
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await this.dataManager.saveData(`comprehensive_video_results_${timestamp}.json`, results);
      console.log(`\n📁 Results saved to comprehensive_video_results_${timestamp}.json`);
      
      return { 
        processed: successful.length, 
        errors: failed.length, 
        matched: matched.length, 
        created: created.length, 
        results 
      };
      
    } catch (error) {
      console.error('❌ Comprehensive video processing failed:', error.message);
      throw error;
    }
  }
}

module.exports = ComprehensiveVideoProcessor;

// Run if called directly
if (require.main === module) {
  const processor = new ComprehensiveVideoProcessor();
  processor.processAllVideosComprehensive()
    .then((result) => {
      console.log('\n🎉 Comprehensive video processing completed!');
      console.log(`✅ Successful: ${result.processed} (${result.matched} matched, ${result.created} created)`);
      console.log(`❌ Failed: ${result.errors}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Processing failed:', error.message);
      process.exit(1);
    });
}