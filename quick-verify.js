const axios = require('axios');
require('dotenv').config();

async function quickVerify() {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const dealId = '388208250070';
    const meetingId = '386217958648';
    
    console.log('🔍 Quick verification of association...');
    
    try {
        // Check deal's meeting associations
        const response = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        
        console.log(`✅ Deal has ${response.data.results.length} meeting associations:`);
        response.data.results.forEach(meeting => {
            console.log(`   Meeting ${meeting.id} - ${meeting.toObjectId}`);
            if (meeting.id === meetingId || meeting.toObjectId === meetingId) {
                console.log(`   🎯 FOUND! Our meeting ${meetingId} is associated!`);
            }
        });
        
        if (response.data.results.length === 0) {
            console.log('❌ NO ASSOCIATIONS FOUND - The association creation failed!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

quickVerify();