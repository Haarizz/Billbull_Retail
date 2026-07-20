import toast from 'react-hot-toast';

export async function copyToClipboard(text, label = 'Copied') {
    try {
        await navigator.clipboard.writeText(String(text ?? ''));
        toast.success(`${label} copied to clipboard`);
    } catch {
        toast.error(`Could not copy ${label.toLowerCase()}`);
    }
}
