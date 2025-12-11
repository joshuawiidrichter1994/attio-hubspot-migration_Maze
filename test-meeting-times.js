/**
 * Test meeting data preparation to ensure valid timestamps
 */

// Sample test meetings with different date scenarios
const testMeetings = [
  {
    // Meeting with start time only 
    id: { meeting_id: 'test-1' },
    values: { title: [{ value: 'Test Meeting 1' }] },
    start: { datetime: '2025-12-04T19:30:00.000Z' }
  },
  {
    // Meeting with date only (no time)
    id: { meeting_id: 'test-2' }, 
    values: { title: [{ value: 'Test Meeting 2' }] },
    start: { date: '2025-11-28' }
  },
  {
    // Meeting with same start/end time (should be fixed)
    id: { meeting_id: 'test-3' },
    values: { title: [{ value: 'Test Meeting 3' }] },
    start: { datetime: '2025-09-30T13:30:00.000Z' },
    end: { datetime: '2025-09-30T13:30:00.000Z' }
  }
];

// Mock prepareMeetingData function for testing
function prepareMeetingData(attioMeeting) {
  // Handle both flat and nested data structures
  const values = attioMeeting.values;
  
  // Extract meeting details (handle both structures)
  const title = values?.title?.[0]?.value || attioMeeting.title || 'Meeting imported from Attio';
  
  // Use the same date extraction logic as extractMeetingDate
  const startTime = attioMeeting.start?.datetime || attioMeeting.start?.date || values?.start_time?.[0]?.value;
  const endTime = attioMeeting.end?.datetime || attioMeeting.end?.date || values?.end_time?.[0]?.value;
  
  // Validate that we have a start time (HubSpot requirement)
  if (!startTime) {
    throw new Error(`Meeting "${title}" has no start time - HubSpot requires meeting start/end times`);
  }
  
  // Prepare the meeting data
  const meetingData = {
    properties: {
      hs_meeting_title: title,
      hs_meeting_body: `Meeting imported from Attio. Original ID: ${attioMeeting.id.meeting_id}`,
      hs_timestamp: new Date(startTime).getTime(), // Required by HubSpot - timestamp in milliseconds
      hs_meeting_start_time: new Date(startTime).toISOString(),
    }
  };

  // Add end time if available
  if (endTime) {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    // Ensure end time is after start time
    if (endDate <= startDate) {
      // If end time is same or before start time, add 1 hour
      const newEndDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      meetingData.properties.hs_meeting_end_time = newEndDate.toISOString();
    } else {
      meetingData.properties.hs_meeting_end_time = endDate.toISOString();
    }
  } else {
    // Default to 1 hour meeting if no end time
    const endDate = new Date(new Date(startTime).getTime() + 60 * 60 * 1000);
    meetingData.properties.hs_meeting_end_time = endDate.toISOString();
  }
  
  return meetingData;
}

console.log('🧪 Testing meeting data preparation...');

testMeetings.forEach((meeting, index) => {
  console.log(`\\n📋 Test ${index + 1}: ${meeting.values.title[0].value}`);
  try {
    const result = prepareMeetingData(meeting);
    
    const startTime = new Date(result.properties.hs_meeting_start_time);
    const endTime = new Date(result.properties.hs_meeting_end_time);
    const isValidTimeRange = endTime > startTime;
    
    console.log(`   📅 Start: ${result.properties.hs_meeting_start_time}`);
    console.log(`   📅 End: ${result.properties.hs_meeting_end_time}`);
    console.log(`   ⏰ Duration: ${(endTime - startTime) / (1000 * 60)} minutes`);
    console.log(`   ✅ Valid time range: ${isValidTimeRange ? 'YES' : 'NO'}`);
    
    if (!isValidTimeRange) {
      console.log(`   ❌ PROBLEM: End time is not after start time!`);
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
  }
});

console.log('\\n✅ Test complete!');