const HubSpotAPI = require('./src/utils/hubspot-api');
require('dotenv').config();

async function testDealAssociation() {
    console.log('🎯 Testing DEAL association specifically...');
    
    const hubspot = new HubSpotAPI();
    const dealId = '388208250070';
    const meetingId = '386217958648';
    
    console.log(`Deal: ${dealId}`);
    console.log(`Meeting: ${meetingId}`);
    console.log('');

    try {
        // Test with the ID from comprehensive-meeting-processor.js (204)
        console.log('1️⃣ Testing with association type ID 204 (from working script)...');
        
        const associations = [{
            fromObjectType: 'meetings',
            fromObjectId: parseInt(meetingId),
            toObjectType: 'deals',
            toObjectId: parseInt(dealId),
            associationTypeId: 204  // Using the working script's ID
        }];
        
        console.log('Association payload:', JSON.stringify(associations[0], null, 2));
        
        const result = await hubspot.batchCreateAssociations(associations);
        console.log('✅ Result:', JSON.stringify(result, null, 2));
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const axios = require('axios');
        const token = process.env.HUBSPOT_ACCESS_TOKEN;
        
        const verifyResponse = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log(`🔍 Verification: Deal has ${verifyResponse.data.results.length} meeting associations`);
        
        if (verifyResponse.data.results.length > 0) {
            console.log('🎉 SUCCESS! Deal association worked with type ID 204!');
            verifyResponse.data.results.forEach(meeting => {
                console.log(`   Meeting ${meeting.id} associated`);
            });
        } else {
            console.log('❌ Association still failed with type ID 204');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testDealAssociation();