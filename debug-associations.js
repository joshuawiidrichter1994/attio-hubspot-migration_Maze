const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor.js');

async function debugAssociations() {
  console.log('🔍 DEBUGGING ASSOCIATION CREATION...\n');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    // Get first few Attio meetings
    console.log('📥 Fetching Attio meetings...');
    const attioMeetings = await processor.attio.getAllMeetings();
    console.log(`Found ${attioMeetings.length} Attio meetings`);
    
    if (attioMeetings.length === 0) {
      console.log('❌ No Attio meetings found!');
      return;
    }
    
    // Get existing HubSpot meetings
    console.log('📥 Fetching HubSpot meetings...');
    const hubspotMeetings = await processor.hubspot.getAllMeetings();
    console.log(`Found ${hubspotMeetings.length} HubSpot meetings`);
    
    if (hubspotMeetings.length === 0) {
      console.log('❌ No HubSpot meetings found!');
      return;
    }
    
    // Take the first HubSpot meeting and first Attio meeting for debugging
    const hubspotMeeting = hubspotMeetings[0];
    const attioMeeting = attioMeetings[0];
    
    console.log(`Found ${hubspotMeetings.length} HubSpot meetings`);

    console.log('\n🔍 DEBUGGING MEETING ASSOCIATION:');
    
    // Debug HubSpot meeting structure first  
    console.log('First HubSpot meeting structure:');
    if (hubspotMeetings.length > 0) {
        const firstMeeting = hubspotMeetings[0];
        console.log('Meeting object keys:', Object.keys(firstMeeting));
        
        // For legacy engagements, check engagement and metadata structure
        if (firstMeeting.engagement) {
            console.log('Engagement structure:', {
                id: firstMeeting.engagement.id,
                type: firstMeeting.engagement.type,
                timestamp: firstMeeting.engagement.timestamp
            });
            console.log('Metadata keys:', firstMeeting.metadata ? Object.keys(firstMeeting.metadata) : 'No metadata');
            
            if (firstMeeting.metadata) {
                console.log('Sample metadata:', {
                    title: firstMeeting.metadata.title,
                    body: firstMeeting.metadata.body ? firstMeeting.metadata.body.substring(0, 50) + '...' : undefined,
                    attio_meeting_id: firstMeeting.metadata.attio_meeting_id,
                    attio_id: firstMeeting.metadata.attio_id
                });
            }
        }
    }
    
    // Find a meeting that exists in both systems by checking for attio_meeting_id in metadata
    let foundMatch = false;
    let checkedCount = 0;
    
    console.log('\n🔍 Searching for meetings with Attio IDs...');
    
    for (const hubspotMeeting of hubspotMeetings.slice(0, 100)) { // Check first 100 meetings
        checkedCount++;
        
        if (!hubspotMeeting || !hubspotMeeting.engagement || !hubspotMeeting.metadata) {
            if (checkedCount <= 5) { // Only log first few to avoid spam
                console.log(`⚠️ Skipping meeting without metadata: ${hubspotMeeting?.engagement?.id || 'unknown ID'}`);
            }
            continue;
        }
        
        // Check for Attio meeting ID in metadata
        const attioId = hubspotMeeting.metadata.attio_meeting_id || hubspotMeeting.metadata.attio_id;
        
        if (attioId) {
            console.log(`✅ Found HubSpot meeting with Attio ID: ${attioId} (HubSpot ID: ${hubspotMeeting.engagement.id})`);
            
            // Find corresponding Attio meeting
            const attioMeeting = attioMeetings.find(a => a.id.id === attioId);
            
            if (attioMeeting) {
                console.log('✅ Found matching meeting pair!');
                console.log('HubSpot Meeting ID:', hubspotMeeting.engagement.id);
                console.log('Attio Meeting ID:', attioMeeting.id.id);
                console.log('Meeting Title:', attioMeeting.values.title || 'No title');
                
                await processor.createAssociationsForMeeting(attioMeeting, hubspotMeeting.engagement.id);
                foundMatch = true;
                break;
            } else {
                console.log(`❌ No matching Attio meeting found for ID: ${attioId}`);
            }
        }
    }
    
    console.log(`\n📊 Checked ${checkedCount} HubSpot meetings`);
    
    if (!foundMatch) {
        console.log(`❌ No meetings with Attio IDs found in first ${checkedCount} HubSpot meetings`);
        
        // Check if we have any valid Attio meetings to test association logic
        if (attioMeetings.length > 0) {
            console.log('\n🧪 Testing association logic with real HubSpot meeting:');
            const firstAttioMeeting = attioMeetings[0];
            const firstHubSpotMeeting = hubspotMeetings[0];
            
            console.log('Attio Meeting structure:', Object.keys(firstAttioMeeting));
            console.log('Attio Meeting ID:', firstAttioMeeting.id?.meeting_id || 'undefined');
            console.log('Meeting Title:', firstAttioMeeting.title || 'No title');
            
            console.log('HubSpot Meeting ID:', firstHubSpotMeeting.engagement?.id);
            console.log('HubSpot Meeting Title:', firstHubSpotMeeting.metadata?.title);
            console.log('Full Attio meeting preview:', JSON.stringify(firstAttioMeeting, null, 2).substring(0, 800) + '...');
            
            try {
                // For legacy engagement meetings, we need to pass the engagement ID as a proper meeting object
                const meetingForAssociation = {
                    id: firstHubSpotMeeting.engagement.id,
                    engagement: firstHubSpotMeeting.engagement,
                    metadata: firstHubSpotMeeting.metadata
                };
                // Correct parameter order: (hubspotMeeting, attioMeeting)
                await processor.createAssociationsForMeeting(meetingForAssociation, firstAttioMeeting);
            } catch (err) {
                console.error('❌ Test association failed:', err.message);
            }
        }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  }
}

debugAssociations();