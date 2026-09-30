import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';

import useGlobalSearchShortcut, { isTextEntryTarget } from '../useGlobalSearchShortcut';

const Harness = ({ onTrigger, enabled }) => {
  useGlobalSearchShortcut(onTrigger, enabled === undefined ? undefined : { enabled });
  return (
    <div>
      <input aria-label="text input" />
      <textarea aria-label="text area" />
      <select aria-label="select box">
        <option>a</option>
      </select>
      <div aria-label="rich editor" contentEditable suppressContentEditableWarning>
        editable
      </div>
      <div aria-label="editor child" contentEditable suppressContentEditableWarning>
        <span aria-label="nested span">nested</span>
      </div>
      <button type="button">plain button</button>
    </div>
  );
};

describe('useGlobalSearchShortcut', () => {
  let onTrigger;

  beforeEach(() => {
    onTrigger = vi.fn();
    cleanup();
  });

  it('fires on Ctrl+X outside editable elements', () => {
    render(<Harness onTrigger={onTrigger} />);
    fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('fires on Cmd+X (metaKey, macOS)', () => {
    render(<Harness onTrigger={onTrigger} />);
    fireEvent.keyDown(document.body, { key: 'x', metaKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('matches the key case-insensitively', () => {
    render(<Harness onTrigger={onTrigger} />);
    fireEvent.keyDown(document.body, { key: 'X', ctrlKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('calls preventDefault only when it handles the keystroke', () => {
    render(<Harness onTrigger={onTrigger} />);

    const handled = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true, bubbles: true });
    document.body.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);

    const unrelated = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true });
    document.body.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
  });

  it('does not intercept while focus is in an input', () => {
    render(<Harness onTrigger={onTrigger} />);
    const input = screen.getByLabelText('text input');
    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true, bubbles: true });
    input.dispatchEvent(event);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not intercept while focus is in a textarea', () => {
    render(<Harness onTrigger={onTrigger} />);
    const event = new KeyboardEvent('keydown', { key: 'x', metaKey: true, cancelable: true, bubbles: true });
    screen.getByLabelText('text area').dispatchEvent(event);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not intercept while focus is in a select', () => {
    render(<Harness onTrigger={onTrigger} />);
    fireEvent.keyDown(screen.getByLabelText('select box'), { key: 'x', ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does not intercept inside a contenteditable element', () => {
    render(<Harness onTrigger={onTrigger} />);
    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true, bubbles: true });
    screen.getByLabelText('rich editor').dispatchEvent(event);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not intercept inside a node nested in a contenteditable element', () => {
    render(<Harness onTrigger={onTrigger} />);
    fireEvent.keyDown(screen.getByLabelText('nested span'), { key: 'x', ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('ignores events another handler already claimed', () => {
    render(<Harness onTrigger={onTrigger} />);
    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true, bubbles: true });
    event.preventDefault();
    document.body.dispatchEvent(event);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('ignores plain x and Ctrl+Alt+X', () => {
    render(<Harness onTrigger={onTrigger} />);
    fireEvent.keyDown(document.body, { key: 'x' });
    fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true, altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    render(<Harness onTrigger={onTrigger} enabled={false} />);
    fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    const { unmount } = render(<Harness onTrigger={onTrigger} />);
    unmount();
    fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  describe('isTextEntryTarget', () => {
    it('recognises form controls and rejects non-editable elements', () => {
      const input = document.createElement('input');
      const div = document.createElement('div');
      expect(isTextEntryTarget(input)).toBe(true);
      expect(isTextEntryTarget(div)).toBe(false);
      expect(isTextEntryTarget(null)).toBe(false);
    });

    it('recognises an explicit role="textbox"', () => {
      const el = document.createElement('div');
      el.setAttribute('role', 'textbox');
      document.body.appendChild(el);
      expect(isTextEntryTarget(el)).toBe(true);
      el.remove();
    });
  });
});
