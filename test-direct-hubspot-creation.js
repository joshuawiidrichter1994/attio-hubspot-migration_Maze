const HubSpotAPI = require('./src/utils/hubspot-api');

/**
 * Test direct HubSpot meeting creation to see if hs_attendee_emails field works
 */

async function testDirectMeetingCreation() {
  try {
    console.log('🧪 Testing direct HubSpot meeting creation with attendee emails...\n');
    
    const hubspot = new HubSpotAPI();
    
    const testMeetingData = {
      properties: {
        hs_meeting_title: "TEST: Attendee Email Verification",
        hs_meeting_body: "Testing if hs_attendee_emails field works properly",
        hs_timestamp: new Date().getTime(),
        hs_meeting_start_time: new Date().toISOString(),
        hs_attendee_emails: "test1@example.com;test2@mazehq.com;rj@theoryvc.com"
      }
    };
    
    console.log('📤 Creating meeting with payload:');
    console.log(JSON.stringify(testMeetingData, null, 2));
    
    // Create the meeting
    const response = await hubspot.client.post('/crm/v3/objects/meetings', testMeetingData);
    
    console.log('\n✅ Meeting created successfully!');
    console.log(`📝 Meeting ID: ${response.data.id}`);
    
    // Now fetch it back to see what was actually saved
    const savedMeeting = await hubspot.client.get(`/crm/v3/objects/meetings/${response.data.id}`, {
      params: {
        properties: 'hs_meeting_title,hs_meeting_body,hs_attendee_emails'
      }
    });
    
    console.log('\n🔍 Retrieved meeting data:');
    console.log(`   Title: ${savedMeeting.data.properties.hs_meeting_title}`);
    console.log(`   Body: ${savedMeeting.data.properties.hs_meeting_body}`);
    console.log(`   Attendee emails: "${savedMeeting.data.properties.hs_attendee_emails || 'EMPTY'}"`);
    
    // Check if attendee emails were preserved
    const originalEmails = "test1@example.com;test2@mazehq.com;rj@theoryvc.com";
    const savedEmails = savedMeeting.data.properties.hs_attendee_emails || "";
    
    if (savedEmails === originalEmails) {
      console.log('\n🎉 SUCCESS: hs_attendee_emails field was preserved correctly!');
    } else {
      console.log('\n🚨 PROBLEM: hs_attendee_emails field was modified or lost!');
      console.log(`   Expected: "${originalEmails}"`);
      console.log(`   Got: "${savedEmails}"`);
    }
    
    // Clean up - delete the test meeting
    console.log('\n🧹 Cleaning up test meeting...');
    await hubspot.client.delete(`/crm/v3/objects/meetings/${response.data.id}`);
    console.log('✅ Test meeting deleted');
    
  } catch (error) {
    console.error('❌ Error testing direct meeting creation:', error.response?.data || error.message);
  }
}

testDirectMeetingCreation();