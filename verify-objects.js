const HubSpotAPI = require('./src/utils/hubspot-api');

async function verifyObjects() {
    console.log('🔍 Verifying objects exist before testing associations');
    console.log('');

    const api = new HubSpotAPI();
    
    try {
        // Check if deal exists
        console.log('1️⃣ Checking deal 388208250070...');
        const deal = await api.client.get(`/crm/v3/objects/deals/388208250070?properties=dealname,dealstage`);
        console.log(`   ✅ Deal exists: "${deal.data.properties.dealname}"`);
        console.log(`   Stage: ${deal.data.properties.dealstage}`);
        
        // Check if meeting exists  
        console.log('');
        console.log('2️⃣ Checking meeting 386217958648...');
        const meeting = await api.client.get(`/crm/v3/objects/meetings/386217958648?properties=hs_meeting_title,hs_meeting_start_time`);
        console.log(`   ✅ Meeting exists: "${meeting.data.properties.hs_meeting_title || 'No title'}"`);
        console.log(`   Start: ${meeting.data.properties.hs_meeting_start_time}`);
        
        console.log('');
        console.log('✅ Both objects exist - the association should work!');
        console.log('❌ This confirms there is a bug in the association creation');
        
    } catch (error) {
        console.error(`❌ Error checking objects: ${error.message}`);
        if (error.response?.status === 404) {
            console.error('🚨 Object does not exist! This explains why association fails.');
        }
        if (error.response?.data) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

verifyObjects();