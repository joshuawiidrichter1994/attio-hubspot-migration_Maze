const axios = require('axios');
require('dotenv').config();

async function cleanupTestAssociation() {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const dealId = '388208250070';
    const meetingId = '386217958648';
    
    console.log('🧹 Cleaning up test association...');
    console.log(`Removing association between Deal ${dealId} and Meeting ${meetingId}`);
    
    try {
        const response = await axios.delete(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings/${meetingId}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        
        console.log(`✅ Cleanup successful: ${response.status}`);
        
        // Verify removal
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const verifyResponse = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/meetings`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log(`🔍 Verification: Deal now has ${verifyResponse.data.results.length} meeting associations`);
        
        if (verifyResponse.data.results.length === 0) {
            console.log('✅ Successfully removed test association - HubSpot is back to original state');
        } else {
            console.log('⚠️ Association still exists after deletion attempt');
        }
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error.response?.status || error.message);
        if (error.response?.data) {
            console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

cleanupTestAssociation();