const HubSpotAPI = require('./src/utils/hubspot-api');

async function checkJamesMeeting() {
  const hubspot = new HubSpotAPI();
  
  try {
    console.log('🔍 Checking James Garland meeting...');
    const response = await hubspot.client.get('/crm/v3/objects/meetings/386431967465', {
      params: { properties: 'hs_meeting_title,hs_meeting_body' }
    });
    
    console.log('Title:', response.data.properties.hs_meeting_title);
    console.log('Body length:', response.data.properties.hs_meeting_body?.length || 0);
    
    const body = response.data.properties.hs_meeting_body || '';
    if (body.length > 0) {
      console.log('\nBody ends with:');
      console.log(body.slice(-500));
      
      // Check if transcript section exists
      if (body.includes('📄 CALL TRANSCRIPT')) {
        const transcriptStart = body.indexOf('📄 CALL TRANSCRIPT');
        const transcriptPart = body.substring(transcriptStart);
        console.log('\nTranscript section length:', transcriptPart.length);
        console.log('Transcript ends with:');
        console.log(transcriptPart.slice(-200));
      }
    } else {
      console.log('Meeting body is empty!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkJamesMeeting();