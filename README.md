# Attio → HubSpot Migration Scripts

This project contains three separate scripts for migrating meetings from Attio to HubSpot with video processing capabilities.

## Scripts Overview

### 1. **Script 1: Meeting Migration** (`comprehensive-meeting-processor.js`)
**Purpose**: Migrates meetings from Attio to HubSpot with proper associations

**What it does**:
- Fetches meetings from Attio
- Creates new meetings in HubSpot
- Sets up associations with contacts, companies, and deals
- Validates meeting times and data integrity
- **Does NOT handle video processing** (use Script 2 for that)

**Usage**:
```bash
# Dry run to see what would be migrated
node src/comprehensive-meeting-processor.js --dry-run

# Run actual migration
node src/comprehensive-meeting-processor.js
```

**Status**: ✅ **COMPLETED** - Successfully migrated 15 meetings with 100% success rate

---

### 2. **Script 2: Video Matching** (`video-matcher.js`)
**Purpose**: Matches uploaded videos to meetings and adds transcripts

**What it does**:
- Gets all uploaded videos from HubSpot
- Matches videos to meetings based on Attio ID in filename
- Retrieves transcripts from Attio
- Updates meeting descriptions with video links and transcripts
- Formats transcripts with speaker identification

**Usage**:
```bash
node src/video-matcher.js
```

**Video Filename Format Expected**: `{attio_meeting_id}_{attio_call_id}.mp4`

**Example**: `rec_123456789_call_987654321.mp4`

---

### 3. **Script 3: Description Formatter** (`description-formatter.js`)
**Purpose**: Standardizes meeting description formatting

**What it does**:
- Finds meetings that already have recording/transcript info
- Reformats descriptions to use standardized format
- Ensures consistent layout across all meetings
- Preserves original meeting content

**Standard Format**:
```
[Original meeting content]

********************
Call recording: [video_url]

Transcript:
[formatted_transcript_with_speakers]
********************
```

**Usage**:
```bash
node src/description-formatter.js
```

---

## Workflow

### Complete Migration Workflow:

1. **First**: Run Script 1 to migrate meetings
   ```bash
   node src/comprehensive-meeting-processor.js
   ```

2. **Second**: Run Script 2 to add videos and transcripts
   ```bash
   node src/video-matcher.js
   ```

3. **Third**: (Optional) Run Script 3 to standardize formatting
   ```bash
   node src/description-formatter.js
   ```
# Run all association migrations
npm run migrate-associations

# Run incremental migration (last 7 days)
npm run incremental-migration

# Verify data and generate reports
npm run verify-data

# Full migration process (all steps)
npm start full
```

### Individual Operations

#### 1. Company & Deal Associations
Migrates missing company and deal associations for existing meetings:
```bash
node src/migrate-associations.js
```

This will:
- Fetch all meetings from both Attio and HubSpot
- Extract company/deal associations from Attio meetings
- Create corresponding associations in HubSpot
- Generate detailed reports

#### 2. Incremental Migration
Handles new meetings created since a specific date:
```bash
# Migrate meetings from last 7 days
node src/incremental-migration.js

# Migrate meetings since specific date
node src/incremental-migration.js 2025-11-01
```

This will:
- Find new Attio meetings since the specified date
- Create missing meetings in HubSpot
- Create all associations (contacts, companies, deals)
- Generate migration reports

#### 3. Data Verification
Comprehensive verification and reporting:
```bash
node src/utils/verify-data.js
```

Generates reports on:
- Migration completeness statistics
- Missing meetings
- Duplicate meetings
- Orphaned records

### Advanced Usage

#### Command Line Interface
```bash
# Interactive menu
node src/index.js

# Direct commands
node src/index.js associations
node src/index.js incremental
node src/index.js verify
node src/index.js full
```

#### Custom Date Ranges
```bash
# Incremental migration for specific period
node src/incremental-migration.js 2025-11-15
```

## File Structure

```
src/
├── index.js                    # Main entry point & CLI
├── migrate-associations.js     # Company/deal association migration
├── incremental-migration.js    # New meetings migration
└── utils/
    ├── attio-api.js           # Attio API client
    ├── hubspot-api.js         # HubSpot API client
    ├── data-manager.js        # Data storage & logging
    └── verify-data.js         # Verification & reporting

data/
├── exports/                   # JSON data exports
└── logs/                     # Migration logs
```

## API Documentation

### Attio API
- Documentation: https://docs.attio.com/rest-api/overview
- Objects: meetings, companies, deals, people
- Rate limits: Respected with automatic delays

### HubSpot API  
- Documentation: https://developers.hubspot.com/docs/api/crm/associations
- Objects: meetings, companies, deals, contacts
- Associations: Uses HubSpot v4 Associations API

## Data Mapping

### Meeting Properties
| Attio Field | HubSpot Property | Notes |
|-------------|------------------|-------|
| `id` | `attio_meeting_id` | Used for correlation |
| `title` | `hs_meeting_title` | Meeting subject |
| `description` | `hs_meeting_body` | Meeting notes |
| `start_time` | `hs_meeting_start_time` | Unix timestamp |
| `end_time` | `hs_meeting_end_time` | Unix timestamp |

### Association Types
| Association | HubSpot Type ID | Description |
|-------------|-----------------|-------------|
| Meeting → Contact | 3 | Meeting attendees |
| Meeting → Company | 6 | Related companies |
| Meeting → Deal | 10 | Associated deals |

## Error Handling

The script includes comprehensive error handling:
- **Rate Limiting**: Automatic delays between API calls
- **Failed Associations**: Logged but don't stop migration
- **Missing Records**: Warnings logged, migration continues
- **API Errors**: Full error details in logs

## Reports & Logs

All operations generate detailed reports in `data/exports/`:

### Migration Reports
- `meeting_company_association_results.json` - Company association results
- `meeting_deal_association_results.json` - Deal association results  
- `incremental_migration_results_[timestamp].json` - Incremental migration results

### Verification Reports
- `meeting_migration_verification.json` - Migration completeness
- `duplicate_meetings_report.json` - Duplicate detection
- `full_verification_report.json` - Complete verification

### Data Exports
- `hubspot_meetings.json` - All HubSpot meetings
- `attio_meetings.json` - All Attio meetings
- `hubspot_companies.json` - All HubSpot companies
- `hubspot_deals.json` - All HubSpot deals

## Troubleshooting

### Common Issues

1. **API Rate Limits**
   - Solution: Scripts include automatic delays
   - Increase delays in API client files if needed

2. **Missing Associations**
   - Check that records exist in both systems
   - Verify ID mapping is correct
   - Review association extraction logic

3. **Authentication Errors**
   - Verify API keys in `.env` file
   - Check API key permissions
   - Ensure tokens haven't expired

### Debug Mode
Enable verbose logging by modifying the API clients to log all requests.

## Final Migration Steps

When ready to complete the migration:

1. **Run Full Process**: `npm start full`
2. **Review Reports**: Check all generated reports for issues
3. **Manual Testing**: Spot-check associations in HubSpot
4. **Final Incremental**: Run one final incremental migration
5. **Set Attio to Read-Only**: Per meeting notes, set permissions to view-only

## Security Notes

- API keys are stored in `.env` (never commit this file)
- All data is processed locally
- No sensitive data is logged in plain text
- Follow client security requirements for data handling

## Support

For issues or questions:
1. Check the generated reports in `data/exports/`
2. Review logs in `data/logs/`
3. Verify API connectivity and permissions
4. Contact the development team with specific error details

---

**Project**: Maze HQ | Custom Integration Support  
**Developer**: Joshua Richter - IFT  
**Timeline**: November 10 - December 12, 2025  
**Phase**: 2 (Associations & Incremental Migration)