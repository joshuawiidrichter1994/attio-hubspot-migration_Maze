const axios = require('axios');
require('dotenv').config();

async function testDefaultAssociation() {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const dealId = '388208250070';
    const meetingId = '386217958648';
    
    console.log('🎯 Testing DEFAULT (unlabeled) association per HubSpot docs...');
    console.log(`Deal: ${dealId}, Meeting: ${meetingId}`);
    console.log('');

    try {
        // Method from docs: "unlabeled associations for records in bulk"
        // POST to /crm/v4/associations/{fromObjectType}/{toObjectType}/batch/associate/default
        console.log('1️⃣ Testing batch default association...');
        
        const response = await axios.post(
            'https://api.hubapi.com/crm/v4/associations/meetings/deals/batch/associate/default',
            {
                "inputs": [
                    {
                        "from": { "id": meetingId },
                        "to": { "id": dealId }
                    }
                ]
            },
            {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(response.data, null, 2));
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const verifyResponse = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log(`   Verification: ${verifyResponse.data.results.length} associations found`);
        
        if (verifyResponse.data.results.length > 0) {
            console.log('   🎉 SUCCESS! Default association worked!');
            verifyResponse.data.results.forEach(meeting => {
                console.log(`   Meeting ${meeting.id} associated`);
            });
        } else {
            console.log('   ❌ Default association also failed');
        }
        
    } catch (error) {
        console.log(`   ❌ Error: ${error.response?.status || error.message}`);
        if (error.response?.data) {
            console.log('   Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testDefaultAssociation();