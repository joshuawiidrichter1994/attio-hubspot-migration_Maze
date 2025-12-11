const HubSpotAPI = require('./src/utils/hubspot-api.js');

async function createAttioMeetingIdProperty() {
  try {
    console.log('🔧 Creating custom property: attio_meeting_id');
    
    const hubspot = new HubSpotAPI();
    
    const propertyData = {
      name: "attio_meeting_id",
      label: "Attio Meeting ID",
      type: "string",
      description: "The original meeting ID from Attio CRM, used to track imported meetings and prevent duplicates",
      groupName: "meetinginformation",
      fieldType: "text",
      options: []
    };
    
    const response = await hubspot.client.post('/crm/v3/properties/meetings', propertyData);
    
    console.log('✅ Custom property created successfully!');
    console.log('📋 Property details:', {
      name: response.data.name,
      label: response.data.label,
      type: response.data.type,
      createdAt: response.data.createdAt
    });
    
    return response.data;
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  Property already exists - that\'s fine!');
      return { exists: true };
    } else {
      console.error('❌ Error creating property:', error.response?.data || error.message);
      throw error;
    }
  }
}

createAttioMeetingIdProperty();