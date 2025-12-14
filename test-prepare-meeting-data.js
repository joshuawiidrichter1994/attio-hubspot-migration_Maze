const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

/**
 * Test the prepareMeetingData method to see what it produces for external participants
 */

async function testPrepareMeetingData() {
  try {
    console.log('🔍 Testing prepareMeetingData with external participants...\n');
    
    const processor = new ComprehensiveMeetingProcessor();
    
    // Get the first meeting from our raw API data that has external participants
    const firstMeeting = {
      "id": {
        "meeting_id": "4f6ca46b-c8e8-4a92-83fd-05d737a71b09"
      },
      "values": {
        "title": [
          {
            "value": "🎁  Kristin's Birthday!",
            "is_default": false
          }
        ],
        "start_time": [
          {
            "value": "2024-12-25T00:00:00.000Z",
            "is_default": false
          }
        ],
        "end_time": [
          {
            "value": "2024-12-25T01:00:00.000Z",
            "is_default": false
          }
        ],
        "description": []
      },
      "participants": [
        {
          "status": "accepted",
          "email_address": "c_6e57373a066108ce3bd2b26c8883f808a4383d44ea131f99b144be1a3c3e9c35@group.calendar.google.com",
          "is_organizer": true
        },
        {
          "status": "pending",
          "email_address": "team@theory.ventures",
          "is_organizer": false
        },
        {
          "status": "pending", 
          "email_address": "rj@theoryvc.com",
          "is_organizer": false
        }
      ]
    };

    // Call prepareMeetingData
    const meetingData = processor.prepareMeetingData(firstMeeting);
    
    console.log('📋 Result from prepareMeetingData:');
    console.log(JSON.stringify(meetingData, null, 2));
    
    // Specifically check attendee emails
    console.log('\\n🎯 Key findings:');
    console.log(`📧 hs_attendee_emails: "${meetingData.properties.hs_attendee_emails || 'NOT SET'}"`);
    console.log(`👥 Participants in description: ${meetingData.properties.hs_meeting_body.includes('Attio participants:')}`);
    
    if (meetingData.properties.hs_attendee_emails) {
      const emails = meetingData.properties.hs_attendee_emails.split(';');
      console.log(`✅ Found ${emails.length} attendee emails:`);
      emails.forEach(email => console.log(`   - ${email.trim()}`));
    } else {
      console.log('❌ NO attendee emails found in hs_attendee_emails field!');
    }
    
  } catch (error) {
    console.error('❌ Error testing prepareMeetingData:', error.message);
    console.error(error.stack);
  }
}

testPrepareMeetingData();