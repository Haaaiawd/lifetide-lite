#requires -Version 7.0

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-Contains {
  param([string]$Path, [string]$Needle)
  $content = Get-Content -LiteralPath (Join-Path $repoRoot $Path) -Raw
  if (-not $content.Contains($Needle)) {
    $failures.Add("MISSING_CONSTANT $Path :: $Needle")
  }
}

function Assert-NotContains {
  param([string]$Path, [string]$Needle)
  $content = Get-Content -LiteralPath (Join-Path $repoRoot $Path) -Raw
  if ($content.Contains($Needle)) {
    $failures.Add("FORBIDDEN_CONSTANT $Path :: $Needle")
  }
}

$jsonFiles = Get-ChildItem (Join-Path $repoRoot ".loom") -Recurse -File -Filter "*.json"
foreach ($file in $jsonFiles) {
  try {
    Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json | Out-Null
  } catch {
    $failures.Add("BAD_JSON $($file.FullName) :: $($_.Exception.Message)")
  }
}

$markdownFiles = @(
  Get-ChildItem (Join-Path $repoRoot ".loom") -Recurse -File -Filter "*.md"
  Get-ChildItem (Join-Path $repoRoot "prompts") -Recurse -File -Filter "*.md"
)

foreach ($file in $markdownFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  $fenceCount = ([regex]::Matches($content, '```')).Count
  if ($fenceCount % 2 -ne 0) {
    $failures.Add("ODD_FENCE $($file.FullName) :: $fenceCount")
  }

  foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\(([^)]+)\)')) {
    $target = $match.Groups[1].Value.Split('#')[0]
    if ($target -and $target -notmatch '^(https?:|mailto:|/)') {
      $resolved = Join-Path $file.DirectoryName $target
      if (-not (Test-Path -LiteralPath $resolved)) {
        $failures.Add("BROKEN_LINK $($file.FullName) -> $target")
      }
    }
  }
}

$operationalPrompts = @(
  "prompts/interviewer-v2.md",
  "prompts/sensemaker-wave-v2.md",
  "prompts/odyssey-generator-v2.md",
  "prompts/prototype-designer-v2.md",
  "prompts/blueprint-writer-v2.md",
  "prompts/sensemaker-chat-v3.md"
)
$promptSections = @("contract_revision: 3", "Single responsibility", "Inputs", "Authority", "Self-check", "Failure behavior")
foreach ($prompt in $operationalPrompts) {
  foreach ($section in $promptSections) {
    Assert-Contains -Path $prompt -Needle $section
  }
}

$constantChecks = @(
  @(".loom/PROJECT.md", "默认共 3 波"),
  @(".loom/PROJECT.md", "总数不超过 5"),
  @(".loom/design/conversational-six-dimension-harness.md", "5–10 个单一决策目标"),
  @(".loom/design/conversational-six-dimension-harness.md", "允许 1–3 题"),
  @(".loom/design/conversational-six-dimension-harness.md", "最多 2 个深挖波"),
  @(".loom/design/insight-plan-contracts.md", "type SourceRef"),
  @(".loom/design/insight-plan-contracts.md", "type ElicitationUnitProposal"),
  @(".loom/design/insight-plan-contracts.md", "type OpeningQuestionProposal"),
  @(".loom/design/insight-plan-contracts.md", "type ContinuationQuestionProposal"),
  @(".loom/design/insight-plan-contracts.md", "order_in_wave"),
  @(".loom/design/insight-plan-contracts.md", "type DeepDiveRecommendation"),
  @(".loom/design/insight-plan-contracts.md", "type QuestionOptionProposal"),
  @(".loom/design/insight-plan-contracts.md", "type GenerationProvenance"),
  @(".loom/design/insight-plan-contracts.md", "generation_provenance_id"),
  @(".loom/design/insight-plan-contracts.md", "provisional_allowed"),
  @(".loom/design/insight-plan-contracts.md", "deriveRouteReadiness(snapshot)"),
  @(".loom/design/insight-plan-contracts.md", "type SafetyFlag"),
  @(".loom/design/insight-plan-contracts.md", 'life_shape: Record<LifeShapeAxis, string>'),
  @(".loom/design/insight-plan-contracts.md", 'op: "supersede_claim"'),
  @(".loom/design/insight-plan-contracts.md", "attractions: string[]"),
  @(".loom/design/insight-plan-contracts.md", "costs_and_tradeoffs: string[]"),
  @(".loom/design/insight-plan-contracts.md", "evidence_for: EvidenceLink[]"),
  @(".loom/design/insight-plan-contracts.md", "type TrialInstance"),
  @(".loom/design/state-and-persistence-protocol.md", "type EventEnvelope"),
  @(".loom/design/state-and-persistence-protocol.md", "type ProposalEnvelope"),
  @(".loom/design/state-and-persistence-protocol.md", "source: SourceVersion"),
  @(".loom/design/state-and-persistence-protocol.md", "reflect_on_trial"),
  @(".loom/design/state-and-persistence-protocol.md", "SESSION_PAUSED"),
  @(".loom/design/state-and-persistence-protocol.md", "SAFETY_BOUNDARY_TRIGGERED"),
  @("prompts/PROMPT-ARCHITECTURE.md", "two runtime roles"),
  @("prompts/PROMPT-ARCHITECTURE.md", 'attractions`'),
  @("prompts/PROMPT-ARCHITECTURE.md", "SourceRef(source_id, source_revision)")
)
foreach ($check in $constantChecks) {
  Assert-Contains -Path $check[0] -Needle $check[1]
}

$contract = Get-Content -LiteralPath (Join-Path $repoRoot ".loom\design\insight-plan-contracts.md") -Raw
foreach ($forbidden in @("source_ids:", "known_source_ids:", "reason_source_id:", "gains: string[]", "losses: string[]")) {
  if ($contract.Contains($forbidden)) {
    $failures.Add("STALE_CONTRACT_FIELD insight-plan-contracts.md :: $forbidden")
  }
}

Assert-NotContains -Path ".loom/design/adaptive-interview-system.md" -Needle "type WaveMissionProposal"
Assert-NotContains -Path ".loom/design/adaptive-interview-system.md" -Needle "type InterviewerTurnProposal"
Assert-NotContains -Path ".loom/design/adaptive-interview-system.md" -Needle "type DeepDiveProposal"
Assert-NotContains -Path ".loom/design/adaptive-interview-system.md" -Needle "mission_id:"
Assert-NotContains -Path ".loom/design/state-and-persistence-protocol.md" -Needle "source?: SourceVersion"
Assert-NotContains -Path ".loom/design/insight-plan-contracts.md" -Needle "proposed_mission"
Assert-NotContains -Path ".loom/design/insight-plan-contracts.md" -Needle "update_claim"
Assert-NotContains -Path ".loom/design/insight-plan-contracts.md" -Needle "life_shape_axes"
Assert-NotContains -Path ".loom/design/insight-plan-contracts.md" -Needle "SafetyAssessment"

$decisionText = Get-Content -LiteralPath (Join-Path $repoRoot ".loom\DECISIONS.md") -Raw
$decisionIds = [regex]::Matches($decisionText, '(?m)^## (D-\d+):') | ForEach-Object { $_.Groups[1].Value }
$duplicateDecisionIds = $decisionIds | Group-Object | Where-Object Count -gt 1
foreach ($duplicate in $duplicateDecisionIds) {
  $failures.Add("DUPLICATE_CURRENT_DECISION_ID $($duplicate.Name)")
}

$changedPaths = git -C $repoRoot status --short | ForEach-Object { $_.Substring(3).Trim('"') }
foreach ($path in $changedPaths) {
  if ($path -notlike ".loom/*" -and $path -notlike "prompts/*") {
    $failures.Add("OUT_OF_SCOPE_CHANGE $path")
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "HARNESS_LINT_OK"
Write-Output "json=$($jsonFiles.Count) markdown=$($markdownFiles.Count) prompts=$($operationalPrompts.Count) decisions=$($decisionIds.Count)"
