const HubSpotAPI = require('./src/utils/hubspot-api');

async function testAssociationDirect() {
    console.log('🧪 Testing direct association creation...');
    
    const hubspot = new HubSpotAPI();
    const dealId = 388208250070;
    const meetingId = 386217958648;
    
    // Test the exact same call that comprehensive-meeting-processor makes
    const associations = [{
        fromObjectType: 'meetings',
        fromObjectId: meetingId,
        toObjectType: 'deals', 
        toObjectId: dealId,
        associationTypeId: 204
    }];
    
    console.log('Creating association:', JSON.stringify(associations, null, 2));
    
    try {
        const result = await hubspot.batchCreateAssociations(associations);
        console.log('✅ Association result:', JSON.stringify(result, null, 2));
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify immediately
        const axios = require('axios');
        require('dotenv').config();
        
        const response = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings`,
            {
                headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` }
            }
        );
        
        console.log(`🔍 Verification: Deal has ${response.data.results.length} meeting associations:`);
        response.data.results.forEach(meeting => {
            console.log(`   Meeting ${meeting.id} - ${meeting.toObjectId}`);
        });
        
        if (response.data.results.length === 0) {
            console.log('❌ CRITICAL: Association creation is broken!');
        } else {
            console.log('✅ SUCCESS: Association was created!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testAssociationDirect();