import { describe, it, expect } from 'vitest';
import {
  MAX_PROPOSED_TASKS,
  MAX_TITLE_LENGTH,
  buildPlannerUserPrompt,
  cleanProposedTasks,
} from '../lib/planner';

const titles = (raw: unknown, opts?: { max?: number }) => cleanProposedTasks(raw, opts).map((t) => t.title);

describe('cleanProposedTasks', () => {
  it('accepts an array of strings and trims each title', () => {
    expect(titles(['  Draft the outline  ', 'Book a venue'])).toEqual(['Draft the outline', 'Book a venue']);
  });

  it('accepts the { tasks: [{ title }] } shape', () => {
    expect(titles({ tasks: [{ title: 'Sketch the API' }, { title: 'Write tests' }] })).toEqual([
      'Sketch the API',
      'Write tests',
    ]);
  });

  it('drops empty and whitespace-only titles', () => {
    expect(titles(['Real task', '', '   ', { title: '' }])).toEqual(['Real task']);
  });

  it('removes case-insensitive duplicates, keeping the first', () => {
    expect(titles(['Book venue', 'book VENUE', 'Book Venue'])).toEqual(['Book venue']);
  });

  it('strips leading list markers the model may emit', () => {
    expect(titles(['1. First step', '2) Second step', '- Third step', '* Fourth step'])).toEqual([
      'First step',
      'Second step',
      'Third step',
      'Fourth step',
    ]);
  });

  it('collapses internal whitespace', () => {
    expect(titles(['Plan   the    trip'])).toEqual(['Plan the trip']);
  });

  it(`caps the count at ${MAX_PROPOSED_TASKS} by default`, () => {
    const many = Array.from({ length: 20 }, (_, i) => `Task ${i}`);
    expect(cleanProposedTasks(many)).toHaveLength(MAX_PROPOSED_TASKS);
  });

  it('respects a custom max', () => {
    expect(titles(['a', 'b', 'c', 'd'], { max: 2 })).toEqual(['a', 'b']);
  });

  it('truncates an over-long title', () => {
    const long = 'x'.repeat(MAX_TITLE_LENGTH + 50);
    const [only] = cleanProposedTasks([long]);
    expect(only.title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('returns [] for non-list / garbage input (untrusted model output)', () => {
    expect(cleanProposedTasks(null)).toEqual([]);
    expect(cleanProposedTasks('nope')).toEqual([]);
    expect(cleanProposedTasks(42)).toEqual([]);
    expect(cleanProposedTasks({ nope: true })).toEqual([]);
    expect(cleanProposedTasks([1, true, null, {}])).toEqual([]);
  });
});

describe('buildPlannerUserPrompt', () => {
  it('includes the goal title', () => {
    expect(buildPlannerUserPrompt({ title: 'Run a marathon', description: '' })).toContain('Goal: Run a marathon');
  });

  it('includes details when a description is present', () => {
    const prompt = buildPlannerUserPrompt({ title: 'Run a marathon', description: 'Sub-4 hours' });
    expect(prompt).toContain('Details: Sub-4 hours');
  });

  it('omits the details line when the description is empty', () => {
    expect(buildPlannerUserPrompt({ title: 'Run a marathon', description: '   ' })).not.toContain('Details:');
  });
});
