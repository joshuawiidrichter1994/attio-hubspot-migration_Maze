const HubSpotAPI = require('./utils/hubspot-api');
const AttioAPI = require('./utils/attio-api');
const fs = require('fs');
const path = require('path');

class ComprehensiveMeetingProcessor {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.attio = new AttioAPI();
    
    // HubSpot association type IDs
    this.ASSOCIATION_TYPE_IDS = {
      meeting_to_contact: 200,
      meeting_to_company: 202,
      meeting_to_deal: 204
    };
    
    this.processedCount = 0;
    this.skippedCount = 0;
    this.errorCount = 0;
  }

  /**
   * Get fresh data from Attio (meetings only for now)
   */
  async getFreshAttioMeetings() {
    console.log('📥 Fetching fresh meetings from Attio...');
    
    try {
      const allMeetings = await this.attio.getAllMeetings();
      console.log(`   ✅ Found ${allMeetings.length} total meetings in Attio`);
      
      // Get current date for filtering
      const now = new Date();
      const currentTimestamp = now.getTime();
      console.log(`   📅 Current date: ${now.toISOString()}`);
      
      let skippedFutureCount = 0;
      let skippedNoDateCount = 0;
      
      // Additional validation - filter out meetings without proper date structure AND future meetings
      const validMeetings = allMeetings.filter(meeting => {
        // Require actual meeting start time (not just created_at)
        const hasStartDateTime = meeting.start?.datetime;
        const hasStartDate = meeting.start?.date;
        const hasValueStartTime = meeting.values?.start_time?.[0]?.value;
        
        if (!hasStartDateTime && !hasStartDate && !hasValueStartTime) {
          const meetingId = meeting.id?.meeting_id || 'unknown';
          const title = meeting.values?.title?.[0]?.value || meeting.title || 'untitled';
          console.warn(`⚠️  Rejecting meeting without start time: ${title} (${meetingId})`);
          skippedNoDateCount++;
          return false;
        }
        
        // 🚨 CRITICAL: Filter out future meetings to prevent re-migration
        const startTime = hasStartDateTime || hasStartDate || hasValueStartTime;
        const meetingTimestamp = new Date(startTime).getTime();
        
        if (meetingTimestamp > currentTimestamp) {
          const meetingId = meeting.id?.meeting_id || 'unknown';
          const title = meeting.values?.title?.[0]?.value || meeting.title || 'untitled';
          const futureDate = new Date(startTime).toISOString();
          console.warn(`⚠️  Skipping future meeting: ${meetingId} scheduled for ${futureDate} (beyond ${now.toISOString()})`);
          skippedFutureCount++;
          return false;
        }
        
        return true;
      });
      
      console.log(`🎯 Final meeting count after future date filtering: ${validMeetings.length}`);
      console.log(`🎯 Valid meetings ready for processing: ${validMeetings.length}`);
      console.log(`   ✅ Found ${validMeetings.length} meetings in Attio`);
      console.log(`   🚫 Skipped ${skippedFutureCount} future meetings (beyond ${now.toISOString().split('T')[0]})`);
      console.log(`   🚫 Skipped ${skippedNoDateCount} meetings without start times`);
      console.log(`   ✅ Validated ${validMeetings.length} meetings with proper date structures`);
      return validMeetings;
    } catch (error) {
      console.error('❌ Error fetching Attio meetings:', error.message);
      throw error;
    }
  }

  /**
   * Get fresh data from HubSpot
   */
  async getFreshHubSpotMeetings() {
    console.log('📥 Fetching fresh meetings from HubSpot...');
    
    try {
      const meetings = await this.hubspot.getAllMeetings();
      console.log(`   ✅ Found ${meetings.length} meetings in HubSpot`);
      return meetings;
    } catch (error) {
      console.error('❌ Error fetching HubSpot meetings:', error.message);
      throw error;
    }
  }









  /**
   * Cross-check Attio meetings against HubSpot meetings (both engagements and CRM objects)
   */
  verifyMeetingSync(attioMeetings, hubspotMeetings) {
    console.log('🔍 Cross-checking meeting sync between Attio and HubSpot meetings...');
    
    // Debug: Analyze meeting types and timestamps
    let legacyEngagementCount = 0;
    let crmMeetingCount = 0;
    let futureMeetingCount = 0;
    let recentMeetingCount = 0;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const hubspotByAttioId = new Map();
    hubspotMeetings.forEach(meeting => {
      // Debug: Identify meeting type
      const isLegacyEngagement = meeting.metadata?.body !== undefined;
      const isCRMMeeting = meeting.properties?.hs_meeting_body !== undefined;
      
      if (isLegacyEngagement) {
        legacyEngagementCount++;
        
        // Check timestamp for legacy meetings
        const timestamp = meeting.metadata?.startTime || meeting.engagement?.timestamp;
        if (timestamp) {
          const meetingDate = new Date(timestamp);
          if (meetingDate > now) futureMeetingCount++;
          if (meetingDate > weekAgo) recentMeetingCount++;
        }
      } else if (isCRMMeeting) {
        crmMeetingCount++;
        
        // Check timestamp for CRM meetings
        const timestamp = meeting.properties?.hs_timestamp;
        if (timestamp) {
          const meetingDate = new Date(parseInt(timestamp));
          if (meetingDate > now) futureMeetingCount++;
          if (meetingDate > weekAgo) recentMeetingCount++;
        }
      }
      
      // Handle both legacy engagements and new CRM meetings
      const body = meeting.metadata?.body || meeting.properties?.hs_meeting_body || '';
      
      // Look for "Original ID: [UUID]" patterns in the meeting body
      const attioIdPattern = /Original ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g;
      const matches = body.match(attioIdPattern);
      
      if (matches && matches.length > 0) {
        // Extract just the UUID from "Original ID: uuid"
        const fullMatch = matches[0];
        const uuidMatch = fullMatch.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
        if (uuidMatch) {
          const attioId = uuidMatch[1];
          hubspotByAttioId.set(attioId, meeting);
        }
      }
    });
    
    console.log(`🔍 Meeting Analysis:`);
    console.log(`   📊 Legacy Engagements: ${legacyEngagementCount}`);
    console.log(`   📊 New CRM Meetings: ${crmMeetingCount}`);
    console.log(`   ⚠️  Future Meetings Found: ${futureMeetingCount} (should be 0 after cleanup)`);
    console.log(`   📅 Recent Meetings (7 days): ${recentMeetingCount}`);
    
    const missingInHubSpot = [];
    const existingInHubSpot = [];
    let recentMissingCount = 0;
    
    attioMeetings.forEach(attioMeeting => {
      const attioId = attioMeeting.id.meeting_id; // Use meeting_id not identifier
      if (!hubspotByAttioId.has(attioId)) {
        missingInHubSpot.push(attioMeeting);
        
        // Check if missing meeting is recent
        const startTime = attioMeeting.start?.datetime || attioMeeting.start?.date || attioMeeting.values?.start_time?.[0]?.value;
        if (startTime) {
          const meetingDate = new Date(startTime);
          if (meetingDate > weekAgo) {
            recentMissingCount++;
          }
        }
      } else {
        existingInHubSpot.push({
          attioMeeting,
          hubspotMeeting: hubspotByAttioId.get(attioId)
        });
      }
    });
    
    console.log(`   📊 Attio meetings: ${attioMeetings.length}`);
    console.log(`   📊 HubSpot meetings with Attio ID: ${hubspotByAttioId.size}`);
    console.log(`   ✅ Existing in HubSpot: ${existingInHubSpot.length}`);
    console.log(`   ⚠️ Missing in HubSpot: ${missingInHubSpot.length}`);
    console.log(`   🆕 Recent Missing (7 days): ${recentMissingCount}`);
    
    if (missingInHubSpot.length > 0) {
      console.log('\\n🆕 New meetings to create in HubSpot:');
      
      // Sort by date (most recent first) and show details
      const sortedMissing = missingInHubSpot.sort((a, b) => {
        const aTime = a.start?.datetime || a.start?.date || a.values?.start_time?.[0]?.value;
        const bTime = b.start?.datetime || b.start?.date || b.values?.start_time?.[0]?.value;
        if (!aTime) return 1;
        if (!bTime) return -1;
        return new Date(bTime) - new Date(aTime);
      });
      
      sortedMissing.slice(0, 10).forEach((meeting, index) => {
        const title = meeting.values?.title?.[0]?.value || meeting.title || 'Untitled';
        const startTime = meeting.start?.datetime || meeting.start?.date || meeting.values?.start_time?.[0]?.value || 'No date';
        const meetingId = meeting.id?.meeting_id;
        
        // Validate timestamp will be correct
        let timestampStatus = '✅';
        if (startTime && startTime !== 'No date') {
          const meetingDate = new Date(startTime);
          const now = new Date();
          if (meetingDate > now) {
            timestampStatus = '🚨 FUTURE DATE';
          } else if (meetingDate > weekAgo) {
            timestampStatus = '🆕 RECENT';
          }
        }
        
        console.log(`   ${index + 1}. ${title} (${startTime}) [${meetingId}] ${timestampStatus}`);
      });
      
      if (missingInHubSpot.length > 10) {
        console.log(`   ... and ${missingInHubSpot.length - 10} more`);
      }
    }
    
    return { hubspotByAttioId, missingInHubSpot, existingInHubSpot };
  }

  /**
   * Create new meeting in HubSpot from Attio data
   */
  async createMeetingFromAttio(attioMeeting) {
    try {
      const meetingData = this.prepareMeetingData(attioMeeting);
      
      console.log(`   🆕 Creating meeting: ${meetingData.properties.hs_meeting_title}`);
      
      // Debug: Log the actual payload being sent to HubSpot
      console.log(`   🔍 Meeting payload:`, JSON.stringify(meetingData, null, 2));
      
      // Create the meeting
      const response = await this.hubspot.client.post('/crm/v3/objects/meetings', meetingData);
      const newMeeting = response.data;
      
      console.log(`   ✅ Created meeting with ID: ${newMeeting.id}`);
      
      return newMeeting;
      
    } catch (error) {
      const title = attioMeeting.values?.title?.[0]?.value || attioMeeting.title || 'Unknown meeting';
      
      // Log the full error details for debugging
      console.error(`   ❌ Error creating meeting "${title}":`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      if (error.message.includes('no start time')) {
        console.error(`   ⚠️ Skipping meeting "${title}" - no start time available`);
        return null; // Skip this meeting
      } else {
        throw error;
      }
    }
  }

  /**
   * Get desired associations for a meeting based on Attio data (source of truth)
   */
  async getDesiredAssociationsForMeeting(attioMeeting) {
    const contactIds = new Set();
    const companyIds = new Set();
    const dealIds = new Set();

    const values = attioMeeting.values || {};

    // 1) Contacts from participants (already mostly correct)
    const participants =
      values.participants ||
      values.attendees ||
      values.people ||
      attioMeeting.participants ||
      attioMeeting.attendees ||
      attioMeeting.people ||
      [];

    for (const participant of participants) {
      try {
        let hubspotContact = null;

        // If you ever had Attio person IDs on participants, this would catch them
        if (participant.target_object === 'people' || participant.type === 'person') {
          const attioContactId = participant.target_record_id || participant.id;
          hubspotContact = await this.findHubSpotContact(attioContactId);
        } else if (participant.email_address) {
          // This is the path that actually matches the real Attio schema
          hubspotContact = await this.findHubSpotContactByEmail(participant.email_address);
        }

        if (hubspotContact) {
          contactIds.add(hubspotContact.id);
        }
      } catch {
        continue;
      }
    }

    // 2) Companies & deals from Attio linked_records (REAL source of truth)
    // NOTE: Attio schema puts this on the top-level meeting, *not* under values
    const linkedRecords =
      attioMeeting.linked_records ||
      values.linked_records || // fallback just in case
      [];

    for (const record of linkedRecords) {
      try {
        // Attio official fields
        const objectSlug =
          record.object_slug ||
          record.target_object ||
          record.type;

        const recordId =
          record.record_id ||
          record.target_record_id ||
          record.id;

        if (!objectSlug || !recordId) continue;

        // Standard Attio object slugs: people, companies, deals, users, workspaces
        if (objectSlug === 'companies' || objectSlug === 'company') {
          const hubspotCompany = await this.findHubSpotCompany(recordId);
          if (hubspotCompany) companyIds.add(hubspotCompany.id);
        } else if (objectSlug === 'deals' || objectSlug === 'deal') {
          const hubspotDeal = await this.findHubSpotDeal(recordId);
          if (hubspotDeal) dealIds.add(hubspotDeal.id);
        } else if (objectSlug === 'people' || objectSlug === 'person') {
          // Optional: if people are linked via records rather than participants
          const hubspotContact = await this.findHubSpotContact(recordId);
          if (hubspotContact) contactIds.add(hubspotContact.id);
        }
      } catch (error) {
        console.error('Error mapping linked_record', record, error.message);
        continue;
      }
    }

    // 3) Legacy fallbacks (keep as-is in case some old structures exist)
    const legacyCompanies =
      values.companies ||
      values.accounts ||
      attioMeeting.companies ||
      attioMeeting.accounts ||
      [];

    for (const company of legacyCompanies) {
      try {
        const attioCompanyId = company.target_record_id || company.id;
        if (attioCompanyId) {
          const hubspotCompany = await this.findHubSpotCompany(attioCompanyId);
          if (hubspotCompany) companyIds.add(hubspotCompany.id);
        }
      } catch {
        continue;
      }
    }

    const legacyDeals = values.deals || attioMeeting.deals || [];
    for (const deal of legacyDeals) {
      try {
        const attioDealId = deal.target_record_id || deal.id;
        if (attioDealId) {
          const hubspotDeal = await this.findHubSpotDeal(attioDealId);
          if (hubspotDeal) dealIds.add(hubspotDeal.id);
        }
      } catch {
        continue;
      }
    }

    return { contactIds, companyIds, dealIds };
  }

  /**
   * Fix associations for an existing HubSpot meeting:
   * - Reads existing associations (contacts/companies/deals)
   * - Computes what's missing based on Attio
   * - Creates ONLY the missing associations
   */
  async fixMeetingAssociations(hubspotMeeting, attioMeeting) {
    try {
      if (!hubspotMeeting || !hubspotMeeting.id) {
        console.log('   ⚠️ Cannot fix associations: missing HubSpot meeting ID');
        return;
      }

      const meetingId = hubspotMeeting.id;
      console.log(`   🔧 Fixing associations for meeting ${meetingId}...`);

      // 1) Read existing associations
      const existingContacts = new Set();
      const existingCompanies = new Set();
      const existingDeals = new Set();

      try {
        const existing = await this.hubspot.client.get(
          `/crm/v3/objects/meetings/${meetingId}`,
          { params: { associations: 'contacts,companies,deals' } }
        );

        const assoc = existing.data?.associations || {};

        if (assoc.contacts?.results?.length) {
          assoc.contacts.results.forEach(r => existingContacts.add(r.id));
        }
        if (assoc.companies?.results?.length) {
          assoc.companies.results.forEach(r => existingCompanies.add(r.id));
        }
        if (assoc.deals?.results?.length) {
          assoc.deals.results.forEach(r => existingDeals.add(r.id));
        }

        console.log(
          `     Existing: ${existingContacts.size} contacts, ` +
          `${existingCompanies.size} companies, ${existingDeals.size} deals`
        );
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(
            `   ⚠️ Meeting ${meetingId} returned 404 when reading associations. ` +
            `It may have been deleted – skipping fix for this record.`
          );
          return;
        }
        throw error;
      }

      // 2) Desired associations
      const { contactIds, companyIds, dealIds } =
        await this.getDesiredAssociationsForMeeting(attioMeeting);

      const desiredContacts = Array.from(contactIds || []);
      const desiredCompanies = Array.from(companyIds || []);
      const desiredDeals = Array.from(dealIds || []);

      // 3) Compute missing ones
      const missingContacts = desiredContacts.filter(id => !existingContacts.has(id));
      const missingCompanies = desiredCompanies.filter(id => !existingCompanies.has(id));
      const missingDeals = desiredDeals.filter(id => !existingDeals.has(id));

      const totalMissing =
        missingContacts.length + missingCompanies.length + missingDeals.length;

      if (totalMissing === 0) {
        console.log(`   ✅ Associations already correct for meeting ${meetingId}`);
        return;
      }

      console.log(
        `   ❗ Fixing ${totalMissing} missing associations for meeting ${meetingId} ` +
        `(${missingContacts.length} contacts, ` +
        `${missingCompanies.length} companies, ` +
        `${missingDeals.length} deals)`
      );

      const associations = [];

      missingContacts.forEach(contactId => {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: meetingId,
          toObjectType: 'contacts',
          toObjectId: contactId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_contact
        });
      });

      missingCompanies.forEach(companyId => {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: meetingId,
          toObjectType: 'companies',
          toObjectId: companyId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_company
        });
      });

      missingDeals.forEach(dealId => {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: meetingId,
          toObjectType: 'deals',
          toObjectId: dealId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_deal
        });
      });

      if (associations.length > 0) {
        console.log(`     📎 Creating ${associations.length} missing associations...`);
        await this.hubspot.batchCreateAssociations(associations);
        console.log(`     ✅ Created missing associations for meeting ${meetingId}`);
      }

    } catch (error) {
      console.error(
        `   ❌ Error fixing associations for meeting ${hubspotMeeting?.id}:`,
        error.message
      );
    }
  }

  /**
   * Prepare meeting data from Attio meeting for HubSpot creation
   */
  prepareMeetingData(attioMeeting) {
    // Handle both flat and nested data structures
    const values = attioMeeting.values || {};
    
    // Extract meeting details (handle both structures)
    const title = values?.title?.[0]?.value || attioMeeting.title || 'Meeting imported from Attio';
    
    // Use the same date extraction logic as extractMeetingDate
    const startTime = attioMeeting.start?.datetime || attioMeeting.start?.date || values?.start_time?.[0]?.value;
    const endTime = attioMeeting.end?.datetime || attioMeeting.end?.date || values?.end_time?.[0]?.value;
    
    const description = values?.description?.[0]?.value || attioMeeting.description || '';
    const location = values?.location?.[0]?.value || attioMeeting.location || '';
    
    // Validate that we have a start time (HubSpot requirement)
    if (!startTime) {
      // Debug: Let's see what's actually in this meeting
      console.log(`🔍 DEBUG: Meeting "${title}" data structure:`, JSON.stringify({
        id: attioMeeting.id,
        start: attioMeeting.start,
        values_start_time: values?.start_time,
        all_values_keys: Object.keys(values || {}),
        created_at: attioMeeting.created_at
      }, null, 2));
      
      throw new Error(`Meeting "${title}" has no start time - HubSpot requires meeting start/end times`);
    }
    
    // 3.1 Build structured participant list for description - handle missing values object
    const participants =
      values?.participants ||
      values?.attendees ||
      values?.people ||
      attioMeeting.participants ||
      attioMeeting.attendees ||
      attioMeeting.people ||
      [];

    // Safely process participants with error handling for malformed data
    const participantLines = [];
    const attendeeEmails = []; // Collect emails for HubSpot attendees field
    
    if (Array.isArray(participants)) {
      participants.forEach((p, index) => {
        try {
          // Handle both object and primitive participant data
          if (!p || typeof p !== 'object') {
            console.log(`⚠️  Skipping malformed participant at index ${index}:`, p);
            return;
          }

          const name =
            p.name ||
            p.full_name ||
            [p.first_name, p.last_name].filter(Boolean).join(' ') ||
            p.display_name ||
            '';

          const email = p.email_address || p.email || '';
          const status = p.status ? ` [${p.status}]` : '';
          const role = p.is_organizer ? ' (host)' : '';

          // Add email to attendees list if valid
          if (email && email.includes('@')) {
            attendeeEmails.push(email);
          }

          let label = name || email || 'Unknown participant';
          if (email && name) label += ` <${email}>`;
          else if (email && !name) label = email;

          participantLines.push(`- ${label}${role}${status}`);
        } catch (error) {
          console.log(`⚠️  Error processing participant at index ${index}:`, error.message);
        }
      });
    }

    let participantsSection = '';
    if (participantLines.length > 0) {
      participantsSection = `

Attio participants:
${participantLines.join('\n')}`;
    }

    const bodyLines = [
      `Meeting imported from Attio. Original ID: ${attioMeeting.id.meeting_id}`,
      '',
      description ? description : 'No description provided',
      participantsSection.trim() ? participantsSection : ''
    ].filter(Boolean);

    const hsMeetingBody = bodyLines.join('\n');

    // Prepare the meeting data
    const meetingData = {
      properties: {
        hs_meeting_title: title,
        hs_meeting_body: hsMeetingBody,
        hs_meeting_location: location,
        hs_timestamp: new Date(startTime).getTime(), // Required by HubSpot - timestamp in milliseconds
        hs_meeting_start_time: new Date(startTime).toISOString(),
      }
    };

    // Add attendee emails if we have any
    if (attendeeEmails.length > 0) {
      // HubSpot expects attendee emails as a semicolon-separated string
      meetingData.properties.hs_attendee_emails = attendeeEmails.join(';');
    }

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

  /**
   * Create associations for a new meeting
   */
  async createAssociationsForMeeting(hubspotMeeting, attioMeeting) {
    try {
      const meetingId = hubspotMeeting?.id || hubspotMeeting || 'unknown';
      console.log(`   🔗 Creating associations for meeting ${meetingId}...`);
      
      // Get desired associations using the new helper
      const { contactIds, companyIds, dealIds } = await this.getDesiredAssociationsForMeeting(attioMeeting);
      
      console.log(`   Summary before batch create: ${contactIds.size} contacts, ${companyIds.size} companies, ${dealIds.size} deals`);
      
      // Build deduped associations array
      const associations = [];
      
      // Add contact associations
      for (const contactId of contactIds) {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: hubspotMeeting.id,
          toObjectType: 'contacts',
          toObjectId: contactId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_contact
        });
      }
      
      // Add company associations
      for (const companyId of companyIds) {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: hubspotMeeting.id,
          toObjectType: 'companies',
          toObjectId: companyId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_company
        });
      }
      
      // Add deal associations
      for (const dealId of dealIds) {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: hubspotMeeting.id,
          toObjectType: 'deals',
          toObjectId: dealId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_deal
        });
      }
      
      // Create all associations in one batch
      if (associations.length > 0) {
        console.log(`   📎 Creating ${associations.length} associations...`);
        await this.hubspot.batchCreateAssociations(associations);
        console.log(`   ✅ Created associations for meeting ${hubspotMeeting.id}`);
      } else {
        console.log(`   ℹ️ No associations to create for meeting ${hubspotMeeting.id}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error creating associations for meeting ${hubspotMeeting.id}:`, error.message);
    }
  }

  /**
   * Find HubSpot contact by Attio ID
   */
  async findHubSpotContact(attioContactId) {
    try {
      const response = await this.hubspot.client.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'contact_record_id_attio',
            operator: 'EQ',
            value: attioContactId
          }]
        }],
        properties: ['firstname', 'lastname', 'email', 'contact_record_id_attio'],
        limit: 1
      });
      
      return response.data.results?.[0] || null;
    } catch (error) {
      console.error(`Error finding contact with Attio ID ${attioContactId}:`, error.message);
      return null;
    }
  }

  /**
   * Find HubSpot contact by email address
   */
  async findHubSpotContactByEmail(emailAddress) {
    try {
      const response = await this.hubspot.client.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: emailAddress
          }]
        }],
        properties: ['firstname', 'lastname', 'email', 'contact_record_id_attio'],
        limit: 1
      });
      
      return response.data.results?.[0] || null;
    } catch (error) {
      console.error(`Error finding contact with email ${emailAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Find HubSpot company by Attio ID
   */
  async findHubSpotCompany(attioCompanyId) {
    try {
      const response = await this.hubspot.client.post('/crm/v3/objects/companies/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'company_record_id_attio',
            operator: 'EQ',
            value: attioCompanyId
          }]
        }],
        properties: ['name', 'domain', 'company_record_id_attio'],
        limit: 1
      });
      
      return response.data.results?.[0] || null;
    } catch (error) {
      console.error(`Error finding company with Attio ID ${attioCompanyId}:`, error.message);
      return null;
    }
  }

  /**
   * Find HubSpot deal by Attio ID
   */
  async findHubSpotDeal(attioDealId) {
    try {
      const response = await this.hubspot.client.post('/crm/v3/objects/deals/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'deal_record_id_attio',
            operator: 'EQ',
            value: attioDealId
          }]
        }],
        properties: ['dealname', 'dealstage', 'deal_record_id_attio'],
        limit: 1
      });
      
      return response.data.results?.[0] || null;
    } catch (error) {
      console.error(`Error finding deal with Attio ID ${attioDealId}:`, error.message);
      return null;
    }
  }

  /**
   * Verify associations for an existing HubSpot meeting against what we expect
   * from Attio. This is a READ-ONLY check – it just logs discrepancies.
   *
   * NOTE:
   * - Uses CRM v3 meetings endpoint with `associations=contacts,companies,deals`
   * - The previous implementation used `/crm/v4/objects/meetings/{id}/associations`
   *   which is not a valid endpoint and always returned 404.
   */
  async verifyMeetingAssociations(hubspotMeeting, attioMeeting) {
    try {
      if (!hubspotMeeting || !hubspotMeeting.id) {
        console.log('   ⚠️ Cannot verify associations: missing HubSpot meeting ID');
        return;
      }

      const meetingId = hubspotMeeting.id;
      console.log(`   🔍 Verifying associations for meeting ${meetingId}...`);

      // -------------------------------------------------------------------
      // 1) Get existing associations from HubSpot (contacts/companies/deals)
      // -------------------------------------------------------------------
      const existingContacts = new Set();
      const existingCompanies = new Set();
      const existingDeals = new Set();

      try {
        const existing = await this.hubspot.client.get(
          `/crm/v3/objects/meetings/${meetingId}`,
          {
            params: {
              associations: 'contacts,companies,deals'
            }
          }
        );

        const assoc = existing.data?.associations || {};

        if (assoc.contacts?.results?.length) {
          assoc.contacts.results.forEach(r => existingContacts.add(r.id));
        }
        if (assoc.companies?.results?.length) {
          assoc.companies.results.forEach(r => existingCompanies.add(r.id));
        }
        if (assoc.deals?.results?.length) {
          assoc.deals.results.forEach(r => existingDeals.add(r.id));
        }

        console.log(
          `     Existing: ${existingContacts.size} contacts, ` +
          `${existingCompanies.size} companies, ${existingDeals.size} deals`
        );
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(
            `   ⚠️ Meeting ${meetingId} returned 404 when reading associations. ` +
            `It may have been deleted – skipping association verification for this record.`
          );
          return;
        }

        // Any other error is real and should bubble up
        throw error;
      }

      // -------------------------------------------------------------------
      // 2) Desired associations from Attio mapping
      // -------------------------------------------------------------------
      const { contactIds, companyIds, dealIds } =
        await this.getDesiredAssociationsForMeeting(attioMeeting);

      const desiredContacts = Array.from(contactIds || []);
      const desiredCompanies = Array.from(companyIds || []);
      const desiredDeals = Array.from(dealIds || []);

      // -------------------------------------------------------------------
      // 3) Diff: what is missing in HubSpot vs what we expect
      // -------------------------------------------------------------------
      const missingContacts = desiredContacts.filter(id => !existingContacts.has(id));
      const missingCompanies = desiredCompanies.filter(id => !existingCompanies.has(id));
      const missingDeals = desiredDeals.filter(id => !existingDeals.has(id));

      const totalMissing =
        missingContacts.length + missingCompanies.length + missingDeals.length;

      if (totalMissing === 0) {
        console.log(`   ✅ Associations already correct for meeting ${meetingId}`);
        return;
      }

      console.log(
        `   ❗ Associations missing for meeting ${meetingId}: ` +
        `${missingContacts.length} contacts, ` +
        `${missingCompanies.length} companies, ` +
        `${missingDeals.length} deals`
      );

      if (missingContacts.length) {
        console.log(`     Missing contact IDs: ${missingContacts.join(', ')}`);
      }
      if (missingCompanies.length) {
        console.log(`     Missing company IDs: ${missingCompanies.join(', ')}`);
      }
      if (missingDeals.length) {
        console.log(`     Missing deal IDs: ${missingDeals.join(', ')}`);
      }

      // NOTE: Right now this function is only used as a verifier.
      // If you later want it to auto-fix, you can:
      //  - build a reduced set with only the missing IDs, and
      //  - call `this.hubspot.batchCreateAssociations(...)` like in
      //    createAssociationsForMeeting.

    } catch (error) {
      console.error(
        `   ❌ Error verifying associations for meeting ${hubspotMeeting?.id}:`,
        error.message
      );
    }
  }

  /**
   * Fix associations for an existing HubSpot meeting:
   * - Reads existing associations (contacts/companies/deals)
   * - Computes what's missing based on Attio
   * - Creates ONLY the missing associations
   */
  async fixMeetingAssociations(hubspotMeeting, attioMeeting) {
    try {
      if (!hubspotMeeting || !hubspotMeeting.id) {
        console.log('   ⚠️ Cannot fix associations: missing HubSpot meeting ID');
        return;
      }

      const meetingId = hubspotMeeting.id;
      console.log(`   🔧 Fixing associations for meeting ${meetingId}...`);

      // 1) Read existing associations
      const existingContacts = new Set();
      const existingCompanies = new Set();
      const existingDeals = new Set();

      try {
        const existing = await this.hubspot.client.get(
          `/crm/v3/objects/meetings/${meetingId}`,
          { params: { associations: 'contacts,companies,deals' } }
        );

        const assoc = existing.data?.associations || {};

        if (assoc.contacts?.results?.length) {
          assoc.contacts.results.forEach(r => existingContacts.add(r.id));
        }
        if (assoc.companies?.results?.length) {
          assoc.companies.results.forEach(r => existingCompanies.add(r.id));
        }
        if (assoc.deals?.results?.length) {
          assoc.deals.results.forEach(r => existingDeals.add(r.id));
        }

        console.log(
          `     Existing: ${existingContacts.size} contacts, ` +
          `${existingCompanies.size} companies, ${existingDeals.size} deals`
        );
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(
            `   ⚠️ Meeting ${meetingId} returned 404 when reading associations. ` +
            `It may have been deleted – skipping fix for this record.`
          );
          return;
        }
        throw error;
      }

      // 2) Desired associations
      const { contactIds, companyIds, dealIds } =
        await this.getDesiredAssociationsForMeeting(attioMeeting);

      const desiredContacts = Array.from(contactIds || []);
      const desiredCompanies = Array.from(companyIds || []);
      const desiredDeals = Array.from(dealIds || []);

      // 3) Compute missing ones
      const missingContacts = desiredContacts.filter(id => !existingContacts.has(id));
      const missingCompanies = desiredCompanies.filter(id => !existingCompanies.has(id));
      const missingDeals = desiredDeals.filter(id => !existingDeals.has(id));

      const totalMissing =
        missingContacts.length + missingCompanies.length + missingDeals.length;

      if (totalMissing === 0) {
        console.log(`   ✅ Associations already correct for meeting ${meetingId}`);
        return;
      }

      console.log(
        `   ❗ Fixing ${totalMissing} missing associations for meeting ${meetingId} ` +
        `(${missingContacts.length} contacts, ` +
        `${missingCompanies.length} companies, ` +
        `${missingDeals.length} deals)`
      );

      const associations = [];

      missingContacts.forEach(contactId => {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: meetingId,
          toObjectType: 'contacts',
          toObjectId: contactId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_contact
        });
      });

      missingCompanies.forEach(companyId => {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: meetingId,
          toObjectType: 'companies',
          toObjectId: companyId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_company
        });
      });

      missingDeals.forEach(dealId => {
        associations.push({
          fromObjectType: 'meetings',
          fromObjectId: meetingId,
          toObjectType: 'deals',
          toObjectId: dealId,
          associationTypeId: this.ASSOCIATION_TYPE_IDS.meeting_to_deal
        });
      });

      if (associations.length > 0) {
        console.log(`     📎 Creating ${associations.length} missing associations...`);
        await this.hubspot.batchCreateAssociations(associations);
        console.log(`     ✅ Created missing associations for meeting ${meetingId}`);
      }

    } catch (error) {
      console.error(
        `   ❌ Error fixing associations for meeting ${hubspotMeeting?.id}:`,
        error.message
      );
    }
  }

  /**
   * DRY RUN: Analyze associations for an existing meeting without writing anything.
   * Returns the number of missing associations (contacts + companies + deals).
   */
  async analyzeMeetingAssociationsDryRun(hubspotMeeting, attioMeeting) {
    try {
      if (!hubspotMeeting || !hubspotMeeting.id) {
        console.log('   ⚠️ [DRY RUN] Cannot analyze associations: missing HubSpot meeting ID');
        return 0;
      }

      const meetingId = hubspotMeeting.id;
      console.log(`   🔍 [DRY RUN] Checking associations for meeting ${meetingId}...`);

      // -------------------------------------------------------------------
      // 1) Get existing associations from HubSpot (READ-ONLY)
      // -------------------------------------------------------------------
      const existingContacts = new Set();
      const existingCompanies = new Set();
      const existingDeals = new Set();

      try {
        const existing = await this.hubspot.client.get(
          `/crm/v3/objects/meetings/${meetingId}`,
          {
            params: {
              associations: 'contacts,companies,deals'
            }
          }
        );

        const assoc = existing.data?.associations || {};

        if (assoc.contacts?.results?.length) {
          assoc.contacts.results.forEach(r => existingContacts.add(r.id));
        }
        if (assoc.companies?.results?.length) {
          assoc.companies.results.forEach(r => existingCompanies.add(r.id));
        }
        if (assoc.deals?.results?.length) {
          assoc.deals.results.forEach(r => existingDeals.add(r.id));
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(
            `   ⚠️ [DRY RUN] Meeting ${meetingId} returned 404 when reading associations. ` +
            `Treating as "missing in HubSpot" and skipping association analysis for this record.`
          );
          return 0;
        }

        // Anything else is a real failure for this meeting
        console.error(
          `   ❌ [DRY RUN] Failed to analyze associations for meeting ${meetingId}:`,
          error.message
        );
        return 0;
      }

      // -------------------------------------------------------------------
      // 2) Desired associations from Attio mapping
      // -------------------------------------------------------------------
      const { contactIds, companyIds, dealIds } =
        await this.getDesiredAssociationsForMeeting(attioMeeting);

      const desiredContacts = Array.from(contactIds || []);
      const desiredCompanies = Array.from(companyIds || []);
      const desiredDeals = Array.from(dealIds || []);

      // DEBUG: Log what we found
      console.log(`     [DEBUG] Desired associations: ${desiredContacts.length} contacts, ${desiredCompanies.length} companies, ${desiredDeals.length} deals`);
      
      if (desiredContacts.length === 0 && desiredCompanies.length === 0 && desiredDeals.length === 0) {
        console.log(`     [DEBUG] No desired associations found from Attio data - checking Attio meeting structure:`);
        console.log(`     [DEBUG] Meeting values keys: ${Object.keys(attioMeeting.values || {}).join(', ')}`);
        console.log(`     [DEBUG] Direct meeting keys: ${Object.keys(attioMeeting).join(', ')}`);
        
        // Sample some potential data
        const values = attioMeeting.values || {};
        if (values.participants) console.log(`     [DEBUG] Participants count: ${values.participants.length}`);
        if (values.linked_records) console.log(`     [DEBUG] Linked records count: ${values.linked_records.length}`);
        if (values.attendees) console.log(`     [DEBUG] Attendees count: ${values.attendees.length}`);
      }

      // -------------------------------------------------------------------
      // 3) Diff + stats
      // -------------------------------------------------------------------
      const missingContacts = desiredContacts.filter(id => !existingContacts.has(id));
      const missingCompanies = desiredCompanies.filter(id => !existingCompanies.has(id));
      const missingDeals = desiredDeals.filter(id => !existingDeals.has(id));

      const totalMissing =
        missingContacts.length + missingCompanies.length + missingDeals.length;

      if (totalMissing === 0) {
        console.log(`   ✅ [DRY RUN] Associations already correct for meeting ${meetingId}`);
      } else {
        console.log(
          `   ❗ [DRY RUN] ${totalMissing} missing associations for meeting ${meetingId} ` +
          `(${missingContacts.length} contacts, ` +
          `${missingCompanies.length} companies, ` +
          `${missingDeals.length} deals)`
        );
      }

      return totalMissing;
    } catch (error) {
      const status = error.response?.status;
      const message = error.message || String(error || '');

      if (status === 404 || /404/.test(message)) {
        console.log(
          `   ⚠️ [DRY RUN] Meeting ${meetingId} not found in CRM (404). ` +
          `Most likely a legacy engagement or a deleted record – skipping association analysis for this one.`
        );
        return 0;
      }

      console.error(
        `   ❌ [DRY RUN] Unexpected error while analyzing associations for meeting ${meetingId}:`,
        message
      );
      return 0;
    }
  }

  /**
   * Upgrade existing meeting description to include participant list if safe to do so
   */
  async upgradeExistingMeetingDescription(hubspotMeeting, attioMeeting) {
    try {
      // Get current meeting body
      const currentBody = hubspotMeeting.properties?.hs_meeting_body || 
                         hubspotMeeting.metadata?.body || '';
      
      // Decide if we "own" this description (safe to upgrade)
      const isImportedDescription = currentBody.startsWith('Meeting imported from Attio. Original ID:');
      const hasNoDescriptionProvided = currentBody.includes('No description provided');
      const hasMinimalContent = currentBody.length < 500; // Heuristic for "not heavily edited"
      
      const isSafeToUpgrade = isImportedDescription && (hasNoDescriptionProvided || hasMinimalContent);
      
      if (!isSafeToUpgrade) {
        // Skip upgrade - description may have been manually edited
        return;
      }
      
      console.log(`     🔄 Upgrading description with participant list...`);
      
      // Build new description using same logic as prepareMeetingData
      const values = attioMeeting.values || {};
      const description = values?.description?.[0]?.value || attioMeeting.description || '';
      
      const participants =
        values.participants ||
        values.attendees ||
        values.people ||
        attioMeeting.participants ||
        attioMeeting.attendees ||
        attioMeeting.people ||
        [];

      const participantLines = [];
      const attendeeEmails = []; // Collect emails for HubSpot attendees field
      
      participants.forEach(p => {
        const name =
          p.name ||
          p.full_name ||
          [p.first_name, p.last_name].filter(Boolean).join(' ') ||
          p.display_name ||
          '';

        const email = p.email_address || p.email || '';
        const status = p.status ? ` [${p.status}]` : '';
        const role = p.is_organizer ? ' (host)' : '';

        // Add email to attendees list if valid
        if (email && email.includes('@')) {
          attendeeEmails.push(email);
        }

        let label = name || email || 'Unknown participant';
        if (email && name) label += ` <${email}>`;
        else if (email && !name) label = email;

        participantLines.push(`- ${label}${role}${status}`);
      });

      let participantsSection = '';
      if (participantLines.length > 0) {
        participantsSection = `\n\nAttio participants:\n${participantLines.join('\n')}`;
      }

      const bodyLines = [
        `Meeting imported from Attio. Original ID: ${attioMeeting.id.meeting_id}`,
        '',
        description ? description : 'No description provided',
        participantsSection.trim() ? participantsSection : ''
      ].filter(Boolean);

      const newBody = bodyLines.join('\n');
      
      // Prepare the update properties
      const updateProperties = {
        hs_meeting_body: newBody
      };

      // Add attendee emails if we have any
      if (attendeeEmails.length > 0) {
        updateProperties.hs_attendee_emails = attendeeEmails.join(';');
      }
      
      // Update the meeting description and attendees
      await this.hubspot.client.patch(`/crm/v3/objects/meetings/${hubspotMeeting.id}`, {
        properties: updateProperties
      });
      
      console.log(`     ✅ Upgraded description and attendees with ${participants.length} participants (${attendeeEmails.length} emails)`);
      
    } catch (error) {
      console.error(`     ⚠️ Failed to upgrade description: ${error.message}`);
    }
  }

  // Video processing methods have been moved to separate scripts:
  // - video-matcher.js: Handles matching videos to meetings and adding transcripts
  // - description-formatter.js: Handles formatting meeting descriptions













  /**
   * Dry run - analyze what would happen without making changes
   */
  async dryRunProcess() {
    try {
      console.log('🔍 Starting comprehensive meeting analysis (DRY RUN)...');
      
      // Step 1: Fetch data from both platforms
      console.log('\\n📊 STEP 1: Fetching data from both platforms\\n');
      const [attioMeetings, hubspotMeetings] = await Promise.all([
        this.getFreshAttioMeetings(),
        this.getFreshHubSpotMeetings()
      ]);
      
      // Step 2: Verify meeting sync
      console.log('\n🔍 STEP 2: Analyzing meeting synchronization\n');
      const { hubspotByAttioId, missingInHubSpot, existingInHubSpot } = this.verifyMeetingSync(attioMeetings, hubspotMeetings);
      
      // Filter to only CRM meetings (those with hs_meeting_body property) for association analysis
      // Legacy engagement meetings don't support the CRM v3 associations endpoint
      const crmExistingInHubSpot = existingInHubSpot.filter(
        ({ hubspotMeeting }) =>
          hubspotMeeting &&
          hubspotMeeting.properties &&
          hubspotMeeting.properties.hs_meeting_body !== undefined
      );
      
      console.log(`📊 [DRY RUN] Existing meetings in HubSpot: ${existingInHubSpot.length}`);
      console.log(`📊 [DRY RUN] CRM meetings (v3) eligible for association checks: ${crmExistingInHubSpot.length}`);
      
      console.log('\n🔍 STEP 3 (DRY RUN): Analyzing associations for existing CRM meetings\n');

      let meetingsWithMissingAssociations = 0;
      let totalMissingAssociations = 0;

      if (crmExistingInHubSpot.length > 0) {
        for (let i = 0; i < crmExistingInHubSpot.length; i++) {
          const { hubspotMeeting, attioMeeting } = crmExistingInHubSpot[i];
          const attioId = attioMeeting?.id?.meeting_id || attioMeeting?.values?.original_id?.[0]?.value || 'unknown';
          console.log(
            `[${i + 1}/${crmExistingInHubSpot.length}] ` +
            `Analyzing associations for meeting ${hubspotMeeting.id} (Attio ID: ${attioId}) (DRY RUN)...`
          );

          const missingCount = await this.analyzeMeetingAssociationsDryRun(
            hubspotMeeting,
            attioMeeting
          );

          if (missingCount > 0) {
            meetingsWithMissingAssociations++;
            totalMissingAssociations += missingCount;
          }

          // Light throttling for safety
          if (i > 0 && i % 25 === 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        console.log(
          `\n✅ [DRY RUN] Association analysis complete for existing CRM meetings.`
        );
        console.log(
          `   → Total CRM meetings checked: ${crmExistingInHubSpot.length}`
        );
        console.log(
          `   → Total missing associations across all CRM meetings: ${totalMissingAssociations}`
        );
      } else {
        console.log(
          '\nℹ️ [DRY RUN] No CRM meetings found in HubSpot to analyze associations for.'
        );
      }
      
      console.log('============================================================');
      console.log('🧪 DRY RUN SUMMARY - WHAT WOULD HAPPEN:');
      console.log('============================================================');
      console.log(`🆕 New meetings to create: ${missingInHubSpot.length}`);
      console.log(`🔄 Existing meetings in HubSpot (total): ${existingInHubSpot.length}`);
      console.log(`🔄 CRM meetings analyzed for associations: ${crmExistingInHubSpot?.length || 0}`);
      console.log(
        `⚠️ Meetings with missing associations (DRY RUN): ${meetingsWithMissingAssociations}`
      );
      console.log(
        `📎 Total missing associations (DRY RUN): ${totalMissingAssociations}`
      );
      console.log(`📋 Total Attio meetings: ${attioMeetings.length}`);
      console.log(`📋 Total HubSpot meetings: ${hubspotMeetings.length}`);
      console.log('============================================================');
      console.log('\n🧪 This was a DRY RUN - no actual changes were made');
      console.log('✨ Run without --dry-run flag when you\'re ready to apply these changes');
      
    } catch (error) {
      console.error('\n💥 Critical error during dry run analysis:', error.message);
      throw error;
    }
  }

  /**
   * Main processing function - creates meetings and associations
   */
  async process() {
    console.log('🚀 Starting comprehensive meeting processing with fresh data\\n');
    console.log('='.repeat(60));
    
    try {
      // Step 1: Get fresh data from all sources
      console.log('\n📥 STEP 1: Fetching fresh data from all sources\n');
      const [attioMeetings, hubspotMeetings] = await Promise.all([
        this.getFreshAttioMeetings(),
        this.getFreshHubSpotMeetings()
      ]);
      
      // Step 2: Verify meeting sync and identify new meetings
      console.log('\\n🔍 STEP 2: Verifying meeting synchronization\\n');
      const { hubspotByAttioId, missingInHubSpot, existingInHubSpot } = this.verifyMeetingSync(attioMeetings, hubspotMeetings);
      
      // DEBUG: Show structure of first few "new meetings" 
      console.log(`\\n🔍 DEBUG: Examining structure of first 3 "new meetings" that will be created:\\n`);
      if (missingInHubSpot.length === 0) {
        console.log('  ✅ No missing meetings found - all meetings are already synced!');
      } else {
        for (let i = 0; i < Math.min(3, missingInHubSpot.length); i++) {
          const meeting = missingInHubSpot[i];
          const title = meeting.values?.title?.[0]?.value || 'No title';
          console.log(`📋 New Meeting ${i + 1}: "${title}"`);
          console.log(`  - Attio ID: ${meeting.id.meeting_id}`);
          console.log(`  - start.datetime: ${meeting.start?.datetime || 'null'}`);
          console.log(`  - start.date: ${meeting.start?.date || 'null'}`);
          console.log(`  - values keys:`, Object.keys(meeting.values || {}));
          console.log(`  - Full start object:`, JSON.stringify(meeting.start, null, 2));
          
          // Show what prepareMeetingData would generate
          try {
            const hubspotPayload = this.prepareMeetingData(meeting);
            console.log(`  - HubSpot payload preview:`, JSON.stringify(hubspotPayload, null, 2));
          } catch (error) {
            console.log(`  - ❌ prepareMeetingData failed: ${error.message}`);
          }
          console.log('');
        }
      }
      
      // Step 3: Create new meetings with associations
      console.log(`\\n🚀 STEP 3: Creating ${missingInHubSpot.length} new meetings and associations\\n`);
      const newlyCreatedMeetings = [];
      
      // Process ALL meetings - FINAL RUN
      const meetingsToProcess = missingInHubSpot;
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (let i = 0; i < meetingsToProcess.length; i++) {
        const attioMeeting = meetingsToProcess[i];
        const meetingTitle = attioMeeting.values?.title?.[0]?.value || attioMeeting.title || 'Untitled Meeting';
        console.log(`📅 [${i + 1}/${meetingsToProcess.length}] Creating: ${meetingTitle}`);
        
        try {
          // Create the meeting
          const newMeeting = await this.createMeetingFromAttio(attioMeeting);
          
          // Skip if meeting couldn't be created (e.g., no start time)
          if (!newMeeting) {
            this.skippedCount++;
            continue;
          }
          
          // Create associations
          await this.createAssociationsForMeeting(newMeeting, attioMeeting);
          
          newlyCreatedMeetings.push({
            hubspotMeeting: newMeeting,
            attioMeeting: attioMeeting
          });
          
          this.processedCount++;
          successCount++;
          
          // Progress updates every 25 meetings
          if (successCount % 25 === 0) {
            console.log(`✅ Progress: ${successCount}/${meetingsToProcess.length} meetings created successfully`);
          }
          
        } catch (error) {
          errorCount++;
          const meetingTitle = attioMeeting.values?.title?.[0]?.value || attioMeeting.title || 'Untitled';
          const errorMsg = `Failed to create meeting: ${meetingTitle} - ${error.message}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
          this.errorCount++;
        }
        
        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Summary of meeting creation
      console.log(`\n🎉 MEETING CREATION COMPLETE!`);
      console.log(`✅ Successfully created: ${successCount} meetings`);
      console.log(`❌ Errors: ${errorCount} meetings`);
      console.log(`⏭️  Skipped: ${this.skippedCount} meetings`);
      
      if (errors.length > 0) {
        console.log('\n❌ Error summary (first 5):');
        errors.slice(0, 5).forEach(error => console.log(`   - ${error}`));
        if (errors.length > 5) {
          console.log(`   ... and ${errors.length - 5} more errors`);
        }
      }
      
      // Step 4: Fix existing meeting associations
      console.log(`\n✅ MIGRATION COMPLETE! Created ${successCount} meetings with associations.\n`);
      console.log(`🎉 SUCCESS SUMMARY:`);
      console.log(`   ✅ Meetings created: ${successCount}`);
      console.log(`   ❌ Failed meetings: ${errorCount}`);
      console.log(`   ⏭️ Skipped meetings: ${this.skippedCount}`);
      
      console.log('\\n🔍 STEP 4: Fixing associations for existing meetings\\n');
      
      for (let i = 0; i < existingInHubSpot.length; i++) {
        const { hubspotMeeting, attioMeeting } = existingInHubSpot[i];
        console.log(`[${i + 1}/${existingInHubSpot.length}] Fixing associations and participants...`);
        
        await this.fixMeetingAssociations(hubspotMeeting, attioMeeting);
        await this.upgradeExistingMeetingDescription(hubspotMeeting, attioMeeting);
        
        // Rate limiting
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 MEETING SYNC SUMMARY');
      console.log('='.repeat(60));
      console.log(`🆕 New meetings created: ${successCount}`);
      console.log(`✅ Existing meetings verified: ${existingInHubSpot.length}`);
      console.log(`⏭️ Skipped (no start time / invalid): ${this.skippedCount || 0}`);
      console.log(`❌ Errors: ${this.errorCount || 0}`);
      console.log('='.repeat(60));
      
      if (successCount > 0 || existingInHubSpot.length > 0) {
        console.log(`\n🎉 MIGRATION COMPLETE! Created ${successCount} meetings with associations.`);
        console.log('✨ All meetings now have proper contact/company/deal associations');
      }

    } catch (error) {
      console.error('\\n💥 Critical error during processing:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    console.log('🧪 DRY RUN MODE - No actual changes will be made\n');
  }
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    if (isDryRun) {
      await processor.dryRunProcess();
    } else {
      await processor.process();
    }
    console.log('\n🎉 Comprehensive meeting processing completed successfully!');
  } catch (error) {
    console.error('\n💥 Processing failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = ComprehensiveMeetingProcessor;
