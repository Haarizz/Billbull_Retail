import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DateFilter from '../DateFilter';

afterEach(cleanup);

describe('DateFilter loading indicator', () => {
    it('shows a spinner in the box while the list is loading', () => {
        const { rerender } = render(<DateFilter onChange={() => {}} loading />);
        const box = screen.getByRole('button', { name: /today/i });
        expect(box.getAttribute('aria-busy')).toBe('true');
        expect(screen.getByLabelText('Loading')).toBeTruthy();

        rerender(<DateFilter onChange={() => {}} loading={false} />);
        expect(box.getAttribute('aria-busy')).toBe('false');
        expect(screen.queryByLabelText('Loading')).toBeNull();
    });

    it('still reports the chosen range', () => {
        const onChange = vi.fn();
        render(<DateFilter onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: /today/i }));
        fireEvent.click(screen.getByRole('button', { name: 'This Year' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].fromDate).toMatch(/^\d{4}-01-01$/);
    });
});
