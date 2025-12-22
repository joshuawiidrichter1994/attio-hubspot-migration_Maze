/**
 * FAST test script - directly tests using the WORKING logic from test-single-meeting.js
 */

const HubSpotAPI = require('./src/utils/hubspot-api');
const AttioAPI = require('./src/utils/attio-api');

// WORKING formatTranscript function from test-single-meeting.js
function formatTranscript(rawTranscript) {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return 'Transcript not available.';
  }

  // Split by speaker entries that start with timestamps like [00:00:01] Name:
  const speakerEntries = rawTranscript.split(/(\[[\d:]+\]\s+[^:]+:\s*)/g).filter(entry => entry.trim());
  
  let formatted = '';
  
  for (let i = 0; i < speakerEntries.length; i += 2) {
    const speakerHeader = speakerEntries[i];
    const speakerText = speakerEntries[i + 1];
    
    if (speakerHeader && speakerText) {
      // Extract speaker name from header like "[00:00:01] Adrian Jozwik: " -> "Adrian Jozwik"
      const speakerMatch = speakerHeader.match(/\[[\d:]+\]\s+([^:]+):\s*/);
      if (speakerMatch) {
        const speakerName = speakerMatch[1].trim();
        const cleanText = speakerText.trim();
        
        if (cleanText) {
          // Ensure proper line breaks are preserved in HubSpot
          formatted += `<strong>${speakerName}:</strong> ${cleanText}<br>\n`;
        }
      }
    }
  }
  
  console.log(`   📋 Formatted transcript sample:`, formatted.substring(0, 300) + '...');
  console.log(`   📋 Using full transcript (${formatted.length} chars) - no truncation needed`);
  
  return formatted.trim();
}

// WORKING transcript retrieval from test-single-meeting.js
async function getAttioTranscript(attio, meetingId, recordingId) {
  try {
    console.log(`   📄 Getting transcript for meeting ${meetingId}, recording ${recordingId}...`);
    
    let allTranscriptText = '';
    let nextCursor = null;
    let pageCount = 0;
    
    do {
      const url = `/v2/meetings/${meetingId}/call_recordings/${recordingId}/transcript${nextCursor ? `?cursor=${nextCursor}` : ''}`;
      const response = await attio.client.get(url);
      
      if (pageCount === 0) {
        console.log(`   📋 Response status: ${response.status}`);
      }
      
      if (response && response.data && response.data.data && response.data.data.raw_transcript) {
        allTranscriptText += response.data.data.raw_transcript;
        nextCursor = response.data.pagination?.next_cursor;
        pageCount++;
        
        if (nextCursor) {
          console.log(`   📄 Fetching page ${pageCount + 1}...`);
        }
      } else {
        break;
      }
    } while (nextCursor);
    
    if (allTranscriptText && allTranscriptText.trim()) {
      console.log(`   ✅ Found complete transcript! Pages: ${pageCount}, Total length: ${allTranscriptText.length} characters`);
      return allTranscriptText;
    } else {
      console.log(`   ❌ No transcript found for recording ${recordingId}`);
      return null;
    }
  } catch (error) {
    console.error(`   ❌ Error getting transcript:`, error.message);
    return null;
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Copy HubSpot meeting finder from main script
async function findHubSpotMeetingByAttioId(hubspot, attioMeetingId) {
  try {
    const searchBody = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'hs_meeting_body',
              operator: 'CONTAINS',
              value: `Original ID: ${attioMeetingId}`
            }
          ]
        }
      ],
      properties: [
        'hs_meeting_title',
        'hs_meeting_body', 
        'hs_meeting_start_time',
        'hs_meeting_end_time'
      ],
      limit: 1
    };

    const response = await hubspot.client.post('/crm/v3/objects/meetings/search', searchBody);
    const meetings = response.data.results || [];
    
    return meetings.length > 0 ? meetings[0] : null;
    
  } catch (error) {
    console.warn(`   ⚠️  Could not find HubSpot meeting for Attio ID ${attioMeetingId}:`, error.message);
    return null;
  }
}

async function fastTest() {
  console.log('🚀 FAST TEST: Using WORKING logic from test-single-meeting.js\n');
  
  const hubspot = new HubSpotAPI();
  const attio = new AttioAPI();
  
  // Test data for the two meetings - USE REAL HUBSPOT IDs!
  const testMeetings = [
    {
      meetingId: '386431967465', // Real James Garland meeting ID from URL
      attioMeetingId: 'e1b78b2a-f1d1-4ccb-939b-91ed944ad53c',
      attioCallId: 'f4575941-75ed-478c-b4e3-0978333923af',
      title: 'James Garland and Will Patterson'
    },
    {
      meetingId: '385950801141', // Real Blocker meeting ID  
      attioMeetingId: 'f878b8c0-7efd-4f4e-b7bd-2691838d8625',
      attioCallId: '8d68f0f5-cfa3-408a-9283-4e7d8b00fced',
      title: 'Blocker For Maze Review'
    }
  ];
  
  const config = {
    portalId: '147152397',
    hubspotAppHost: 'app-eu1.hubspot.com',
    meetingRecordingsFolderId: '313172012232',
    videoSectionMarker: '=== VIDEO ===',
    transcriptSectionMarker: '=== TRANSCRIPT ==='
  };
  
  for (const meeting of testMeetings) {
    console.log(`🎯 Testing: ${meeting.title}`);
    console.log(`   Meeting ID: ${meeting.attioMeetingId}`);
    console.log(`   Call ID: ${meeting.attioCallId}`);
    
    try {
      // Get transcript using WORKING method FIRST
      const transcript = await getAttioTranscript(attio, meeting.attioMeetingId, meeting.attioCallId);
      
      if (transcript) {
        console.log('\n🔧 TESTING TRANSCRIPT FORMATTING...');
        const formattedTranscript = formatTranscript(transcript);
        
        console.log(`   📋 Original transcript length: ${transcript.length} chars`);
        console.log(`   📋 Formatted transcript length: ${formattedTranscript.length} chars`);
        
        // Show first and last parts to verify it's complete
        console.log(`   📋 FIRST 200 chars: ${formattedTranscript.substring(0, 200)}`);
        console.log(`   📋 LAST 200 chars: ${formattedTranscript.substring(formattedTranscript.length - 200)}`);
        
        // Get the real HubSpot meeting directly by ID
        console.log(`\n🔍 GETTING REAL HUBSPOT MEETING...`);
        let currentBody = '';
        try {
          const response = await hubspot.client.get(`/crm/v3/objects/meetings/${meeting.meetingId}`);
          currentBody = response.data.properties.hs_meeting_body || '';
          console.log(`   ✅ Found HubSpot meeting, current body length: ${currentBody.length} chars`);
        } catch (error) {
          console.log(`   ⚠️ Could not fetch HubSpot meeting: ${error.message}`);
          currentBody = 'Test body content for formatting validation.';
        }
      
        // Use WORKING cleanup and update logic from test-single-meeting.js
      let newBody = currentBody;
      
      // AGGRESSIVE CLEANUP FIRST - Remove ALL existing video and transcript content
      console.log(`\n🧹 AGGRESSIVE CLEANUP - Removing all existing content...`);
      
      // Remove all video-related content
      newBody = newBody.replace(/<div[^>]*>[\s\S]*?📹 CALL RECORDING[\s\S]*?<\/div>/g, '');
      newBody = newBody.replace(/<h3[^>]*>📹 CALL RECORDING<\/h3>/g, '');
      newBody = newBody.replace(/📹 CALL RECORDING[^\n]*/g, '');
      
      // Remove all transcript-related content  
      newBody = newBody.replace(/<div[^>]*>[\s\S]*?📄 CALL TRANSCRIPT[\s\S]*?<\/div>/g, '');
      newBody = newBody.replace(/<h3[^>]*>📄 CALL TRANSCRIPT<\/h3>/g, '');
      newBody = newBody.replace(/📄 CALL TRANSCRIPT[^\n]*/g, '');
      
      // Remove broken HTML tags and URLs
      newBody = newBody.replace(/<a[^>]*>[^<]*<\/a>/g, '');
      newBody = newBody.replace(/<a[^>]*>/g, '');
      newBody = newBody.replace(/<\/a>/g, '');
      newBody = newBody.replace(/<\/div>/g, '');
      newBody = newBody.replace(/https:\/\/app-eu1\.hubspot\.com\/files\/\d+\/search\?[^\s\n<]+/g, '');
      
      // Remove marker-based sections
      const videoSectionRegex = new RegExp(`\\n*${escapeRegExp(config.videoSectionMarker)}[\\s\\S]*?${escapeRegExp(config.videoSectionMarker)}\\n*`, 'g');
      newBody = newBody.replace(videoSectionRegex, '');
      const transcriptSectionRegex = new RegExp(`\\n?${escapeRegExp(config.transcriptSectionMarker)}[\\s\\S]*?${escapeRegExp(config.transcriptSectionMarker)}`, 'g');
      newBody = newBody.replace(transcriptSectionRegex, '');
      
      // Clean up extra whitespace
      newBody = newBody.replace(/\n{3,}/g, '\n\n').trim();
      console.log(`   ✅ Cleanup complete. Cleaned body length: ${newBody.length} chars`);
      
      // Add video section
      const correctVideoUrl = `https://${config.hubspotAppHost}/files/${config.portalId}/search?folderId=${config.meetingRecordingsFolderId}&query=${meeting.attioCallId}&showDetails=318523796723`;
      
      const videoSection = `

<div style="border-top: 2px solid #ccc; margin: 20px 0; padding-top: 15px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">📹 CALL RECORDING</h3>
<div style="margin: 0; padding: 0;">
<a href="${correctVideoUrl}" target="_blank">${correctVideoUrl}</a>
</div>
</div>`;
      
      newBody = newBody + videoSection;
      console.log(`   ✅ Video section added. Length: ${newBody.length} chars`);
      
      // Add transcript section using WORKING logic
      if (transcript) {
        console.log(`\n🔧 ADDING TRANSCRIPT SECTION...`);
        
        const formattedTranscript = formatTranscript(transcript);
        console.log(`   📋 Original transcript length: ${transcript.length} chars`);
        console.log(`   📋 Formatted transcript length: ${formattedTranscript.length} chars`);
        
        const transcriptSection = `

<div style="border-top: 2px solid #ccc; margin: 20px 0; padding-top: 15px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">📄 CALL TRANSCRIPT</h3>
<div style="margin: 0; padding: 0; line-height: 1.4;">
${formattedTranscript}
</div>
</div>`;
        console.log(`   📋 Complete section length: ${transcriptSection.length} chars`);
        
        newBody = newBody + transcriptSection;
        console.log(`   📋 Final body length: ${newBody.length} chars`);
      }
      
      // Update the meeting - FORCE UPDATE for James Garland
      if (meeting.title.includes('James Garland')) {
        console.log(`\n🚀 FORCE UPDATING JAMES GARLAND MEETING...`);
        await hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.meetingId}`, {
          properties: {
            hs_meeting_body: newBody
          }
        });
        console.log('   ✅ JAMES GARLAND MEETING UPDATED WITH FULL TRANSCRIPT!');
      } else if (currentBody.length > 10) { // Regular update for others
        console.log(`\n🚀 UPDATING MEETING...`);
        await hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.meetingId}`, {
          properties: {
            hs_meeting_body: newBody
          }
        });
        console.log('   ✅ MEETING UPDATED SUCCESSFULLY!');
      } else {
        console.log(`\n📋 TRANSCRIPT FORMATTING TEST COMPLETE (no HubSpot update due to missing meeting)`);
        console.log(`   📝 Final formatted body would be ${newBody.length} chars`);
      }
      
      } // Close the if (transcript) block
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🎉 Fast test complete!');
}

// Run the test
fastTest().catch(console.error);