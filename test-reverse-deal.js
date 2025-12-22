const HubSpotAPI = require('./src/utils/hubspot-api');
require('dotenv').config();

async function testReverseDealAssociation() {
    console.log('🔄 Testing REVERSE association: Deal → Meeting...');
    
    const hubspot = new HubSpotAPI();
    const dealId = '388208250070';
    const meetingId = '386217958648';
    
    console.log(`Deal: ${dealId}`);
    console.log(`Meeting: ${meetingId}`);
    console.log('');

    try {
        // Try Deal → Meeting instead of Meeting → Deal
        // From HubSpot docs: Deal to meeting = 211
        console.log('1️⃣ Testing Deal → Meeting (type 211)...');
        
        const associations = [{
            fromObjectType: 'deals',
            fromObjectId: parseInt(dealId),
            toObjectType: 'meetings',
            toObjectId: parseInt(meetingId),
            associationTypeId: 211
        }];
        
        console.log('Association payload:', JSON.stringify(associations[0], null, 2));
        
        const result = await hubspot.batchCreateAssociations(associations);
        console.log('✅ Result:', JSON.stringify(result, null, 2));
        
        // Verify both directions
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const axios = require('axios');
        const token = process.env.HUBSPOT_ACCESS_TOKEN;
        
        console.log('🔍 Checking associations in both directions...');
        
        // Check deal → meetings
        const dealMeetingsResponse = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        // Check meeting → deals
        const meetingDealsResponse = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/meetings/${meetingId}/associations/deals`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log(`   Deal → Meetings: ${dealMeetingsResponse.data.results.length} found`);
        console.log(`   Meeting → Deals: ${meetingDealsResponse.data.results.length} found`);
        
        if (dealMeetingsResponse.data.results.length > 0 || meetingDealsResponse.data.results.length > 0) {
            console.log('🎉 SUCCESS! Reverse association worked!');
        } else {
            console.log('❌ Reverse association also failed');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testReverseDealAssociation();