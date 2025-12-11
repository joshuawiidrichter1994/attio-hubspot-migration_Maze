const VideoProcessor = require('./video-processor');

/**
 * Test script to validate video processing on just a few videos
 */
async function testVideoProcessing() {
  console.log('🧪 TESTING VIDEO PROCESSING WITH SMALL SAMPLE...\n');
  
  const processor = new VideoProcessor();
  
  try {
    // Get all video files
    const videoFiles = await processor.getVideoFiles();
    console.log(`Found ${videoFiles.length} total video files`);
    
    // Take just the first 3 videos for testing
    const testVideos = videoFiles.slice(0, 3);
    console.log(`\nTesting with ${testVideos.length} videos:`);
    testVideos.forEach((video, index) => {
      console.log(`${index + 1}. ${video.filename} (Meeting: ${video.meetingId})`);
    });
    
    // Test each step of the pipeline
    for (const video of testVideos) {
      console.log(`\n🎬 Testing pipeline for: ${video.filename}`);
      
      try {
        // Step 1: Generate transcript
        console.log('  📝 Testing transcript generation...');
        const transcript = await processor.generateTranscript(video);
        console.log(`  ✅ Transcript generated (${transcript.length} characters)`);
        
        // Step 2: Find matching meeting
        console.log('  🔍 Testing meeting matching...');
        const meetingMatch = await processor.findMatchingMeeting(video);
        
        if (meetingMatch) {
          console.log(`  ✅ Meeting found: ${meetingMatch.meeting.id} (confidence: ${meetingMatch.confidence})`);
          console.log(`     Title: ${meetingMatch.meeting.properties?.hs_meeting_title || 'No title'}`);
        } else {
          console.log('  ⚠️  No matching meeting found');
        }
        
        // For testing, we won't actually upload files or update meetings
        console.log('  ⏭️  Skipping actual upload and meeting updates for test');
        
      } catch (error) {
        console.error(`  ❌ Error testing ${video.filename}:`, error.message);
      }
    }
    
    console.log('\n✅ Testing completed! Ready for full processing.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testVideoProcessing()
    .then(() => {
      console.log('\n🎉 Test completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test failed:', error.message);
      process.exit(1);
    });
}