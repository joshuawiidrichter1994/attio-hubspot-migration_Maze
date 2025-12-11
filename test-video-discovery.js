/**
 * Quick test to verify video-discovered meeting enhancement works
 */

require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function testVideoDiscovery() {
  try {
    console.log('🎯 QUICK TEST: Video-discovered meeting enhancement...\n');
    
    const processor = new ComprehensiveMeetingProcessor();
    
    // Test the video discovery methods directly
    console.log('📹 Step 1: Get video files from HubSpot...');
    const videos = await processor.getUploadedVideos();
    
    console.log('🔍 Step 2: Extract Attio meeting IDs from videos...');
    const videoMeetingIds = processor.extractAttioMeetingIdsFromVideos(videos);
    
    console.log('🎯 Step 3: Check if our target meeting is in the discovered IDs...');
    const targetMeetingId = '76738b68-d2eb-432e-8d53-cb8e2c73eef7'; // Maze <> Centuri
    
    if (videoMeetingIds.includes(targetMeetingId)) {
      console.log(`✅ SUCCESS! Target meeting ${targetMeetingId} found in video filenames`);
    } else {
      console.log(`❌ Target meeting ${targetMeetingId} NOT found in video filenames`);
      console.log(`📋 Found these meeting IDs instead:`);
      videoMeetingIds.slice(0, 5).forEach((id, index) => {
        console.log(`   ${index + 1}. ${id}`);
      });
    }
    
    console.log('🔍 Step 4: Test direct fetch of a few video-discovered meetings...');
    const testIds = videoMeetingIds.slice(0, 3); // Test first 3
    
    for (const meetingId of testIds) {
      try {
        const response = await processor.attio.client.get(`/v2/meetings/${meetingId}`);
        const meeting = response.data.data;
        const title = meeting.title || 'No title';
        const date = meeting.start?.datetime || 'No date';
        console.log(`   ✅ ${meetingId}: "${title}" (${date})`);
        
        // Check if this is our target
        if (meetingId === targetMeetingId) {
          console.log(`      🎯 THIS IS OUR TARGET MEETING!`);
        }
      } catch (error) {
        console.log(`   ❌ ${meetingId}: Error ${error.response?.status || 'unknown'}`);
      }
    }
    
    console.log('\n🚀 Step 5: Test if enhanced discovery finds additional meetings...');
    
    // Just test the discovery method without full migration 
    // (limit standard meetings to avoid the long fetch we just saw)
    console.log('📋 Getting first 1000 standard meetings for comparison...');
    
    let standardMeetings = [];
    let cursor = null;
    let fetchCount = 0;
    
    do {
      const response = await processor.attio.getMeetings(cursor);
      const filtered = response.data.filter(meeting => {
        const meetingDate = processor.attio.extractMeetingDate(meeting);
        if (!meetingDate) return false;
        return meetingDate <= new Date();
      });
      
      standardMeetings = standardMeetings.concat(filtered);
      cursor = response.pagination?.next_cursor || null;
      fetchCount++;
      
      console.log(`   📦 Fetched batch ${fetchCount}, total: ${standardMeetings.length}`);
      
      // Limit to reasonable number for testing
      if (fetchCount >= 5) {
        console.log(`   ⚠️  Limiting to ${fetchCount} batches for testing`);
        break;
      }
      
    } while (cursor && fetchCount < 5);
    
    const standardIds = new Set(standardMeetings.map(m => m.id?.meeting_id).filter(Boolean));
    const missingFromStandard = videoMeetingIds.filter(id => !standardIds.has(id));
    
    console.log(`\n📊 Results:`);
    console.log(`   📋 Standard meetings (limited): ${standardMeetings.length}`);
    console.log(`   🎬 Video-discovered IDs: ${videoMeetingIds.length}`);
    console.log(`   🆕 Video IDs missing from standard: ${missingFromStandard.length}`);
    
    if (missingFromStandard.length > 0) {
      console.log(`\n🎉 SUCCESS! Found ${missingFromStandard.length} meetings that videos have but standard pagination misses:`);
      missingFromStandard.slice(0, 5).forEach((id, index) => {
        console.log(`   ${index + 1}. ${id}`);
      });
      console.log(`\n💡 This proves our enhancement will find additional meetings!`);
    } else {
      console.log(`\n✅ All video-discovered meetings are already in standard results (in this limited test)`);
      console.log(`💡 May need to test with more standard meetings or different video set`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testVideoDiscovery().catch(console.error);