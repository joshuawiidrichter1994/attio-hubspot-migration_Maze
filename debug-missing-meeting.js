/**
 * EFFICIENT debug script to check specific missing meeting in Attio
 */

require('dotenv').config();
const AttioAPI = require('./src/utils/attio-api');

async function debugMissingMeeting() {
  try {
    console.log('🎯 EFFICIENT DEBUG: Checking specific missing meeting...\n');
    
    const attio = new AttioAPI();
    const targetMeetingId = '76738b68-d2eb-432e-8d53-cb8e2c73eef7'; // Maze <> Centuri Dec 5
    const targetCallId = 'a0e46dd4-a68d-4e5d-86ce-7d21d7bcd7a6';
    
    console.log(`🎯 Target meeting ID: ${targetMeetingId}`);
    console.log(`🎯 Target call ID: ${targetCallId}`);
    console.log(`📅 Expected: Dec 5, 2024 - "Maze <> Centuri – Demo + POC"`);
    console.log();
    
    // APPROACH 1: Try direct API call by ID (if Attio supports it)
    console.log('🚀 APPROACH 1: Testing direct meeting fetch...');
    try {
      const directUrl = `/v2/meetings/${targetMeetingId}`;
      console.log(`   🔗 Trying: GET ${directUrl}`);
      const directResponse = await attio.client.get(directUrl);
      console.log(`   ✅ SUCCESS! Found meeting directly:`);
      console.log(`   📋 Data:`, JSON.stringify(directResponse.data, null, 2));
    } catch (error) {
      console.log(`   ❌ Direct fetch failed: ${error.response?.status} ${error.response?.statusText}`);
      console.log(`   💡 Attio may not support direct meeting lookup by ID`);
    }
    
    // APPROACH 2: Date-filtered search (Dec 1-7, 2025)
    console.log(`\n🚀 APPROACH 2: Scanning Dec 1-7, 2025 meetings only...`);
    const startDate = new Date('2025-12-01T00:00:00Z');
    const endDate = new Date('2025-12-07T23:59:59Z');
    
    let found = false;
    let cursor = null;
    let totalChecked = 0;
    let batchCount = 0;
    
    console.log(`   📅 Scanning range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   💡 Note: Meeting shows as 2025-12-05, so should appear in this range!`);
    
    do {
      batchCount++;
      const response = await attio.getMeetings(cursor);
      const batch = response.data;
      
      // Filter to Dec 1-7, 2024 only
      const filteredBatch = batch.filter(meeting => {
        const meetingDate = attio.extractMeetingDate(meeting);
        if (!meetingDate) return false;
        return meetingDate >= startDate && meetingDate <= endDate;
      });
      
      totalChecked += filteredBatch.length;
      console.log(`   📦 Batch ${batchCount}: ${batch.length} total, ${filteredBatch.length} in Dec 1-7`);
      
      // Check for our target in this filtered batch
      const targetFound = filteredBatch.find(meeting => 
        meeting.id?.meeting_id === targetMeetingId ||
        (meeting.values?.title && meeting.values.title.toLowerCase().includes('maze') && 
         meeting.values.title.toLowerCase().includes('centuri'))
      );
      
      if (targetFound) {
        console.log(`\n   🎯 FOUND TARGET MEETING!`);
        console.log(`   📋 Full data:`, JSON.stringify(targetFound, null, 2));
        found = true;
        break;
      }
      
      // Show all December meetings for context
      if (filteredBatch.length > 0) {
        console.log(`   📋 December meetings in this batch:`);
        filteredBatch.forEach((meeting, i) => {
          const title = meeting.values?.title || 'No title';
          const id = meeting.id?.meeting_id || 'No ID';
          const date = attio.extractMeetingDate(meeting);
          console.log(`      ${i+1}. ${date?.toISOString()?.split('T')[0]} - ${title.substring(0, 60)}... (${id.substring(0, 8)}...)`);
        });
      }
      
      cursor = response.pagination?.next_cursor || null;
      
      // Safety: Don't scan more than 10 batches for December
      if (batchCount >= 10) {
        console.log(`   ⚠️  Stopping after ${batchCount} batches to avoid excessive scanning`);
        break;
      }
      
    } while (cursor && !found);
    
    console.log(`\n📊 RESULTS:`);
    console.log(`   📈 Batches scanned: ${batchCount}`);
    console.log(`   📈 December meetings checked: ${totalChecked}`);
    console.log(`   🎯 Target meeting found: ${found ? '✅ YES' : '❌ NO'}`);
    
    if (!found) {
      console.log(`\n❌ CONCLUSION: Meeting ${targetMeetingId} NOT FOUND in Attio /v2/meetings API`);
      console.log(`   💡 This suggests the missing "calls" are NOT in the meetings endpoint`);
      console.log(`   💡 They might be in a different Attio API or filtered out by type/status`);
    }
    
  } catch (error) {
    console.error('❌ Error during debug:', error.message);
  }
}

// Run the debug
debugMissingMeeting().catch(console.error);