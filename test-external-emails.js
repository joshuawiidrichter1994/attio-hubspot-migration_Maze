const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

/**
 * Test creating a meeting with only external emails to see if HubSpot accepts them
 */

async function testExternalEmailsOnly() {
  try {
    console.log('🔍 Testing HubSpot meeting creation with only external emails...\n');
    
    const processor = new ComprehensiveMeetingProcessor();
    
    // Test data with only external emails (no Google Calendar group email)
    const testMeeting = {
      "id": {
        "meeting_id": "test-external-emails-only"
      },
      "values": {
        "title": [
          {
            "value": "Test External Emails Only",
            "is_default": false
          }
        ],
        "start_time": [
          {
            "value": "2024-12-25T15:00:00.000Z",
            "is_default": false
          }
        ],
        "end_time": [
          {
            "value": "2024-12-25T16:00:00.000Z", 
            "is_default": false
          }
        ],
        "description": [
          {
            "value": "Test meeting to verify external email handling",
            "is_default": false
          }
        ]
      },
      "participants": [
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

    console.log('📋 Test 1: prepareMeetingData with only external emails');
    const meetingData = processor.prepareMeetingData(testMeeting);
    console.log(`   ✅ hs_attendee_emails: "${meetingData.properties.hs_attendee_emails}"`);
    
    console.log('\\n📋 Test 2: Actually create the meeting in HubSpot');
    console.log('   ⚠️  WARNING: This will create a real meeting in HubSpot!');
    
    // Uncomment the next line to actually test meeting creation
    // const newMeeting = await processor.createMeetingFromAttio(testMeeting);
    
    console.log('\\n📋 Test 3: Testing with Google Calendar email only');
    const googleOnlyMeeting = {
      ...testMeeting,
      id: { meeting_id: "test-google-email-only" },
      values: {
        ...testMeeting.values,
        title: [{ value: "Test Google Email Only", is_default: false }]
      },
      participants: [
        {
          "status": "accepted",
          "email_address": "c_6e57373a066108ce3bd2b26c8883f808a4383d44ea131f99b144be1a3c3e9c35@group.calendar.google.com",
          "is_organizer": true
        }
      ]
    };
    
    const googleMeetingData = processor.prepareMeetingData(googleOnlyMeeting);
    console.log(`   ✅ Google email hs_attendee_emails: "${googleMeetingData.properties.hs_attendee_emails}"`);
    
    console.log('\\n🔍 Analysis:');
    console.log('1. External emails (theory.ventures, theoryvc.com) format correctly');
    console.log('2. Google Calendar group email format correctly');
    console.log('3. Issue must be in HubSpot API response or field validation');
    console.log('\\n💡 Next steps: Check HubSpot field restrictions and API response handling');
    
  } catch (error) {
    console.error('❌ Error testing external emails:', error.message);
    console.error(error.stack);
  }
}

testExternalEmailsOnly();