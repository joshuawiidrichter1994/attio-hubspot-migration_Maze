const HubSpotAPI = require('./utils/hubspot-api');

/**
 * Analyze the format of attio_meeting_id values in existing HubSpot meetings
 * to understand how they were stored during the original migration
 */
async function analyzeAttioMeetingIds() {
  console.log('🔍 ANALYZING ATTIO MEETING ID FORMATS IN HUBSPOT...\n');
  
  const hubspot = new HubSpotAPI();
  
  try {
    // Get a sample of meetings with attio_meeting_id
    console.log('📋 Fetching HubSpot meetings with Attio IDs...');
    const meetings = await hubspot.getAllMeetings();
    
    // Filter for meetings that have attio_meeting_id
    const meetingsWithAttioId = meetings.filter(meeting => 
      meeting.properties?.attio_meeting_id
    );
    
    console.log(`Found ${meetingsWithAttioId.length} meetings with attio_meeting_id out of ${meetings.length} total meetings\n`);
    
    // Analyze the first 10 Attio meeting IDs to understand the format
    console.log('📊 SAMPLE ATTIO MEETING ID FORMATS:');
    console.log('=' .repeat(80));
    
    meetingsWithAttioId.slice(0, 10).forEach((meeting, index) => {
      const attioId = meeting.properties.attio_meeting_id;
      const title = meeting.properties?.hs_meeting_title || 'No title';
      console.log(`${index + 1}. ${attioId}`);
      console.log(`   Title: ${title}`);
      console.log(`   HubSpot ID: ${meeting.id}`);
      console.log('');
    });
    
    // Check if any of our video meeting IDs match the stored format
    console.log('🎥 TESTING VIDEO FILENAME MATCHING:');
    console.log('=' .repeat(80));
    
    // Test the first few video filenames we found earlier
    const testVideoNames = [
      '00514438-17c6-4a78-8c56-1d639c96bab8_462ccff2-79f9-4116-9953-50d20d5bef87.mp4',
      '00891be9-cd8f-4f23-9db0-0cf7a6c3d4a5_e76f7df9-fb34-42fb-bd75-4e5272b8f8e9.mp4',
      'b6b6a3eb-b4a1-42d3-bb6d-f0fd750f89c2_4dabf491-4001-4fac-a99d-e12153ad83d7.mp4'
    ];
    
    for (const videoName of testVideoNames) {
      const [meetingId, callId] = videoName.replace('.mp4', '').split('_');
      
      // Check if the meeting ID matches any stored attio_meeting_id
      const exactMatch = meetingsWithAttioId.find(meeting => 
        meeting.properties.attio_meeting_id === meetingId
      );
      
      // Check if the call ID matches any stored attio_meeting_id  
      const callIdMatch = meetingsWithAttioId.find(meeting => 
        meeting.properties.attio_meeting_id === callId
      );
      
      // Check for partial matches
      const partialMatches = meetingsWithAttioId.filter(meeting => 
        meeting.properties.attio_meeting_id.includes(meetingId) ||
        meeting.properties.attio_meeting_id.includes(callId)
      );
      
      console.log(`Video: ${videoName}`);
      console.log(`  Meeting ID: ${meetingId}`);
      console.log(`  Call ID: ${callId}`);
      console.log(`  Exact meeting ID match: ${exactMatch ? `✅ ${exactMatch.id}` : '❌ None'}`);
      console.log(`  Exact call ID match: ${callIdMatch ? `✅ ${callIdMatch.id}` : '❌ None'}`);
      console.log(`  Partial matches: ${partialMatches.length > 0 ? `✅ ${partialMatches.length} found` : '❌ None'}`);
      
      if (partialMatches.length > 0) {
        partialMatches.slice(0, 2).forEach(match => {
          console.log(`    - ${match.properties.attio_meeting_id} (${match.id})`);
        });
      }
      console.log('');
    }
    
    // Analyze patterns in the stored attio_meeting_id values
    console.log('🔍 PATTERN ANALYSIS:');
    console.log('=' .repeat(80));
    
    const attioIds = meetingsWithAttioId.map(m => m.properties.attio_meeting_id);
    const uniqueFormats = new Set();
    
    attioIds.forEach(id => {
      if (id.includes('_')) {
        uniqueFormats.add('contains_underscore');
      } else if (id.includes('-')) {
        uniqueFormats.add('uuid_format');
      } else {
        uniqueFormats.add('other_format');
      }
    });
    
    console.log(`Unique patterns found: ${Array.from(uniqueFormats).join(', ')}`);
    console.log(`Total unique Attio IDs: ${new Set(attioIds).size}`);
    
    // Check for UUID format consistency
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidFormatIds = attioIds.filter(id => uuidPattern.test(id));
    console.log(`UUID format IDs: ${uuidFormatIds.length}/${attioIds.length}`);
    
    console.log('\n✅ Analysis completed!');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    throw error;
  }
}

// Run the analysis
if (require.main === module) {
  analyzeAttioMeetingIds()
    .then(() => {
      console.log('\n🎉 Analysis completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Analysis failed:', error.message);
      process.exit(1);
    });
}