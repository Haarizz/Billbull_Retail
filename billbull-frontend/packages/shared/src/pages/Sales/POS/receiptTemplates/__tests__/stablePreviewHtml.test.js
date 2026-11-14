import { describe, it, expect } from 'vitest';
import { createStablePreviewHtml } from '../stablePreviewHtml';

describe('stable checkout preview HTML', () => {
  it('reuses the previous string when only the clock moved, so the iframe does not reload', () => {
    const stable = createStablePreviewHtml();
    const first = stable('<div>Date: 14-11-2026 Time: 09:21:10</div><b>100.00</b>');
    const second = stable('<div>Date: 14-11-2026 Time: 09:21:47</div><b>100.00</b>');
    expect(second).toBe(first);
    expect(stable('<div>Time: 09:22 AM</div>')).toBe('<div>Time: 09:22 AM</div>');
  });

  it('passes real content changes (and a new date) straight through', () => {
    const stable = createStablePreviewHtml();
    stable('<div>Time: 09:21:10</div><b>100.00</b>');
    expect(stable('<div>Time: 09:21:40</div><b>120.00</b>')).toBe('<div>Time: 09:21:40</div><b>120.00</b>');
    expect(stable('<div>15-11-2026 Time: 09:21:40</div>')).toContain('15-11-2026');
  });
});
