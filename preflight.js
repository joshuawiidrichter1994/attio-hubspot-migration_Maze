#!/usr/bin/env node
const SafetyValidator = require('./src/utils/safety-validator');

async function runPreflightChecks() {
  console.log('🚀 PREFLIGHT SAFETY CHECKS FOR MIGRATION\n');
  
  const safety = new SafetyValidator();
  
  try {
    // 1. Run validation
    const validation = await safety.validateBeforeAssociationMigration();
    
    if (!validation.isSafe) {
      console.log('\n❌ PREFLIGHT FAILED - DO NOT RUN MIGRATION');
      process.exit(1);
    }

    // 2. Create backup
    console.log('\n💾 Creating backup...');
    const backupSuccess = await safety.createBackup();
    
    if (!backupSuccess) {
      console.log('❌ BACKUP FAILED - ABORTING');
      process.exit(1);
    }

    // 3. Run dry run
    console.log('\n🧪 Running dry run...');
    const dryRunResults = await safety.dryRunAssociations();
    
    if (!dryRunResults) {
      console.log('❌ DRY RUN FAILED - ABORTING');
      process.exit(1);
    }

    console.log('\n✅ ALL PREFLIGHT CHECKS PASSED');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Review the dry_run_report.json file');
    console.log('2. If satisfied, run: npm run migrate-associations');
    console.log('3. Monitor the progress and check reports');

  } catch (error) {
    console.error('❌ PREFLIGHT CHECKS FAILED:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runPreflightChecks();
}

module.exports = runPreflightChecks;