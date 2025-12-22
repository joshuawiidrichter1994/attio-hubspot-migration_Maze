/**
 * Debug script to examine Attio meeting data structure
 */
require('dotenv').config();
const axios = require('axios');

async function debugMeetings() {
  try {
    console.log('🔍 Debug: Examining Attio meeting data structure...');
    
    const attioClient = axios.create({
      baseURL: 'https://api.attio.com',
      headers: {
        'Authorization': `Bearer ${process.env.ATTIO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Fetch more meetings to find imported ones
    const response = await attioClient.get('/v2/meetings', {
      params: {
        limit: 100
      }
    });

    const meetings = response.data.data || [];
    console.log(`📊 Found ${meetings.length} meetings to examine`);

    if (meetings.length > 0) {
      // Look for meetings with "Meeting imported from Attio" pattern in descriptions
      const meetingsImportedFromAttio = meetings.filter(meeting => 
        meeting.description && meeting.description.includes('Meeting imported from Attio')
      );

      console.log(`\n📈 Meetings imported from Attio: ${meetingsImportedFromAttio.length}/${meetings.length}`);
      
      if (meetingsImportedFromAttio.length > 0) {
        console.log('\n🎯 Sample imported meetings:');
        meetingsImportedFromAttio.slice(0, 5).forEach((meeting, i) => {
          console.log(`\n${i + 1}. Meeting: "${meeting.title}"`);
          console.log(`   ID: ${meeting.id.meeting_id}`);
          console.log(`   Description: ${meeting.description.substring(0, 300)}`);
          
          // Extract original ID from description
          const originalIdMatch = meeting.description.match(/Original ID:\s*([a-f0-9-]{36})/);
          if (originalIdMatch) {
            console.log(`   🎯 Extracted Original Attio ID: ${originalIdMatch[1]}`);
          }
        });
      }

      // Look for meetings with "Original ID:" pattern in descriptions
      const meetingsWithOriginalIds = meetings.filter(meeting => 
        meeting.description && meeting.description.includes('Original ID:')
      );

      console.log(`\n📈 Meetings with "Original ID:" in descriptions: ${meetingsWithOriginalIds.length}/${meetings.length}`);
      
      if (meetingsWithOriginalIds.length > 0) {
        console.log('\n🎯 Sample meetings with Original IDs:');
        meetingsWithOriginalIds.slice(0, 3).forEach((meeting, i) => {
          console.log(`\n${i + 1}. Meeting: "${meeting.title}"`);
          console.log(`   ID: ${meeting.id.meeting_id}`);
          console.log(`   Description: ${meeting.description.substring(0, 300)}...`);
          
          // Extract original ID from description
          const originalIdMatch = meeting.description.match(/Original ID:\s*([a-f0-9-]{36})/);
          if (originalIdMatch) {
            console.log(`   🎯 Extracted Original ID: ${originalIdMatch[1]}`);
          }
        });
      }

      // Also show first few meetings to see the actual structure
      console.log('\n📋 Sample meeting descriptions:');
      meetings.slice(0, 5).forEach((meeting, i) => {
        console.log(`\n${i + 1}. "${meeting.title}"`);
        if (meeting.description) {
          console.log(`   Description: ${meeting.description.substring(0, 200)}...`);
        } else {
          console.log(`   Description: (none)`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Error examining meetings:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

debugMeetings().catch(console.error);