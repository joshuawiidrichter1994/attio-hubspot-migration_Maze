/**
 * Debug script to examine actual Attio meeting data structure for association data
 */

const AttioAPI = require('./src/utils/attio-api');

async function debugMeetingData() {
  console.log('🔍 Checking Attio meeting data structure for associations...');
  
  const attio = new AttioAPI();
  
  try {
    // Get a few meetings to examine their structure
    const response = await attio.getMeetings(5);
    const meetings = response.data;
    
    console.log(`\n📊 Found ${meetings.length} meetings to examine\n`);
    
    for (let i = 0; i < Math.min(3, meetings.length); i++) {
      const meeting = meetings[i];
      console.log(`\n📋 Meeting ${i + 1}: ${meeting.values?.title?.[0]?.value || 'No title'}`);
      console.log(`   ID: ${meeting.id?.meeting_id}`);
      console.log(`   Values keys: [${Object.keys(meeting.values || {}).join(', ')}]`);
      
      // Check for participant fields
      const values = meeting.values || {};
      const participantFields = ['participants', 'attendees', 'people', 'contacts'];
      let foundParticipants = false;
      
      for (const field of participantFields) {
        if (values[field] && Array.isArray(values[field]) && values[field].length > 0) {
          console.log(`   📝 Found ${values[field].length} ${field}:`, values[field].map(p => ({
            id: p.target_record_id || p.id,
            type: p.target_object || p.type
          })));
          foundParticipants = true;
        }
      }
      
      // Check for company fields
      const companyFields = ['companies', 'accounts', 'organizations'];
      let foundCompanies = false;
      
      for (const field of companyFields) {
        if (values[field] && Array.isArray(values[field]) && values[field].length > 0) {
          console.log(`   🏢 Found ${values[field].length} ${field}:`, values[field].map(c => ({
            id: c.target_record_id || c.id,
            type: c.target_object || c.type
          })));
          foundCompanies = true;
        }
      }
      
      // Check for deal fields
      const dealFields = ['deals', 'opportunities'];
      let foundDeals = false;
      
      for (const field of dealFields) {
        if (values[field] && Array.isArray(values[field]) && values[field].length > 0) {
          console.log(`   💼 Found ${values[field].length} ${field}:`, values[field].map(d => ({
            id: d.target_record_id || d.id,
            type: d.target_object || d.type
          })));
          foundDeals = true;
        }
      }
      
      if (!foundParticipants && !foundCompanies && !foundDeals) {
        console.log('   ⚠️ No association data found');
        
        // Let's see what fields DO exist
        console.log('   🔍 All available fields:');
        for (const [key, value] of Object.entries(values)) {
          if (Array.isArray(value) && value.length > 0) {
            console.log(`       ${key}: ${value.length} items - ${JSON.stringify(value[0])}`);
          } else if (value) {
            console.log(`       ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error examining meeting data:', error.message);
  }
}

debugMeetingData().then(() => {
  console.log('\n✅ Meeting data analysis complete');
}).catch(error => {
  console.error('Failed to analyze meeting data:', error);
});