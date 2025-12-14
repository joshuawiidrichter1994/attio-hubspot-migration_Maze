require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor.js');

async function testParticipantData() {
  console.log('\n🔍 Testing participant data structure...\n');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    // Get some Attio meeting data to check participant structure
    const meetings = await processor.attio.getAllMeetings();
    
    if (meetings.length === 0) {
      console.log('❌ No meetings found in Attio');
      return;
    }
    
    const meeting = meetings[0];
    console.log('📅 Meeting ID:', meeting.id.meeting_id);
    console.log('📧 Meeting title:', meeting.values?.title?.[0]?.value || 'No title');
    
    // Check all possible participant sources
    const sources = [
      'values.participants',
      'values.attendees', 
      'values.people',
      'participants',
      'attendees',
      'people'
    ];
    
    for (const source of sources) {
      const parts = source.split('.');
      let data = meeting;
      for (const part of parts) {
        data = data?.[part];
      }
      
      if (data && Array.isArray(data)) {
        console.log(`\n✅ Found participants in ${source}:`, data.length);
        data.slice(0, 3).forEach((p, i) => {
          console.log(`   ${i + 1}. Name: ${p.name || p.full_name || 'No name'}`);
          console.log(`      Email: ${p.email_address || p.email || 'No email'}`);
          console.log(`      Status: ${p.status || 'No status'}`);
          console.log(`      Host: ${p.is_organizer ? 'Yes' : 'No'}`);
          console.log(`      Raw data:`, JSON.stringify(p, null, 2));
          console.log('');
        });
        break;
      } else {
        console.log(`❌ No participants found in ${source}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing participant data:', error.message);
  }
}

testParticipantData();