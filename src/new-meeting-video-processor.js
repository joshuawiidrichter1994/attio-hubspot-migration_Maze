const VideoProcessor = require('./video-processor');

/**
 * Enhanced Video Processor that can create new meetings for unmatched videos
 * This handles the case where videos represent completely new meetings since the original migration
 */
class NewMeetingVideoProcessor extends VideoProcessor {
  
  /**
   * Create a new meeting in HubSpot for a video that doesn't match any existing meeting
   */
  async createNewMeeting(videoFile, transcript) {
    console.log(`🆕 Creating new HubSpot meeting for video ${videoFile.filename}...`);
    
    try {
      // Generate meeting title from video filename and timestamp
      const meetingTitle = `Video Call Recording - ${videoFile.created.toLocaleDateString()}`;
      
      // Create a comprehensive meeting description
      const meetingDescription = `Meeting recorded from video file: ${videoFile.filename}

📹 VIDEO DETAILS:
- Original Meeting ID: ${videoFile.meetingId}
- Video ID: ${videoFile.videoId}
- File Size: ${(videoFile.size / (1024 * 1024)).toFixed(2)} MB
- Recorded: ${videoFile.created.toISOString()}
- Processed: ${new Date().toISOString()}

📝 TRANSCRIPT:
${transcript}

ℹ️ This meeting was created automatically from a new video recording that had no existing HubSpot meeting match.
Original Attio Meeting ID: ${videoFile.meetingId}`;

      // Create the meeting properties
      const meetingProperties = {
        hs_meeting_title: meetingTitle,
        hs_meeting_body: meetingDescription,
        hs_meeting_start_time: videoFile.created.getTime(), // Use file creation time as meeting time
        hs_meeting_end_time: videoFile.created.getTime() + (60 * 60 * 1000), // Assume 1 hour duration
        hs_meeting_outcome: 'COMPLETED',
        attio_meeting_id: videoFile.meetingId, // Store original Attio ID
        hs_meeting_source: 'VIDEO_IMPORT',
        hs_meeting_type: 'Video Call'
      };
      
      // Create the meeting in HubSpot
      const response = await this.hubspot.client.post('/crm/v3/objects/meetings', {
        properties: meetingProperties
      });
      
      const newMeeting = response.data;
      console.log(`✅ Created new HubSpot meeting ${newMeeting.id} for video ${videoFile.filename}`);
      
      return {
        meeting: newMeeting,
        confidence: 1.0,
        matchType: 'new_meeting_created'
      };
      
    } catch (error) {
      console.error(`❌ Error creating new meeting for ${videoFile.filename}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Enhanced meeting matching that can create new meetings for unmatched videos
   */
  async findOrCreateMatchingMeeting(videoFile, transcript) {
    console.log(`🔍 Finding or creating HubSpot meeting for video ${videoFile.filename}...`);
    
    try {
      // First try the standard matching approach
      const existingMatch = await this.findMatchingMeeting(videoFile);
      
      if (existingMatch) {
        console.log(`✅ Found existing meeting match: ${existingMatch.meeting.id}`);
        return existingMatch;
      }
      
      // If no existing meeting found, create a new one
      console.log(`📝 No existing meeting found - creating new meeting for ${videoFile.filename}`);
      const newMeeting = await this.createNewMeeting(videoFile, transcript);
      
      return newMeeting;
      
    } catch (error) {
      console.error(`❌ Error finding or creating meeting for ${videoFile.filename}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Enhanced video processing that can create new meetings
   */
  async processVideoWithMeetingCreation(videoFile) {
    console.log(`\n🎬 Processing video with meeting creation: ${videoFile.filename}`);
    
    const result = {
      videoFile: videoFile.filename,
      success: false,
      meetingCreated: false,
      steps: {},
      error: null
    };
    
    try {
      // Step 1: Generate transcript
      result.steps.transcriptGeneration = { status: 'started' };
      const transcript = await this.generateTranscript(videoFile);
      result.steps.transcriptGeneration = { status: 'completed', length: transcript.length };
      
      // Step 2: Find or create matching meeting
      result.steps.meetingMatching = { status: 'started' };
      const meetingMatch = await this.findOrCreateMatchingMeeting(videoFile, transcript);
      
      result.steps.meetingMatching = { 
        status: 'completed', 
        meetingId: meetingMatch.meeting.id,
        confidence: meetingMatch.confidence,
        matchType: meetingMatch.matchType
      };
      
      // Track if we created a new meeting
      result.meetingCreated = (meetingMatch.matchType === 'new_meeting_created');
      
      // Step 3: Upload video to HubSpot (placeholder for now)
      result.steps.videoUpload = { status: 'skipped', reason: 'Video upload not implemented yet' };
      
      // Step 4: The meeting already has the transcript and video info if we created it
      if (meetingMatch.matchType === 'new_meeting_created') {
        result.steps.meetingUpdate = { status: 'completed', note: 'Meeting created with transcript included' };
      } else {
        // Update existing meeting
        result.steps.meetingUpdate = { status: 'started' };
        const uploadedFile = { fileName: videoFile.filename, fileUrl: 'placeholder-url', fileSize: videoFile.size };
        const updatedMeeting = await this.updateMeetingWithVideo(
          meetingMatch.meeting, 
          videoFile, 
          transcript, 
          uploadedFile
        );
        result.steps.meetingUpdate = { status: 'completed', meetingId: updatedMeeting.id };
      }
      
      // Step 5: Create associations (placeholder - would need attendee data)
      result.steps.associations = { status: 'skipped', reason: 'No attendee data available for new meetings' };
      
      result.success = true;
      console.log(`✅ Successfully processed ${videoFile.filename}${result.meetingCreated ? ' (new meeting created)' : ''}`);
      
    } catch (error) {
      result.error = error.message;
      console.error(`❌ Failed to process ${videoFile.filename}:`, error.message);
    }
    
    return result;
  }
  
  /**
   * Process all videos with the ability to create new meetings
   */
  async processAllVideosWithMeetingCreation() {
    console.log('🚀 STARTING ENHANCED VIDEO PROCESSING WITH MEETING CREATION\n');
    
    try {
      // Step 1: Get all video files
      const allVideoFiles = await this.getVideoFiles();
      
      if (allVideoFiles.length === 0) {
        console.log('No video files found to process.');
        return { processed: 0, errors: 0, meetingsCreated: 0, results: [] };
      }
      
      // For testing, let's process just the first 5 videos
      const videosToProcess = allVideoFiles.slice(0, 5);
      console.log(`\n🧪 TESTING MODE: Processing first ${videosToProcess.length} videos out of ${allVideoFiles.length} total`);
      
      // Step 2: Process each video
      const results = [];
      
      for (const videoFile of videosToProcess) {
        try {
          const result = await this.processVideoWithMeetingCreation(videoFile);
          results.push(result);
          
          // Add delay between videos to be respectful
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          results.push({
            videoFile: videoFile.filename,
            success: false,
            meetingCreated: false,
            error: error.message,
            steps: {}
          });
        }
      }
      
      // Step 3: Save results and generate report
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await this.dataManager.saveData(`enhanced_video_processing_results_${timestamp}.json`, results);
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const meetingsCreated = results.filter(r => r.meetingCreated).length;
      
      console.log('\n' + '='.repeat(80));
      console.log('ENHANCED VIDEO PROCESSING COMPLETED');
      console.log('='.repeat(80));
      console.log(`📊 Summary:`);
      console.log(`   Total videos processed: ${videosToProcess.length}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   New meetings created: ${meetingsCreated}`);
      
      if (failed > 0) {
        console.log('\n❌ Failed videos:');
        results.filter(r => !r.success).forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile}: ${result.error}`);
        });
      }
      
      if (meetingsCreated > 0) {
        console.log('\n🆕 New meetings created:');
        results.filter(r => r.meetingCreated).forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.videoFile} → Meeting ${result.steps.meetingMatching.meetingId}`);
        });
      }
      
      console.log('\n✅ Enhanced video processing completed!');
      console.log(`📁 Results saved to enhanced_video_processing_results_${timestamp}.json`);
      
      return { processed: successful, errors: failed, meetingsCreated, results };
      
    } catch (error) {
      console.error('❌ Enhanced video processing failed:', error.message);
      throw error;
    }
  }
}

module.exports = NewMeetingVideoProcessor;

// Run if called directly
if (require.main === module) {
  const processor = new NewMeetingVideoProcessor();
  processor.processAllVideosWithMeetingCreation()
    .then((result) => {
      console.log('\n🎉 Enhanced video processing completed successfully!');
      console.log(`Processed ${result.processed} videos, created ${result.meetingsCreated} new meetings, ${result.errors} errors`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Enhanced video processing failed:', error.message);
      process.exit(1);
    });
}