const VideoProcessor = require('./video-processor');

/**
 * Streamlined processor for new Attio videos that creates new HubSpot meetings
 * Since analysis shows none of these videos have corresponding HubSpot meetings
 */
class AttioVideoMigrator extends VideoProcessor {
  
  /**
   * Process all new Attio videos by creating new HubSpot meetings with transcripts
   */
  async migrateAllAttioVideos() {
    console.log('🚀 STARTING ATTIO VIDEO MIGRATION TO HUBSPOT\n');
    console.log('📋 Creating new HubSpot meetings for all Attio videos...\n');
    
    try {
      // Step 1: Get all video files
      const allVideoFiles = await this.getVideoFiles();
      console.log(`Found ${allVideoFiles.length} Attio video recordings to migrate`);
      
      if (allVideoFiles.length === 0) {
        console.log('No video files found to process.');
        return { processed: 0, errors: 0, results: [] };
      }
      
      // For initial run, let's process first 10 videos to validate the approach
      const videosToProcess = allVideoFiles.slice(0, 10);
      console.log(`\n🧪 INITIAL BATCH: Processing first ${videosToProcess.length} videos out of ${allVideoFiles.length} total`);
      
      // Step 2: Process videos in small batches
      const results = [];
      const batchSize = 3;
      
      for (let i = 0; i < videosToProcess.length; i += batchSize) {
        const batch = videosToProcess.slice(i, i + batchSize);
        console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videosToProcess.length / batchSize)}`);
        
        const batchResults = await Promise.allSettled(
          batch.map(videoFile => this.processAttioVideo(videoFile))
        );
        
        batchResults.forEach((settledResult, index) => {
          if (settledResult.status === 'fulfilled') {
            results.push(settledResult.value);
          } else {
            results.push({
              videoFile: batch[index].filename,
              success: false,
              error: settledResult.reason.message || 'Unknown error',
              steps: {}
            });
          }
        });
        
        // Add delay between batches
        if (i + batchSize < videosToProcess.length) {
          console.log('⏱️  Waiting 10 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
      // Step 3: Save results and generate summary
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await this.dataManager.saveData(`attio_video_migration_results_${timestamp}.json`, results);
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log('\n' + '='.repeat(80));
      console.log('ATTIO VIDEO MIGRATION COMPLETED');
      console.log('='.repeat(80));
      console.log(`📊 Results Summary:`);
      console.log(`   Videos processed: ${results.length}`);
      console.log(`   Successful migrations: ${successful}`);
      console.log(`   Failed migrations: ${failed}`);
      console.log(`   Remaining videos: ${allVideoFiles.length - videosToProcess.length}`);
      
      if (successful > 0) {
        console.log('\n✅ Successfully created:');
        results.filter(r => r.success).forEach((result, index) => {
          console.log(`   ${index + 1}. Meeting ${result.hubspotMeetingId} from ${result.videoFile}`);
        });
      }
      
      if (failed > 0) {
        console.log('\n❌ Failed migrations:');
        results.filter(r => !r.success).forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile}: ${result.error}`);
        });
      }
      
      if (allVideoFiles.length > videosToProcess.length) {
        console.log(`\n📋 Next Steps:`);
        console.log(`   - Review the results from this initial batch`);
        console.log(`   - If successful, process remaining ${allVideoFiles.length - videosToProcess.length} videos`);
        console.log(`   - Update the batch slice to process more videos: allVideoFiles.slice(10, 20), etc.`);
      }
      
      console.log(`\n📁 Results saved to: attio_video_migration_results_${timestamp}.json`);
      
      return { processed: successful, errors: failed, results };
      
    } catch (error) {
      console.error('❌ Attio video migration failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Process a single Attio video by creating a new HubSpot meeting with transcript
   */
  async processAttioVideo(videoFile) {
    console.log(`\n🎬 Processing Attio video: ${videoFile.filename}`);
    
    const result = {
      videoFile: videoFile.filename,
      attioMeetingId: videoFile.meetingId,
      attioCallId: videoFile.videoId,
      success: false,
      hubspotMeetingId: null,
      steps: {},
      error: null
    };
    
    try {
      // Step 1: Generate transcript
      console.log('  📝 Generating transcript...');
      result.steps.transcriptGeneration = { status: 'started' };
      const transcript = await this.generateTranscript(videoFile);
      result.steps.transcriptGeneration = { status: 'completed', length: transcript.length };
      
      // Step 2: Create new HubSpot meeting
      console.log('  🆕 Creating new HubSpot meeting...');
      result.steps.meetingCreation = { status: 'started' };
      const hubspotMeeting = await this.createAttioMeeting(videoFile, transcript);
      result.steps.meetingCreation = { status: 'completed', meetingId: hubspotMeeting.id };
      result.hubspotMeetingId = hubspotMeeting.id;
      
      // Step 3: Skip video upload for now (placeholder)
      result.steps.videoUpload = { status: 'skipped', reason: 'Video upload to be implemented later' };
      
      // Step 4: Skip associations for now (no attendee data available)
      result.steps.associations = { status: 'skipped', reason: 'No attendee data available from video files' };
      
      result.success = true;
      console.log(`  ✅ Successfully created meeting ${hubspotMeeting.id} for ${videoFile.filename}`);
      
    } catch (error) {
      result.error = error.message;
      console.error(`  ❌ Failed to process ${videoFile.filename}:`, error.message);
    }
    
    return result;
  }
  
  /**
   * Create a new HubSpot meeting from Attio video data
   */
  async createAttioMeeting(videoFile, transcript) {
    try {
      // Create descriptive meeting title
      const meetingDate = videoFile.created.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const meetingTitle = `Attio Call Recording - ${meetingDate}`;
      
      // Create comprehensive meeting description with transcript
      const meetingDescription = `📹 ATTIO CALL RECORDING

🆔 ORIGINAL IDENTIFIERS:
- Attio Meeting ID: ${videoFile.meetingId}
- Attio Call ID: ${videoFile.videoId}
- Original URL: https://app.attio.com/atlas-security/calls/${videoFile.meetingId}/${videoFile.videoId}/meeting

📊 FILE DETAILS:
- Video File: ${videoFile.filename}
- File Size: ${(videoFile.size / (1024 * 1024)).toFixed(2)} MB
- Recording Date: ${videoFile.created.toISOString()}
- Migration Date: ${new Date().toISOString()}

📝 CALL TRANSCRIPT:
${transcript}

---
⚡ Migrated from Attio via automated video processing pipeline`;
      
      // Create meeting properties with required fields
      const meetingTimestamp = videoFile.created.getTime();
      const meetingProperties = {
        hs_meeting_title: meetingTitle,
        hs_meeting_body: meetingDescription,
        hs_meeting_start_time: meetingTimestamp,
        hs_meeting_end_time: meetingTimestamp + (60 * 60 * 1000), // Assume 1 hour
        hs_timestamp: meetingTimestamp, // Required property!
        hs_meeting_outcome: 'COMPLETED'
        // Note: attio_meeting_id and attio_call_id stored in description for now
      };
      
      // Create the meeting in HubSpot
      const response = await this.hubspot.client.post('/crm/v3/objects/meetings', {
        properties: meetingProperties
      });
      
      const newMeeting = response.data;
      console.log(`    Created HubSpot meeting ${newMeeting.id}`);
      
      return newMeeting;
      
    } catch (error) {
      console.error(`    Error creating meeting for ${videoFile.filename}:`, error.message);
      throw error;
    }
  }
}

module.exports = AttioVideoMigrator;

// Run if called directly
if (require.main === module) {
  const migrator = new AttioVideoMigrator();
  migrator.migrateAllAttioVideos()
    .then((result) => {
      console.log('\n🎉 Attio video migration completed successfully!');
      console.log(`Created ${result.processed} new meetings with ${result.errors} errors`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Attio video migration failed:', error.message);
      process.exit(1);
    });
}