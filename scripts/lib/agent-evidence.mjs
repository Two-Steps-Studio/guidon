/** RoG-1 report linting only: declarations are not independently verified facts. */
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && !/^(TODO|TBD|placeholder)$/i.test(value.trim());
const list = value => Array.isArray(value) && value.length > 0 && value.every(text);

export function checkAgentEvidence(report) {
  const issues=[];
  const requireField=(gate,condition,code)=>{if(!condition)issues.push({gate,code});};
  if(!object(report))return {version:'RoG-1',valid:false,readyForHumanReview:false,evidenceVerified:false,humanApprovalVerified:false,issues:[{gate:'G1',code:'report_object_required'}]};
  requireField('G1',report.version==='RoG-1','unsupported_version');
  for(const field of ['projectId','taskId'])requireField('G1',typeof report[field]==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report[field]),`${field}_uuid_required`);
  requireField('G1',text(report.sourceRevision),'source_revision_required');
  requireField('G1',Array.isArray(report.sources)&&report.sources.length>0&&report.sources.every(source=>object(source)&&text(source.reference)&&text(source.version)),'versioned_sources_required');
  const status=object(report.status)?report.status:{};
  requireField('G2',['succeeded','partial','failed','blocked'].includes(status.outcome),'outcome_required');
  requireField('G2',text(status.observedColumn)&&text(status.summary),'observed_status_and_summary_required');
  requireField('G2',status.handoff==='human_review','human_review_handoff_required');
  if(status.outcome!=='succeeded')requireField('G2',text(status.blocker),'unfinished_work_reason_required');
  requireField('G3',list(report.evidence),'evidence_references_required');
  requireField('G3',list(report.acceptanceCriteria),'acceptance_criteria_required');
  const runs=Array.isArray(report.regression)?report.regression:[];
  requireField('G4',runs.length>0&&runs.every(run=>object(run)&&text(run.command)&&['passed','failed','not_run'].includes(run.result)&&text(run.artifact)&&text(run.sourceRevision)),'regression_runs_required');
  requireField('G4',runs.length>0&&runs.every(run=>object(run)&&run.result==='passed'&&run.sourceRevision===report.sourceRevision),'passing_current_revision_required');
  const safety=object(report.safety)?report.safety:{};
  requireField('G5',text(safety.scope)&&text(safety.findings)&&list(safety.evidence),'safety_review_required');
  requireField('G5',typeof safety.approvalRequired==='boolean','approval_requirement_required');
  if(safety.approvalRequired===true)requireField('G5',text(safety.approvalReference),'approval_reference_required');
  const rollback=object(report.rollback)?report.rollback:{};
  requireField('G6',list(rollback.steps)&&text(rollback.verification),'rollback_and_verification_required');
  const valid=issues.length===0;
  return {version:'RoG-1',valid,readyForHumanReview:valid,evidenceVerified:false,humanApprovalVerified:false,issues};
}
