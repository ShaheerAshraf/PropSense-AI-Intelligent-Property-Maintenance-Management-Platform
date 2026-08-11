import { Type } from '@google/genai';
import {
  AiSafetyLevel,
  AiSeverity,
  MaintenanceCategory,
  MaintenancePriority,
} from '../generated/prisma/client';

export const SAFETY_DISCLAIMER =
  'Automated AI assessment only — not a professional safety inspection. Have a qualified person verify hazards before acting.';

export const SMART_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: Object.values(MaintenanceCategory),
    },
    priority: {
      type: Type.STRING,
      enum: Object.values(MaintenancePriority),
      description:
        'Recommended priority only. Do not change the owner request priority.',
    },
    summary: {
      type: Type.STRING,
      description:
        'Short owner/technician summary covering issue, likely cause, and recommended action.',
    },
    possibleCause: { type: Type.STRING },
    recommendedAction: {
      type: Type.STRING,
      description: 'Recommend inspection/next step only. Do not authorize repairs.',
    },
    visibleIssue: { type: Type.STRING },
    severity: {
      type: Type.STRING,
      enum: Object.values(AiSeverity),
    },
    safetyLevel: {
      type: Type.STRING,
      enum: Object.values(AiSafetyLevel),
    },
    safetyWarning: {
      type: Type.STRING,
      description: 'Concrete hazard note if any, else empty string',
    },
    categoryConfidence: { type: Type.NUMBER },
    priorityConfidence: { type: Type.NUMBER },
    confidenceScore: { type: Type.NUMBER },
    humanReviewRecommended: { type: Type.BOOLEAN },
    issueClearlyVisible: { type: Type.BOOLEAN },
  },
  required: [
    'category',
    'priority',
    'summary',
    'possibleCause',
    'recommendedAction',
    'severity',
    'safetyLevel',
    'safetyWarning',
    'categoryConfidence',
    'priorityConfidence',
    'confidenceScore',
    'humanReviewRecommended',
  ],
  propertyOrdering: [
    'category',
    'priority',
    'summary',
    'possibleCause',
    'recommendedAction',
    'visibleIssue',
    'severity',
    'safetyLevel',
    'safetyWarning',
    'categoryConfidence',
    'priorityConfidence',
    'confidenceScore',
    'humanReviewRecommended',
    'issueClearlyVisible',
  ],
};

export function buildSmartAnalysisPrompt(input: {
  mode: 'TEXT' | 'IMAGE' | 'TEXT_IMAGE';
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
}) {
  const lines = [
    'You are a property maintenance triage assistant.',
    'Return JSON only.',
    'Recommend category, priority, severity, and safetyLevel.',
    'Never authorize repairs or change the owner request automatically.',
    'Recommended action must be an inspection/next-step suggestion only.',
    'safetyLevel values: NORMAL (cosmetic/minor), CAUTION (water leak, moderate hazard), URGENT (exposed wiring, gas, structural collapse risk).',
    'Always treat safetyLevel as an automated assessment, not a professional inspection.',
    'confidence scores must be numbers from 0 to 1.',
    'If confidence is low (<0.55 overall or on category/priority), set humanReviewRecommended=true.',
    'Use only these categories:',
    Object.values(MaintenanceCategory).join(', '),
    'Use only these priorities:',
    Object.values(MaintenancePriority).join(', '),
    'Use only these severities:',
    Object.values(AiSeverity).join(', '),
    'Use only these safety levels:',
    Object.values(AiSafetyLevel).join(', '),
    '',
    `Analysis mode: ${input.mode}`,
    'Maintenance request:',
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Current owner category (do not overwrite): ${input.category}`,
    `Current owner priority (do not overwrite): ${input.priority}`,
  ];

  if (input.mode === 'IMAGE' || input.mode === 'TEXT_IMAGE') {
    lines.push(
      '',
      'An image is attached.',
      'Combine the written description with visible evidence into one analysis.',
      'If the image is unclear, say so in visibleIssue and lower confidence.',
    );
  }

  return lines.join('\n');
}
