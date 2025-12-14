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
   * Find HubSpot meeting by Attio meeting ID using the "Original ID:" marker from Script 1
   */
  async findMatchingMeetingComprehensive(videoFile) {
    const existingMeetings = await this.loadExistingMeetings();
    const { meetingId, videoId } = videoFile;
    
    // Parse filename to get proper IDs
    const { callId, attioMeetingId } = this.parseVideoFilename(videoFile.filename);
    
    let targetMeetingId = attioMeetingId || meetingId;
    
    // If we only have a call ID, we need to map it to a meeting ID via Attio
    if (!targetMeetingId && callId) {
      console.log(`   🔄 Only have call ID ${callId}, need to map to meeting ID via Attio`);
      // TODO: Implement Attio API call to map call_id -> meeting_id
      // For now, mark as unmatchable
      return null;
    }
    
    if (!targetMeetingId) {
      console.log('   ❌ No valid meeting ID found in filename');
      return null;
    }
    
    // Look for exact match in meeting body using "Original ID:" pattern from Script 1
    const match = existingMeetings.find(meeting => {
      const body = meeting.properties?.hs_meeting_body || '';
      return body.includes(`Original ID: ${targetMeetingId}`);
    });
    
    if (match) {
      return {
        meeting: match,
        confidence: 1.0,
        matchType: 'attio_id_match',
        matchedId: targetMeetingId
      };
    }
    
    // No match found
    console.log(`   ❌ No HubSpot meeting found with Attio ID: ${targetMeetingId}`);
    return null;
  }
  
  /**
   * Parse video filename to extract call ID and meeting ID
   */
  parseVideoFilename(filename) {
    // Remove extension
    const baseName = filename.replace(/\.[^.]+$/, '');
    
    // Pattern 1: meeting-<meeting-id>.mp4 or meeting-<meeting-id>-<call-id>.mp4
    const meetingMatch = baseName.match(/^meeting-([a-f0-9-]+)(?:-([a-f0-9-]+))?$/);
    if (meetingMatch) {
      return {
        attioMeetingId: meetingMatch[1],
        callId: meetingMatch[2] || null
      };
    }
    
    // Pattern 2: call-recording-<call-id>.mp4 (old format)
    const callMatch = baseName.match(/^call-recording-([a-f0-9-]+)$/);
    if (callMatch) {
      return {
        callId: callMatch[1],
        attioMeetingId: null
      };
    }
    
    // Fallback: couldn't parse
    return {
      callId: null,
      attioMeetingId: null
    };
  }
  
  /**
   * DISABLED: We don't create new meetings in Script 2
   * Script 2 only updates existing meetings that were created by Script 1
   */
  // createNewMeetingFixed method removed to prevent duplicate meetings
  
  /**
   * Upload video file to HubSpot file manager and get real URL
   */
  async uploadFileToHubSpot(videoFile) {
    try {
      // This should use the actual HubSpot file upload API
      // For now, implementing the base VideoProcessor upload logic
      const uploadResult = await this.uploadVideo(videoFile);
      
      return {
        fileName: videoFile.filename,
        fileUrl: uploadResult.url,
        fileId: uploadResult.id,
        fileSize: videoFile.size
      };
    } catch (error) {
      console.error(`   ❌ Failed to upload video: ${error.message}`);
      // Return placeholder for now but log the error
      return {
        fileName: videoFile.filename,
        fileUrl: `[Upload failed: ${error.message}]`,
        fileSize: videoFile.size
      };
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
        // Found existing meeting - update it with video and transcript
        console.log(`   ✅ Found existing meeting: ${existingMatch.meeting.id} (${existingMatch.matchType})`);
        
        // Upload video file to HubSpot to get real URL
        console.log('   📤 Uploading video file to HubSpot...');
        const uploadedFile = await this.uploadFileToHubSpot(videoFile);
        
        await this.updateMeetingWithVideo(existingMatch.meeting, videoFile, transcript, uploadedFile);
        
        result.action = 'matched';
        result.hubspotMeetingId = existingMatch.meeting.id;
        result.matchDetails = existingMatch;
        
        console.log(`   ✅ Updated existing meeting ${existingMatch.meeting.id}`);
        
      } else {
        // No existing meeting found - log for manual review
        console.log('   ❌ No existing meeting found - adding to unmatched list');
        
        result.action = 'unmatched';
        result.hubspotMeetingId = null;
        
        console.log(`   ⚠️  Video ${videoFile.filename} could not be matched to any existing meeting`);
      }
      
      // Script 2 doesn't create associations - they're already set by Script 1
      
      result.success = true;
      
    } catch (error) {
      result.error = error.message;
      console.error(`   ❌ Failed: ${error.message}`);
    }
    
    return result;
  }
  
  /**
   * DISABLED: Script 2 doesn't create associations
   * All associations are already set by Script 1 (comprehensive-meeting-processor.js)
   */
  // createMeetingAssociations method removed - Script 1 handles all associations

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
      const unmatched = results.filter(r => r.action === 'unmatched');
      
      console.log('\n' + '='.repeat(80));
      console.log('SCRIPT 2: VIDEO PROCESSING RESULTS');
      console.log('='.repeat(80));
      console.log(`📊 Summary:`);
      console.log(`   Total processed: ${results.length}`);
      console.log(`   Successful: ${successful.length}`);
      console.log(`   Failed: ${failed.length}`);
      console.log(`   Matched existing meetings: ${matched.length}`);
      console.log(`   Unmatched videos (need manual review): ${unmatched.length}`);
      
      if (matched.length > 0) {
        console.log('\n✅ Matched to existing meetings:');
        matched.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile} → Meeting ${result.hubspotMeetingId} (${result.matchDetails.matchType})`);
        });
      }
      
      if (unmatched.length > 0) {
        console.log('\n⚠️  Unmatched videos (require manual review):');
        unmatched.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile} - Could not find matching meeting`);
        });
        console.log('\n   💡 These videos may need:');
        console.log('      - Attio call ID → meeting ID mapping');
        console.log('      - Manual association with existing meetings');
        console.log('      - Verification that the meetings were migrated in Script 1');
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
        unmatched: unmatched.length, 
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
      console.log('\n🎉 Script 2: Video processing completed!');
      console.log(`✅ Successful: ${result.processed} (${result.matched} matched)`);
      console.log(`⚠️  Unmatched: ${result.unmatched}`);
      console.log(`❌ Failed: ${result.errors}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Processing failed:', error.message);
      process.exit(1);
    });
}