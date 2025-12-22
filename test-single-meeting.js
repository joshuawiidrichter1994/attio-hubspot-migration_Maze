const HubSpotAPI = require('./src/utils/hubspot-api');
const AttioAPI = require('./src/utils/attio-api');

/**
 * QUICK TEST SCRIPT - Test ONLY the specific meeting
 * Attio URL: https://app.attio.com/atlas-security/calls/09f8cabb-9917-46d9-b338-16a6a1e0cf86/8481f1c9-4b18-4989-be0a-c694b08f8926/meeting
 * Video file name: call-recording-8481f1c9-4b18-4989-be0a-c694b08f8926
 * FIXED: Now matching by CALL ID instead of meeting ID
 */

async function testSingleMeeting() {
  console.log('🎯 TESTING SINGLE MEETING - CALL ID MATCHING FIX');
  
  const hubspot = new HubSpotAPI();
  const attio = new AttioAPI();
  
  const config = {
    portalId: '147152397', // CORRECT portal ID
    hubspotAppHost: 'app-eu1.hubspot.com',
    meetingRecordingsFolderId: '313172012232',
    videoSectionMarker: '=== VIDEO ===',
    transcriptSectionMarker: '=== TRANSCRIPT ===',
    dryRun: false
  };
  
  // NEW TEST MEETING
  const attioMeetingId = '09f8cabb-9917-46d9-b338-16a6a1e0cf86';
  const attioCallId = '8481f1c9-4b18-4989-be0a-c694b08f8926';
  const videoFileName = 'call-recording-8481f1c9-4b18-4989-be0a-c694b08f8926'; // Match by CALL ID
  
  // We'll search for the HubSpot meeting by the Attio meeting ID
  let meetingId = null; // To be found via search
  
  try {
    console.log(`📋 Searching for meeting with Attio ID ${attioMeetingId}...`);
    
    // Search for the meeting by Attio meeting ID in the description
    const searchBody = {
      filters: [{
        propertyName: 'hs_meeting_body',
        operator: 'CONTAINS_TOKEN',
        value: attioMeetingId
      }],
      properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time'],
      limit: 10 // Get more results to find the right one
    };
    
    const response = await hubspot.client.post('/crm/v3/objects/meetings/search', searchBody);
    const meetings = response.data.results;
    
    if (!meetings || meetings.length === 0) {
      console.error(`❌ Meeting not found with Attio ID ${attioMeetingId}!`);
      return;
    }
    
    // Find the meeting that contains our specific Attio meeting ID
    const meeting = meetings.find(m => m.properties.hs_meeting_body.includes(attioMeetingId)) || meetings[0];
    meetingId = meeting.id;
    
    console.log(`✅ Found meeting: "${meeting.properties.hs_meeting_title}" (ID: ${meetingId})`);
    console.log(`🔍 Attio Meeting ID: ${attioMeetingId}`);
    console.log(`🔍 Attio Call ID: ${attioCallId}`);
    console.log(`🔍 Expected video file: ${videoFileName}`);
    
    // Get current body
    const currentBody = meeting.properties.hs_meeting_body || '';
    console.log('\n📄 CURRENT MEETING BODY:');
    console.log('=====================================');
    console.log(currentBody);
    console.log('=====================================\n');
    
    // Generate correct video URL using CALL ID for proper video matching
    const baseUrl = `https://${config.hubspotAppHost}/files/${config.portalId}/search`;
    const params = new URLSearchParams({
      folderId: config.meetingRecordingsFolderId,
      query: attioCallId, // FIXED: Use CALL ID instead of meeting ID
      showDetails: '318523796723'
    });
    const correctVideoUrl = `${baseUrl}?${params.toString()}`;
    
    console.log(`🎥 Correct video URL (using CALL ID): ${correctVideoUrl}`);
    
    // Check if current video URL is correct
    const hasVideoSection = currentBody.includes(config.videoSectionMarker);
    const hasCorrectPortalId = currentBody.includes(`files/${config.portalId}/`);
    const hasCorrectVideoUrl = currentBody.includes(correctVideoUrl);
    const hasCallIdInUrl = currentBody.includes(attioCallId); // NEW: Check for call ID
    
    console.log(`🔍 VIDEO VALIDATION:`);
    console.log(`   Has video section: ${hasVideoSection}`);
    console.log(`   Has correct portal ID (${config.portalId}): ${hasCorrectPortalId}`);
    console.log(`   Has correct video URL: ${hasCorrectVideoUrl}`);
    console.log(`   Has call ID in URL: ${hasCallIdInUrl}`);
    
    // Debug the URL comparison
    console.log(`   🔍 URL DEBUGGING:`);
    console.log(`   Expected URL: ${correctVideoUrl}`);
    
    // Extract current video URL from the body
    const videoUrlMatch = currentBody.match(/Call recording.*?:\s*([^\n]+)/);
    if (videoUrlMatch) {
      const currentVideoUrl = videoUrlMatch[1].trim();
      console.log(`   Current URL:  ${currentVideoUrl}`);
      console.log(`   URLs match: ${currentVideoUrl === correctVideoUrl}`);
      console.log(`   URL includes expected: ${currentBody.includes(correctVideoUrl)}`);
    }
    
    // Get transcript from Attio
    console.log(`\n📄 Getting transcript from Attio...`);
    
    // Try multiple recording ID formats
    let transcript = null;
    
    // Try the call ID first
    transcript = await getAttioTranscript(attio, attioMeetingId, attioCallId);
    
    if (!transcript) {
      console.log(`   🔄 Trying full video ID as recording ID...`);
      transcript = await getAttioTranscript(attio, attioMeetingId, videoId);
    }
    
    if (!transcript) {
      console.log(`   🔄 Trying meeting ID as recording ID...`);
      transcript = await getAttioTranscript(attio, attioMeetingId, attioMeetingId);
    }
    
    console.log(`\n🔍 TRANSCRIPT VALIDATION:`);
    console.log(`   Transcript from Attio: ${transcript ? 'FOUND' : 'NOT FOUND'}`);
    if (transcript) {
      console.log(`   Transcript length: ${transcript.length} characters`);
      console.log(`   Transcript preview: ${transcript.substring(0, 200)}...`);
    }
    
    // Check if current transcript is correct
    const hasTranscriptSection = currentBody.includes(config.transcriptSectionMarker);
    const hasTranscriptNotAvailable = currentBody.includes('Transcript not available for this recording');
    
    console.log(`   Has transcript section: ${hasTranscriptSection}`);
    console.log(`   Has "not available" message: ${hasTranscriptNotAvailable}`);
    
    // Determine what needs updating - FIXED: Ensure call ID is in the URL
    const needsVideoUpdate = !hasCorrectVideoUrl || !hasCorrectPortalId || !hasCallIdInUrl;
    let needsTranscriptUpdate = hasTranscriptNotAvailable || !hasTranscriptSection;
    
    // FORCE BOTH UPDATES FOR TESTING THE NEW FORMATTING
    const forceUpdate = true;
    if (forceUpdate) {
      console.log(`   🔄 FORCE UPDATE: Testing new formatting`);
    }
    
    console.log(`\n🚨 UPDATE NEEDED:`);
    console.log(`   Video needs update: ${needsVideoUpdate || forceUpdate}`);
    console.log(`   Transcript needs update: ${needsTranscriptUpdate || forceUpdate}`);
    
    if (!needsVideoUpdate && !needsTranscriptUpdate && !forceUpdate) {
      console.log('\n✅ Meeting is already correct - no updates needed!');
      return;
    }
    
    // Create new body with corrections
    let newBody = currentBody;
    
    // AGGRESSIVE CLEANUP FIRST - Remove ALL existing video and transcript content
    console.log(`\n🧹 AGGRESSIVE CLEANUP - Removing all existing video/transcript content...`);
    
    // Remove all video-related content
    newBody = newBody.replace(/<div[^>]*>[\s\S]*?📹 CALL RECORDING[\s\S]*?<\/div>/g, '');
    newBody = newBody.replace(/<h3[^>]*>📹 CALL RECORDING<\/h3>/g, '');
    newBody = newBody.replace(/📹 CALL RECORDING[^\n]*/g, '');
    
    // Remove all transcript-related content  
    newBody = newBody.replace(/<div[^>]*>[\s\S]*?📄 CALL TRANSCRIPT[\s\S]*?<\/div>/g, '');
    newBody = newBody.replace(/<h3[^>]*>📄 CALL TRANSCRIPT<\/h3>/g, '');
    newBody = newBody.replace(/📄 CALL TRANSCRIPT[^\n]*/g, '');
    
    // Remove broken HTML tags
    newBody = newBody.replace(/<a[^>]*>[^<]*<\/a>/g, '');
    newBody = newBody.replace(/<a[^>]*>/g, '');
    newBody = newBody.replace(/<\/a>/g, '');
    newBody = newBody.replace(/<\/div>/g, '');
    
    // Remove any video URLs
    newBody = newBody.replace(/https:\/\/app-eu1\.hubspot\.com\/files\/\d+\/search\?[^\s\n<]+/g, '');
    
    // Remove marker-based sections
    const videoSectionRegex = new RegExp(`\\n*${escapeRegExp(config.videoSectionMarker)}[\\s\\S]*?${escapeRegExp(config.videoSectionMarker)}\\n*`, 'g');
    newBody = newBody.replace(videoSectionRegex, '');
    const transcriptSectionRegex = new RegExp(`\\n?${escapeRegExp(config.transcriptSectionMarker)}[\\s\\S]*?${escapeRegExp(config.transcriptSectionMarker)}`, 'g');
    newBody = newBody.replace(transcriptSectionRegex, '');
    
    // Clean up extra whitespace and newlines
    newBody = newBody.replace(/\n{3,}/g, '\n\n');
    newBody = newBody.trim();
    
    console.log(`   ✅ Cleanup complete. Cleaned body length: ${newBody.length} chars`);
    
    // Fix video section
    if (needsVideoUpdate || forceUpdate) {
      console.log(`\n🔧 ADDING VIDEO SECTION...`);
      
      // Create a clean block-level video section using proper HTML structure
      const videoSection = `

<div style="border-top: 2px solid #ccc; margin: 20px 0; padding-top: 15px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">📹 CALL RECORDING</h3>
<div style="margin: 0; padding: 0;">
<a href="${correctVideoUrl}" target="_blank">${correctVideoUrl}</a>
</div>
</div>`;
      
      // Add video section
      newBody = newBody + videoSection;
      console.log(`   ✅ Video section added. Length: ${newBody.length} chars`);
    }
    
    // Fix transcript section
    if ((needsTranscriptUpdate || forceUpdate) && transcript) {
      console.log(`\n🔧 ADDING TRANSCRIPT SECTION...`);
      
      // Format the transcript properly
      const formattedTranscript = formatTranscript(transcript);
      console.log(`   📋 Original transcript length: ${transcript.length} chars`);
      console.log(`   📋 Formatted transcript length: ${formattedTranscript.length} chars`);
      
      // Create a clean block-level transcript section using proper HTML structure
      const transcriptSection = `

<div style="border-top: 2px solid #ccc; margin: 20px 0; padding-top: 15px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">📄 CALL TRANSCRIPT</h3>
<div style="margin: 0; padding: 0; line-height: 1.4;">
${formattedTranscript}
</div>
</div>`;
      console.log(`   📋 Complete section length: ${transcriptSection.length} chars`);
      
      // Add transcript section
      newBody = newBody + transcriptSection;
      console.log(`   📋 Final body length: ${newBody.length} chars`);
    }
    
    console.log('\n📄 NEW MEETING BODY:');
    console.log('=====================================');
    console.log(newBody);
    console.log('=====================================\n');
    
    // Update the meeting
    console.log(`🚀 UPDATING MEETING...`);
    await hubspot.client.patch(`/crm/v3/objects/meetings/${meetingId}`, {
      properties: {
        hs_meeting_body: newBody
      }
    });
    
    console.log('✅ MEETING UPDATED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Helper function to get transcript
async function getAttioTranscript(attio, meetingId, recordingId) {
  try {
    console.log(`   📄 Trying meeting ID: ${meetingId}, recording ID: ${recordingId}...`);
    
    let allTranscriptText = '';
    let nextCursor = null;
    let pageCount = 0;
    
    do {
      // Use correct Attio API endpoint: /v2/meetings/{meeting_id}/call_recordings/{call_recording_id}/transcript
      const url = `/v2/meetings/${meetingId}/call_recordings/${recordingId}/transcript${nextCursor ? `?cursor=${nextCursor}` : ''}`;
      const response = await attio.client.get(url);
      
      if (pageCount === 0) {
        console.log(`   📋 Response status: ${response.status}`);
        console.log(`   📋 Response data (first page):`, {
          hasData: !!response.data,
          hasRawTranscript: !!(response.data?.data?.raw_transcript),
          transcriptLength: response.data?.data?.raw_transcript?.length,
          hasPagination: !!response.data?.pagination?.next_cursor
        });
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
      console.log(`   📋 Transcript preview: ${allTranscriptText.substring(0, 200)}...`);
      console.log(`   📋 Transcript ending: ...${allTranscriptText.substring(allTranscriptText.length - 200)}`);
      return allTranscriptText;
    } else {
      console.log(`   ⚠️ No transcript content found for meeting ${meetingId}, recording ${recordingId}`);
      return null;
    }
    
  } catch (error) {
    console.error(`   ❌ Error getting transcript for meeting ${meetingId}, recording ${recordingId}: ${error.message}`);
    return null;
  }
}

// Helper function to escape regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to format transcript with proper line breaks for HubSpot
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
  
  // Debug: Show sample of formatted output
  console.log(`   📋 Formatted transcript sample:`, formatted.substring(0, 300) + '...');
  console.log(`   📋 Using full transcript (${formatted.length} chars) - no truncation needed`);
  
  return formatted.trim();
}

// Run the test
testSingleMeeting().catch(console.error);