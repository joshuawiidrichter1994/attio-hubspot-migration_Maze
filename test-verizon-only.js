const HubSpotAPI = require('./src/utils/hubspot-api');

async function testVerizonOnly() {
    console.log('🧪 Testing ONLY Verizon deal association');
    console.log('🎯 Deal: 388208250070 (Verizon - Full Solution)');
    console.log('📅 Meeting: 386217958648');
    console.log('');

    const api = new HubSpotAPI();
    
    try {
        // Check existing associations
        console.log('1️⃣ Checking current associations...');
        const existingAssocs = await api.client.get(`/crm/v4/objects/deals/388208250070/associations/meetings`);
        console.log(`   Deal has ${existingAssocs.data.results.length} meeting associations currently`);
        
        // Create the association
        console.log('');
        console.log('2️⃣ Creating association...');
        const payload = {
            inputs: [{
                from: { id: 386217958648 },  // meeting (numeric)
                to: { id: 388208250070 },    // deal (numeric)
                type: 204  // meeting_to_deal from working script
            }]
        };
        
        const response = await api.client.post('/crm/v4/associations/meetings/deals/batch/create', payload);
        console.log(`   ✅ Response: ${response.status}`);
        console.log(`   Data:`, response.data);
        
        // Verify it worked
        console.log('');
        console.log('3️⃣ Verifying...');
        const newAssocs = await api.client.get(`/crm/v4/objects/deals/388208250070/associations/meetings`);
        console.log(`   Deal now has ${newAssocs.data.results.length} meeting associations`);
        
        const found = newAssocs.data.results.find(m => 
            m.id === '386217958648' || m.toObjectId === '386217958648'
        );
        
        if (found) {
            console.log(`   🎉 SUCCESS! Meeting ${found.id || found.toObjectId} is now associated!`);
        } else {
            console.log(`   😞 FAILED! No association found despite success response`);
        }
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        if (error.response?.data) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testVerizonOnly();