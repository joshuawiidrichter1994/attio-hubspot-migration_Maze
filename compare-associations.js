const HubSpotAPI = require('./src/utils/hubspot-api');
require('dotenv').config();

async function compareBothAssociations() {
    console.log('🔄 Comparing Company vs Deal associations side by side...');
    
    const hubspot = new HubSpotAPI();
    const dealId = '388208250070';
    const meetingId = '386217958648';
    
    // First, let's get a company ID from the meeting to compare
    console.log('1️⃣ Getting existing meeting company associations...');
    
    try {
        const axios = require('axios');
        const token = process.env.HUBSPOT_ACCESS_TOKEN;
        
        const meetingCompanies = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/meetings/${meetingId}/associations/companies`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (meetingCompanies.data.results.length === 0) {
            console.log('❌ No existing company associations found to compare');
            return;
        }
        
        const companyId = meetingCompanies.data.results[0].id;
        console.log(`   Found company ID: ${companyId}`);
        
        // Test 1: Create Meeting → Company (should work)
        console.log('\n2️⃣ Testing Meeting → Company (known working)...');
        
        const companyAssociations = [{
            fromObjectType: 'meetings',
            fromObjectId: parseInt(meetingId),
            toObjectType: 'companies',
            toObjectId: parseInt(companyId),
            associationTypeId: 188  // meeting_to_company
        }];
        
        console.log('Company association payload:', JSON.stringify(companyAssociations[0], null, 2));
        
        const companyResult = await hubspot.batchCreateAssociations(companyAssociations);
        console.log('Company result success:', companyResult[0]?.success);
        
        // Test 2: Create Meeting → Deal (exact same pattern)
        console.log('\n3️⃣ Testing Meeting → Deal (exact same pattern)...');
        
        const dealAssociations = [{
            fromObjectType: 'meetings',
            fromObjectId: parseInt(meetingId),
            toObjectType: 'deals',
            toObjectId: parseInt(dealId),
            associationTypeId: 212  // meeting_to_deal
        }];
        
        console.log('Deal association payload:', JSON.stringify(dealAssociations[0], null, 2));
        
        const dealResult = await hubspot.batchCreateAssociations(dealAssociations);
        console.log('Deal result success:', dealResult[0]?.success);
        
        // Verify both
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const companyCheck = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/meetings/${meetingId}/associations/companies`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        const dealCheck = await axios.get(
            `https://api.hubapi.com/crm/v4/objects/meetings/${meetingId}/associations/deals`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log('\n📊 Final Results:');
        console.log(`   Company associations: ${companyCheck.data.results.length} ✅`);
        console.log(`   Deal associations: ${dealCheck.data.results.length} ${dealCheck.data.results.length > 0 ? '✅' : '❌'}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

compareBothAssociations();